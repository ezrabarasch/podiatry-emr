// Stedi professional-claims client + response parsers. Pure parsers (testable offline)
// plus two thin fetch wrappers. JSON paths follow Stedi's docs: the synchronous
// submission response (initial 277CA as X12), the Get 277CA / Get 835 report APIs,
// and Standard Webhooks signing for event destinations.
import { createHmac, timingSafeEqual } from 'crypto'

const SUBMIT_URL = 'https://healthcare.us.stedi.com/2024-04-01/change/medicalnetwork/professionalclaims/v3/submission'
const REPORT_URL = 'https://healthcare.us.stedi.com/2024-04-01/change/medicalnetwork/reports/v2'

/** Claims key, falling back to the eligibility key (Stedi keys are not product-scoped). */
export const stediClaimsKey = (): string | null => process.env.STEDI_CLAIMS_API_KEY || process.env.STEDI_API_KEY || null

const asRecord = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {})
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : v == null ? [] : [v])
const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '')
const num = (v: unknown): number | null => { const n = typeof v === 'number' ? v : parseFloat(str(v)); return Number.isFinite(n) ? n : null }

// ── submission ───────────────────────────────────────────────────────────────

export interface SubmitResult { httpStatus: number; body: Record<string, unknown>; networkError?: string }

export async function submitToStedi(payload: Record<string, unknown>): Promise<SubmitResult> {
  const key = stediClaimsKey()
  if (!key) return { httpStatus: 0, body: {}, networkError: 'STEDI_CLAIMS_API_KEY / STEDI_API_KEY is not configured' }
  try {
    const res = await fetch(SUBMIT_URL, {
      method: 'POST',
      headers: { Authorization: key, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60_000),
    })
    const text = await res.text()
    let body: Record<string, unknown>
    try { body = asRecord(JSON.parse(text)) } catch { body = { raw: text.slice(0, 2000) } }
    return { httpStatus: res.status, body }
  } catch (e) {
    return { httpStatus: 0, body: {}, networkError: e instanceof Error ? e.message : String(e) }
  }
}

export async function fetchReport(kind: '277' | '835', transactionId: string): Promise<Record<string, unknown>> {
  const key = stediClaimsKey()
  if (!key) throw new Error('Stedi API key is not configured')
  const res = await fetch(`${REPORT_URL}/${encodeURIComponent(transactionId)}/${kind}`, {
    headers: { Authorization: key, 'Accept-Encoding': 'gzip' },
    signal: AbortSignal.timeout(60_000),
  })
  if (!res.ok) throw new Error(`Stedi ${kind} report ${transactionId}: HTTP ${res.status}`)
  return asRecord(await res.json())
}

// ── 277CA ────────────────────────────────────────────────────────────────────

export interface StatusCode { category: string; statusCode: string; entity?: string; effectiveDate?: string; message?: string }
export type AckOutcome = 'accepted' | 'rejected' | 'unknown'

// X12 277CA claim status categories. A0-A2 = acknowledged/accepted; A3,A4,A6,A7,A8 and
// E* = rejected (never reached adjudication: fix the data and resubmit).
const ACCEPT_CATS = new Set(['A0', 'A1', 'A2', 'A5'])
const REJECT_CATS = new Set(['A3', 'A4', 'A6', 'A7', 'A8', 'E0', 'E1', 'E2', 'E3', 'E4'])
export const CATEGORY_TEXT: Record<string, string> = {
  A0: 'Acknowledgement/forwarded to the payer', A1: 'Acknowledgement/receipt - claim received', A2: 'Acknowledgement/acceptance into the adjudication system',
  A3: 'Acknowledgement/returned as unprocessable', A4: 'Acknowledgement/not found', A5: 'Acknowledgement/split claim',
  A6: 'Rejected for missing information', A7: 'Rejected for invalid information', A8: 'Rejected for a relational field in error',
}

export function outcomeOf(codes: StatusCode[]): AckOutcome {
  if (codes.some(c => REJECT_CATS.has(c.category))) return 'rejected'
  if (codes.some(c => ACCEPT_CATS.has(c.category))) return 'accepted'
  return 'unknown'
}

/** Status codes from the initial 277CA (X12) in a synchronous submission response. */
export function parseX12Statuses(x12: string): StatusCode[] {
  const raw = x12.replace(/[\r\n]+/g, '')
  if (!raw.startsWith('ISA') || raw.length < 106) return []
  const el = raw[3], seg = raw[105], sub = raw[104]
  const out: StatusCode[] = []
  for (const s of raw.split(seg)) {
    if (!s.startsWith(`STC${el}`)) continue
    const f = s.split(el)
    const [category = '', statusCode = '', entity = ''] = (f[1] ?? '').split(sub)
    if (category) out.push({ category, statusCode, entity: entity || undefined, effectiveDate: f[2] || undefined, message: f[12] || undefined })
  }
  return out
}

export interface Parsed277 { pcn: string; correlationId?: string; codes: StatusCode[]; effectiveDate?: string }

/** Get 277CA Report JSON -> one entry per claim (matched by patient control number). */
export function parse277Report(json: Record<string, unknown>): Parsed277[] {
  const out: Parsed277[] = []
  for (const t of arr(json.transactions)) for (const p of arr(asRecord(t).payers)) for (const cst of arr(asRecord(p).claimStatusTransactions)) {
    const batch = str(asRecord(cst).claimTransactionBatchNumber) || undefined
    for (const d of arr(asRecord(cst).claimStatusDetails)) for (const pd of arr(asRecord(d).patientClaimStatusDetails)) for (const c of arr(asRecord(pd).claims)) {
      const cs = asRecord(asRecord(c).claimStatus)
      // Docs: match on referencedTransactionTraceNumber (some payers truncate patientAccountNumber).
      const pcn = str(cs.referencedTransactionTraceNumber) || str(cs.patientAccountNumber)
      if (!pcn) continue
      const codes: StatusCode[] = []
      let effectiveDate: string | undefined
      for (const ics of arr(cs.informationClaimStatuses)) {
        const r = asRecord(ics)
        effectiveDate = str(r.statusInformationEffectiveDate) || effectiveDate
        for (const s of arr(r.informationStatuses)) {
          const x = asRecord(s)
          codes.push({ category: str(x.healthCareClaimStatusCategoryCode), statusCode: str(x.statusCode), entity: str(x.entityIdentifierCode) || undefined, message: str(x.statusCodeValue) || undefined })
        }
      }
      out.push({ pcn, correlationId: batch, codes, effectiveDate })
    }
  }
  return out
}

// ── 835 ERA ──────────────────────────────────────────────────────────────────

export interface ReasonCode { group: string; code: string; description: string; amount: number }
export interface RemarkCode { code: string; description: string }
export interface ParsedEraLine { lineControlNumber?: string; procedureCode?: string; charge: number | null; paid: number | null; allowed: number | null; adjustments: ReasonCode[]; remarks: RemarkCode[] }
export interface ParsedEra { pcn: string; claimStatusCode: string; charge: number | null; paid: number | null; patientResponsibility: number | null; adjustments: ReasonCode[]; lines: ParsedEraLine[]; traceNumber?: string }

function adjustmentsOf(list: unknown): ReasonCode[] {
  const out: ReasonCode[] = []
  for (const a of arr(list)) {
    const r = asRecord(a)
    for (let i = 1; i <= 6; i++) {
      const code = str(r[`adjustmentReasonCode${i}`])
      if (!code) continue
      out.push({ group: str(r.claimAdjustmentGroupCode), code, description: str(r[`adjustmentReason${i}`]), amount: num(r[`adjustmentAmount${i}`]) ?? 0 })
    }
  }
  return out
}

/** Get 835 ERA Report JSON -> one entry per claim payment. */
export function parseEraReport(json: Record<string, unknown>): ParsedEra[] {
  const out: ParsedEra[] = []
  for (const t of arr(json.transactions)) {
    const tr = asRecord(t)
    const trace = str(asRecord(tr.paymentAndRemitReassociationDetails).checkOrEFTTraceNumber) || undefined
    for (const d of arr(tr.detailInfo)) for (const pi of arr(asRecord(d).paymentInfo)) {
      const p = asRecord(pi)
      const cp = asRecord(p.claimPaymentInfo)
      const pcn = str(cp.patientControlNumber)
      if (!pcn) continue
      const lines: ParsedEraLine[] = arr(p.serviceLines).map(l => {
        const r = asRecord(l)
        const sp = asRecord(r.servicePaymentInformation)
        const remarks: RemarkCode[] = arr(r.healthCareCheckRemarkCodes).map(x => ({ code: str(asRecord(x).remarkCode), description: str(asRecord(x).remark) })).filter(x => x.code)
        return {
          lineControlNumber: str(r.lineItemControlNumber) || undefined,
          procedureCode: str(sp.adjudicatedProcedureCode) || undefined,
          charge: num(sp.lineItemChargeAmount), paid: num(sp.lineItemProviderPaymentAmount),
          allowed: num(asRecord(r.serviceSupplementalAmounts).allowedActual),
          adjustments: adjustmentsOf(r.serviceAdjustments), remarks,
        }
      })
      out.push({
        pcn, claimStatusCode: str(cp.claimStatusCode), charge: num(cp.totalClaimChargeAmount), paid: num(cp.claimPaymentAmount),
        patientResponsibility: num(cp.patientResponsibilityAmount), adjustments: adjustmentsOf(p.claimAdjustments), lines, traceNumber: trace,
      })
    }
  }
  return out
}

export type EraStatus = 'Denied' | 'PartialPaidPending' | 'FullPaidClosed'
export interface EraOutcome {
  status: EraStatus
  totalAllowed: number | null; totalPaid: number; totalAdjustment: number; patientResponsibility: number
  lines: Array<{ lineNumber: number; allowed: number | null; paid: number; adjustment: number; reasons: ReasonCode[]; remarks: RemarkCode[] }>
  reasons: ReasonCode[]   // claim-level reasons (falls back to the line-level ones): what a denial is grouped by
  summary: string
}

const r2 = (n: number): number => Math.round(n * 100) / 100
const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0)
export const reasonLabel = (r: { group: string; code: string }): string => `${r.group || '??'}-${r.code}`

/** What an 835 means for our claim: status, money totals, and per-line results. */
export function computeEraOutcome(claimCharges: number, era: ParsedEra, ours: Array<{ lineNumber: number; lineControlNumber: string | null; cptCode: string }>): EraOutcome {
  const used = new Set<number>()
  const lineNo = (l: ParsedEraLine): number | null => {
    const byControl = ours.find(o => !used.has(o.lineNumber) && o.lineControlNumber && o.lineControlNumber === l.lineControlNumber)
    const hit = byControl ?? ours.find(o => !used.has(o.lineNumber) && o.cptCode === l.procedureCode)
    if (!hit) return null
    used.add(hit.lineNumber)
    return hit.lineNumber
  }
  const lines = era.lines.flatMap(l => {
    const n = lineNo(l)
    if (n == null) return []
    const adj = sum(l.adjustments.filter(a => a.group !== 'PR').map(a => a.amount))
    return [{ lineNumber: n, allowed: l.allowed, paid: l.paid ?? 0, adjustment: r2(adj), reasons: l.adjustments, remarks: l.remarks }]
  })
  const paid = era.paid ?? sum(lines.map(l => l.paid))
  const claimAdj = era.adjustments.length ? era.adjustments : era.lines.flatMap(l => l.adjustments)
  const patientResp = era.patientResponsibility ?? sum(claimAdj.filter(a => a.group === 'PR').map(a => a.amount))
  const adjustment = sum(claimAdj.filter(a => a.group !== 'PR').map(a => a.amount))
  const co = sum(claimAdj.filter(a => a.group === 'CO').map(a => a.amount))
  const allowed = era.lines.length && era.lines.every(l => l.allowed != null) ? sum(era.lines.map(l => l.allowed ?? 0)) : r2(claimCharges - co)
  const outstanding = claimCharges - paid - adjustment - patientResp
  const status: EraStatus = paid <= 0.005 || era.claimStatusCode === '4' ? 'Denied' : outstanding <= 0.01 ? 'FullPaidClosed' : 'PartialPaidPending'
  const reasons = claimAdj.length ? claimAdj : era.lines.flatMap(l => l.adjustments)
  const codes = [...new Set(reasons.map(reasonLabel))].join(', ')
  const summary = status === 'Denied'
    ? `Denied: $0.00 paid of $${r2(claimCharges).toFixed(2)} billed${codes ? ` (${codes})` : ''}`
    : `Paid $${r2(paid).toFixed(2)} of $${r2(claimCharges).toFixed(2)} billed${codes ? `; ${codes}` : ''}${patientResp ? `; patient responsibility $${r2(patientResp).toFixed(2)}` : ''}`
  return { status, totalAllowed: allowed, totalPaid: r2(paid), totalAdjustment: r2(adjustment), patientResponsibility: r2(patientResp), lines, reasons, summary }
}

// ── webhook signature (Standard Webhooks, as used by Stedi event destinations) ──

/** Verify `webhook-signature` over `${id}.${timestamp}.${rawBody}` with the whsec_ secret. */
export function verifyStediSignature(h: { id: string | null; timestamp: string | null; signature: string | null }, rawBody: string, secret: string, nowSec: number = Math.floor(Date.now() / 1000)): boolean {
  if (!h.id || !h.timestamp || !h.signature || !secret) return false
  const ts = Number(h.timestamp)
  if (!Number.isFinite(ts) || Math.abs(nowSec - ts) > 300) return false // replay window: 5 minutes
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  const expected = createHmac('sha256', key).update(`${h.id}.${h.timestamp}.${rawBody}`).digest()
  return h.signature.split(' ').some(part => {
    const [version, sig] = part.split(',')
    if (version !== 'v1' || !sig) return false
    const got = Buffer.from(sig, 'base64')
    return got.length === expected.length && timingSafeEqual(got, expected)
  })
}
