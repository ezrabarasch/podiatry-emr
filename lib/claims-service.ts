// Billing claims: DB workflow around the pure builder (lib/claims.ts) and the Stedi
// client/parsers (lib/claims-stedi.ts). Routes stay thin and call these.
import type { ClaimEventType, ClaimStatus, Prisma, PrismaClient } from '@prisma/client'
import {
  buildClaim, generatePatientControlNumberFrom, scrubClaim, ymdInTz,
  type ClaimContext, type ClaimDraft, type PayerKind,
} from '@/lib/claims'
import {
  CATEGORY_TEXT, computeEraOutcome, outcomeOf, parseX12Statuses, reasonLabel, submitToStedi,
  type ParsedEra, type StatusCode,
} from '@/lib/claims-stedi'

type Db = PrismaClient
const DAY = 86_400_000
const asRecord = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {})
const dec = (v: unknown): number => (v == null ? 0 : Number(v))
const json = (v: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(v ?? null)) as Prisma.InputJsonValue

// Statuses that count as accounts receivable (billed, not yet resolved).
export const OPEN_AR: ClaimStatus[] = ['Submitted', 'Accepted', 'AwaitingPayment', 'Denied', 'Appealed', 'PartialPaidPending']
// Never re-sent or edited again.
const TERMINAL: ClaimStatus[] = ['FullPaidClosed', 'PartialPaidClosed', 'Void']
// The billing team sees problems first.
const PRIORITY: ClaimStatus[] = ['Rejected', 'Denied', 'PartialPaidPending', 'Appealed', 'AwaitingPayment', 'Submitted', 'Accepted', 'Ready', 'Draft', 'FullPaidClosed', 'PartialPaidClosed', 'Void']

export const daysInAr = (c: { submittedAt: Date | null; closedAt: Date | null; voidedAt: Date | null }, now: Date = new Date()): number | null =>
  c.submittedAt ? Math.max(0, Math.floor(((c.closedAt ?? c.voidedAt ?? now).getTime() - c.submittedAt.getTime()) / DAY)) : null

// ── helpers ──────────────────────────────────────────────────────────────────

async function event(db: Db, claimId: string, eventType: ClaimEventType, description: string, extra: {
  statusCodes?: unknown; rawPayload?: unknown; correlationId?: string | null; stediEventId?: string | null; createdBy?: string | null
} = {}) {
  return db.claimEvent.create({
    data: {
      claimId, eventType, description,
      statusCodes: extra.statusCodes == null ? undefined : json(extra.statusCodes),
      rawPayload: extra.rawPayload == null ? undefined : json(extra.rawPayload),
      stediCorrelationId: extra.correlationId ?? undefined,
      stediEventId: extra.stediEventId ?? undefined,
      createdBy: extra.createdBy ?? undefined,
    },
  })
}

/** Same rule as the eligibility worker: explicit map row, then Medicare -> CMS, else unresolved (never guessed). */
export async function resolvePayerId(db: Db, payerName: string, payerType: PayerKind): Promise<string | null> {
  const key = payerName.trim().toLowerCase().replace(/\s+/g, ' ')
  const row = await db.stediPayerMap.findUnique({ where: { labelKey: key } })
  return row?.stediPayerId ?? (payerType === 'MEDICARE' ? 'CMS' : null)
}

export async function nextPatientControlNumber(db: Db): Promise<string> {
  const rows = await db.$queryRaw<Array<{ n: bigint }>>`SELECT nextval('claim_number_seq') AS n`
  return generatePatientControlNumberFrom(Number(rows[0].n))
}

/** Everything the builder/scrub needs for one visit, or null if the visit is gone. */
export async function loadClaimContext(db: Db, visitId: string, patientControlNumber: string): Promise<ClaimContext | null> {
  const visit = await db.visit.findUnique({
    where: { id: visitId },
    include: { note: true, provider: true, patient: { include: { facility: { include: { practice: true } }, coverages: true } } },
  })
  if (!visit) return null
  const p = visit.patient
  const live = p.coverages.filter(c => c.active && (!c.terminationDate || c.terminationDate >= visit.visitDate))
  const cov = live.find(c => c.isPrimary) ?? live[0] ?? null
  const codes = Array.isArray(visit.note?.cptCodes) ? (visit.note!.cptCodes as unknown[]).map(c => String(asRecord(c).code ?? '').toUpperCase()).filter(Boolean) : []
  const fees = await db.feeScheduleItem.findMany({ where: { cptCode: { in: codes } } })
  return {
    visit: { id: visit.id, visitDate: visit.visitDate, note: visit.note ? { cptCodes: visit.note.cptCodes, diagnoses: visit.note.diagnoses } : null },
    patient: { firstName: p.firstName, lastName: p.lastName, dob: p.dob, gender: p.gender },
    coverage: cov ? { payerName: cov.payerName, payerType: cov.payerType, memberId: cov.memberId, groupId: cov.groupId } : null,
    provider: { firstName: visit.provider.firstName, lastName: visit.provider.lastName, credentials: visit.provider.credentials, npi: visit.provider.npi, phone: visit.provider.phone },
    facility: { name: p.facility.name, facilityType: p.facility.facilityType, address: p.facility.address, npi: p.facility.npi, posCode: p.facility.posCode },
    practice: p.facility.practice ? { name: p.facility.practice.name, tin: p.facility.practice.tin, groupNpi: p.facility.practice.groupNpi, address: p.facility.practice.address, phone: p.facility.practice.phone } : null,
    fees: Object.fromEntries(fees.map(f => [f.cptCode, Number(f.amount)])),
    payerId: cov ? await resolvePayerId(db, cov.payerName, cov.payerType) : null,
    patientControlNumber,
    submitterId: process.env.STEDI_SUBMITTER_ID || null,
  }
}

/** Existing live claim for the same patient + date of service + CPT set (rejected/void claims don't count). */
async function findDuplicate(db: Db, patientId: string, ctx: ClaimContext, draft: ClaimDraft, excludeClaimId?: string): Promise<string | null> {
  const dos = ymdInTz(ctx.visit.visitDate)
  const mine = draft.lines.map(l => l.cptCode).sort().join(',')
  const others = await db.claim.findMany({
    where: { patientId, status: { notIn: ['Void', 'Rejected'] }, ...(excludeClaimId ? { id: { not: excludeClaimId } } : {}) },
    include: { visit: { select: { visitDate: true } }, serviceLines: { select: { cptCode: true } } },
  })
  return others.find(o => ymdInTz(o.visit.visitDate) === dos && o.serviceLines.map(l => l.cptCode).sort().join(',') === mine)?.patientControlNumber ?? null
}

const lineRows = (d: ClaimDraft) => d.lines.map(l => ({
  lineNumber: l.lineNumber, lineControlNumber: l.lineControlNumber, cptCode: l.cptCode, modifiers: l.modifiers,
  description: l.description, diagnosisPointers: l.diagnosisPointers, units: l.units, chargeAmount: l.chargeAmount,
}))

// ── generate / re-scrub ──────────────────────────────────────────────────────

/** Build + scrub a claim for a signed visit. Pass -> Ready; fail -> Draft with the reasons. */
export async function createClaimFromVisit(db: Db, visitId: string, opts: { parentClaimId?: string; createdBy?: string | null } = {}) {
  const pcn = await nextPatientControlNumber(db)
  const ctx = await loadClaimContext(db, visitId, pcn)
  if (!ctx) throw new Error('Visit not found')
  const draft = buildClaim(ctx)
  const visit = await db.visit.findUniqueOrThrow({ where: { id: visitId }, select: { patientId: true } })
  const scrub = scrubClaim(ctx, { duplicateOf: await findDuplicate(db, visit.patientId, ctx, draft) })
  const claim = await db.claim.create({
    data: {
      visitId, patientId: visit.patientId, patientControlNumber: pcn,
      status: scrub.pass ? 'Ready' : 'Draft',
      payerId: ctx.payerId, payerName: ctx.coverage?.payerName,
      totalCharges: draft.totalCharges, diagnoses: json(draft.diagnoses), claimPayload: json(draft.payload),
      scrubErrors: json(scrub.errors), firstScrubPassed: scrub.pass, parentClaimId: opts.parentClaimId,
      serviceLines: { create: lineRows(draft) },
    },
  })
  await event(db, claim.id, 'NoteAdded', opts.parentClaimId ? 'Draft created as a resubmission of the original claim' : 'Draft created from the signed visit', { createdBy: opts.createdBy })
  await event(db, claim.id, 'NoteAdded', scrub.pass ? 'Scrub passed - Ready to submit' : `Scrub failed: ${scrub.errors.join('; ')}`, { createdBy: opts.createdBy })
  return { claim, scrub }
}

/** Signed visits with no claim yet -> claims. Returns the counts the UI reports. */
export async function generateClaims(db: Db, createdBy: string | null) {
  const visits = await db.visit.findMany({ where: { status: 'signed', claims: { none: {} } }, select: { id: true }, orderBy: { signedAt: 'asc' } })
  const out = { generated: 0, ready: 0, failed: 0, errors: [] as Array<{ visitId: string; claim: string; errors: string[] }> }
  for (const v of visits) {
    try {
      const { claim, scrub } = await createClaimFromVisit(db, v.id, { createdBy })
      out.generated++
      if (scrub.pass) out.ready++
      else { out.failed++; out.errors.push({ visitId: v.id, claim: claim.patientControlNumber, errors: scrub.errors }) }
    } catch (e) {
      out.failed++
      out.errors.push({ visitId: v.id, claim: '', errors: [e instanceof Error ? e.message : String(e)] })
    }
  }
  return out
}

/** Re-run build + scrub on a Draft/Ready claim from current data (the billing team fixed something). */
export async function rescrubClaim(db: Db, claimId: string) {
  const claim = await db.claim.findUniqueOrThrow({ where: { id: claimId } })
  if (claim.status !== 'Draft' && claim.status !== 'Ready') return { claim, scrub: { pass: claim.status !== 'Rejected', errors: [] as string[] }, changed: false }
  const ctx = await loadClaimContext(db, claim.visitId, claim.patientControlNumber)
  if (!ctx) throw new Error('Visit not found')
  const draft = buildClaim(ctx)
  const scrub = scrubClaim(ctx, { duplicateOf: await findDuplicate(db, claim.patientId, ctx, draft, claim.id) })
  const status: ClaimStatus = scrub.pass ? 'Ready' : 'Draft'
  const updated = await db.claim.update({
    where: { id: claimId },
    data: {
      status, payerId: ctx.payerId, payerName: ctx.coverage?.payerName, totalCharges: draft.totalCharges,
      diagnoses: json(draft.diagnoses), claimPayload: json(draft.payload), scrubErrors: json(scrub.errors),
      serviceLines: { deleteMany: {}, create: lineRows(draft) },
    },
  })
  if (status !== claim.status) await event(db, claimId, 'NoteAdded', scrub.pass ? 'Scrub passed - Ready to submit' : `Scrub failed: ${scrub.errors.join('; ')}`)
  return { claim: updated, scrub, changed: status !== claim.status }
}

// ── submit ───────────────────────────────────────────────────────────────────

export type SubmitOutcome =
  | { ok: true; claimId: string; status: ClaimStatus; message: string }
  | { ok: false; claimId: string; error: string; errors?: string[] }

/** Send one Ready claim to Stedi. The Ready->Submitted flip is the lock: a double click cannot send twice. */
export async function submitClaim(db: Db, claimId: string, actor: { id: string; role: string }, opts: { force?: boolean; reason?: string } = {}): Promise<SubmitOutcome> {
  const existing = await db.claim.findUnique({ where: { id: claimId } })
  if (!existing) return { ok: false, claimId, error: 'Claim not found' }
  if (opts.force && actor.role !== 'ADMIN') return { ok: false, claimId, error: 'Force submit requires the ADMIN role' }
  if (opts.force && !opts.reason?.trim()) return { ok: false, claimId, error: 'Force submit requires a reason' }
  if (!['Ready', 'Draft'].includes(existing.status)) return { ok: false, claimId, error: `Claim is ${existing.status}; only Ready claims can be submitted` }

  const { claim: fresh, scrub } = await rescrubClaim(db, claimId) // always send the freshest data
  if (!scrub.pass && !opts.force) return { ok: false, claimId, error: 'Scrub failed', errors: scrub.errors }
  if (fresh.status === 'Draft' && !opts.force) return { ok: false, claimId, error: 'Claim is not Ready' }

  const lock = await db.claim.updateMany({ where: { id: claimId, status: { in: ['Ready', 'Draft'] } }, data: { status: 'Submitted', submittedAt: new Date() } })
  if (lock.count !== 1) return { ok: false, claimId, error: 'Claim was already submitted' }
  const payload = asRecord(fresh.claimPayload)
  if (opts.force) await event(db, claimId, 'NoteAdded', `Force submit over a failed scrub (${scrub.errors.join('; ') || 'none'}). Reason: ${opts.reason}`, { createdBy: actor.id })

  const res = await submitToStedi(payload)
  const body = res.body
  const success = res.httpStatus === 200 && String(body.status ?? '').toUpperCase() === 'SUCCESS'
  if (!success) {
    // Nothing reached the payer as far as we know: put it back so it can be retried.
    await db.claim.update({ where: { id: claimId }, data: { status: fresh.status, submittedAt: null } })
    const why = res.networkError ?? `HTTP ${res.httpStatus}: ${JSON.stringify(body).slice(0, 600)}`
    await event(db, claimId, 'NoteAdded', `Submission to Stedi failed - ${why}`, { rawPayload: body, createdBy: actor.id })
    return { ok: false, claimId, error: `Stedi submission failed: ${why}` }
  }

  const ref = asRecord(body.claimReference)
  const correlationId = String(ref.correlationId ?? '') || null
  await db.claim.update({ where: { id: claimId }, data: { stediCorrelationId: correlationId } })
  await event(db, claimId, 'Submitted', `Professional claim ${fresh.patientControlNumber} (837P JSON, test mode) sent to Stedi: $${dec(fresh.totalCharges).toFixed(2)} total`, { rawPayload: body, correlationId, createdBy: actor.id })

  const codes = parseX12Statuses(typeof body.x12 === 'string' ? body.x12 : '')
  if (codes.length) {
    const r = await applyAcknowledgment(db, claimId, codes, { correlationId, raw: body, source: 'synchronous 277CA' })
    return { ok: true, claimId, status: r.status, message: r.message }
  }
  return { ok: true, claimId, status: 'Submitted', message: 'Submitted; awaiting the 277CA acknowledgment' }
}

// ── apply payer responses (277CA, 835) ───────────────────────────────────────

const codeText = (codes: StatusCode[]): string => codes.map(c => `${c.category}${c.statusCode ? `:${c.statusCode}` : ''}${c.message ? ` ${c.message}` : CATEGORY_TEXT[c.category] ? ` ${CATEGORY_TEXT[c.category]}` : ''}`).join('; ')

async function seen(db: Db, claimId: string, stediEventId?: string | null): Promise<boolean> {
  return !!stediEventId && !!(await db.claimEvent.findFirst({ where: { claimId, stediEventId }, select: { id: true } }))
}

/** 277CA: Submitted/Accepted -> Accepted | AwaitingPayment | Rejected. Idempotent on the Stedi event id. */
export async function applyAcknowledgment(db: Db, claimId: string, codes: StatusCode[], meta: { correlationId?: string | null; raw?: unknown; source?: string; stediEventId?: string | null }): Promise<{ status: ClaimStatus; message: string; duplicate?: boolean }> {
  const claim = await db.claim.findUniqueOrThrow({ where: { id: claimId } })
  if (await seen(db, claimId, meta.stediEventId)) return { status: claim.status, message: 'Duplicate event ignored', duplicate: true }
  const outcome = outcomeOf(codes)
  const text = codeText(codes) || 'no status codes'
  const via = meta.source ?? '277CA'
  await event(db, claimId, 'Acknowledged', `${via} received - ${text}`, { statusCodes: codes, rawPayload: meta.raw, correlationId: meta.correlationId, stediEventId: meta.stediEventId })

  const late: ClaimStatus[] = ['Denied', 'PartialPaidPending', 'FullPaidClosed', 'PartialPaidClosed', 'Void'] // an ERA already settled it
  if (late.includes(claim.status) || outcome === 'unknown') return { status: claim.status, message: `Acknowledgment recorded (${text})` }
  if (outcome === 'rejected') {
    await db.claim.update({ where: { id: claimId }, data: { status: 'Rejected', stediCorrelationId: meta.correlationId ?? undefined } })
    await event(db, claimId, 'Rejected', `Rejected before adjudication - ${text}. Fix the data and resubmit.`, { statusCodes: codes, correlationId: meta.correlationId })
    return { status: 'Rejected', message: `Rejected: ${text}` }
  }
  // A2 = accepted into the payer's adjudication system -> Awaiting Payment (Days in AR keeps running); A0/A1 = receipt only.
  const status: ClaimStatus = codes.some(c => c.category === 'A2') ? 'AwaitingPayment' : 'Accepted'
  await db.claim.update({ where: { id: claimId }, data: { status, acceptedAt: claim.acceptedAt ?? new Date(), stediCorrelationId: meta.correlationId ?? undefined } })
  await event(db, claimId, 'Accepted', `Accepted for processing - ${text}`, { statusCodes: codes, correlationId: meta.correlationId })
  return { status, message: `Accepted: ${text}` }
}

/** 835 ERA: fills the money columns, line adjudication, and moves the claim to Denied / Partial Paid / Full Paid. */
export async function applyEra(db: Db, claimId: string, era: ParsedEra, meta: { raw?: unknown; stediEventId?: string | null }): Promise<{ status: ClaimStatus; message: string; duplicate?: boolean }> {
  const claim = await db.claim.findUniqueOrThrow({ where: { id: claimId }, include: { serviceLines: { orderBy: { lineNumber: 'asc' } } } })
  if (await seen(db, claimId, meta.stediEventId)) return { status: claim.status, message: 'Duplicate event ignored', duplicate: true }
  if (claim.status === 'Void') return { status: claim.status, message: 'Claim is void; ERA ignored' }
  const out = computeEraOutcome(dec(claim.totalCharges), era, claim.serviceLines.map(l => ({ lineNumber: l.lineNumber, lineControlNumber: l.lineControlNumber, cptCode: l.cptCode })))
  const now = new Date()
  await db.$transaction([
    ...out.lines.map(l => db.claimServiceLine.update({
      where: { claimId_lineNumber: { claimId, lineNumber: l.lineNumber } },
      data: { allowedAmount: l.allowed, paidAmount: l.paid, adjustmentAmount: l.adjustment, adjustmentReasonCodes: json(l.reasons), remarkCodes: json(l.remarks) },
    })),
    db.claim.update({
      where: { id: claimId },
      data: {
        status: out.status, totalAllowed: out.totalAllowed, totalPaid: out.totalPaid, totalAdjustment: out.totalAdjustment, patientResponsibility: out.patientResponsibility,
        adjudicatedAt: now, deniedAt: out.status === 'Denied' ? now : null, closedAt: out.status === 'FullPaidClosed' ? now : null,
      },
    }),
  ])
  await event(db, claimId, 'ERAReceived', `835 ERA received - ${out.summary}`, {
    statusCodes: { reasons: out.reasons.map(r => ({ ...r, label: reasonLabel(r) })), claimStatusCode: era.claimStatusCode, trace: era.traceNumber },
    rawPayload: meta.raw, stediEventId: meta.stediEventId,
  })
  return { status: out.status, message: out.summary }
}

// ── manual actions ───────────────────────────────────────────────────────────

export async function addNote(db: Db, claimId: string, userId: string, note: string) {
  const row = await db.claimNote.create({ data: { claimId, note: note.trim(), createdBy: userId }, include: { user: { select: { firstName: true, lastName: true } } } })
  await event(db, claimId, 'NoteAdded', `Note added: ${note.trim().slice(0, 140)}`, { createdBy: userId })
  return row
}

export async function voidClaim(db: Db, claimId: string, userId: string, reason: string) {
  const c = await db.claim.findUniqueOrThrow({ where: { id: claimId } })
  if (TERMINAL.includes(c.status)) throw new Error(`Claim is ${c.status}; it cannot be voided`)
  const updated = await db.claim.update({ where: { id: claimId }, data: { status: 'Void', voidedAt: new Date(), voidReason: reason.trim() } })
  await event(db, claimId, 'Voided', `Voided: ${reason.trim()}`, { createdBy: userId })
  return updated
}

/** Close a partially paid claim and write the remainder off. */
export async function writeOffClaim(db: Db, claimId: string, userId: string, reason: string) {
  const c = await db.claim.findUniqueOrThrow({ where: { id: claimId } })
  if (c.status !== 'PartialPaidPending') throw new Error(`Only a Partial Paid - Pending claim can be written off (this one is ${c.status})`)
  const remainder = Math.max(0, dec(c.totalCharges) - dec(c.totalPaid) - dec(c.totalAdjustment) - dec(c.patientResponsibility))
  const updated = await db.claim.update({ where: { id: claimId }, data: { status: 'PartialPaidClosed', closedAt: new Date(), writeOffAmount: remainder, writeOffReason: reason.trim() } })
  await event(db, claimId, 'WrittenOff', `Wrote off $${remainder.toFixed(2)}: ${reason.trim()}`, { createdBy: userId })
  return updated
}

/** Resubmit (Rejected) or Appeal (Denied): a new claim linked by parentClaimId, built fresh from current data. */
export async function resubmitClaim(db: Db, claimId: string, userId: string, kind: 'resubmit' | 'appeal') {
  const c = await db.claim.findUniqueOrThrow({ where: { id: claimId } })
  if (kind === 'resubmit' && c.status !== 'Rejected') throw new Error(`Only a Rejected claim can be resubmitted (this one is ${c.status})`)
  if (kind === 'appeal' && c.status !== 'Denied') throw new Error(`Only a Denied claim can be appealed (this one is ${c.status})`)
  const { claim, scrub } = await createClaimFromVisit(db, c.visitId, { parentClaimId: claimId, createdBy: userId })
  if (kind === 'appeal') await db.claim.update({ where: { id: claimId }, data: { status: 'Appealed' } })
  await event(db, claimId, kind === 'appeal' ? 'Appealed' : 'Resubmitted', `${kind === 'appeal' ? 'Appeal' : 'Resubmission'} created as claim ${claim.patientControlNumber}${scrub.pass ? ' (Ready)' : ' (Draft: scrub failed)'}`, { createdBy: userId })
  return { claim, scrub }
}

// ── reads: list, detail, summary, denials ────────────────────────────────────

export interface ClaimFilters {
  status?: string[]; facilityId?: string; providerId?: string; payerId?: string
  dateFrom?: string; dateTo?: string; search?: string; aging?: string
}

const BUCKETS: Array<{ key: string; label: string; min: number; max: number; color: string }> = [
  { key: '0-30', label: '0-30 Days', min: 0, max: 30, color: 'green' },
  { key: '31-60', label: '31-60 Days', min: 31, max: 60, color: 'yellow' },
  { key: '61-90', label: '61-90 Days', min: 61, max: 90, color: 'orange' },
  { key: '91-120', label: '91-120 Days', min: 91, max: 120, color: 'red' },
  { key: '120+', label: '120+ Days', min: 121, max: Infinity, color: 'darkred' },
]
export const AGING_BUCKETS = BUCKETS

function whereOf(f: ClaimFilters): Prisma.ClaimWhereInput {
  const and: Prisma.ClaimWhereInput[] = []
  if (f.status?.length) and.push({ status: { in: f.status as ClaimStatus[] } })
  if (f.facilityId) and.push({ patient: { facilityId: f.facilityId } })
  if (f.providerId) and.push({ visit: { providerId: f.providerId } })
  if (f.payerId) and.push({ payerId: f.payerId })
  if (f.dateFrom) and.push({ visit: { visitDate: { gte: new Date(`${f.dateFrom}T00:00:00.000Z`) } } })
  if (f.dateTo) and.push({ visit: { visitDate: { lte: new Date(`${f.dateTo}T23:59:59.999Z`) } } })
  if (f.search?.trim()) {
    const s = f.search.trim()
    and.push({ OR: [
      { patientControlNumber: { contains: s, mode: 'insensitive' } },
      { patient: { lastName: { contains: s, mode: 'insensitive' } } },
      { patient: { firstName: { contains: s, mode: 'insensitive' } } },
    ] })
  }
  return and.length ? { AND: and } : {}
}

const LIST_INCLUDE = {
  patient: { select: { id: true, firstName: true, lastName: true, facility: { select: { id: true, name: true } } } },
  visit: { select: { visitDate: true, provider: { select: { id: true, firstName: true, lastName: true, npi: true, credentials: true } } } },
  serviceLines: { select: { id: true } },
} satisfies Prisma.ClaimInclude

type ListRow = Prisma.ClaimGetPayload<{ include: typeof LIST_INCLUDE }>

function shape(c: ListRow, now: Date) {
  const pcs = Array.isArray(c.scrubErrors) ? (c.scrubErrors as string[]) : []
  return {
    id: c.id, claimId: c.patientControlNumber, status: c.status,
    patient: { id: c.patient.id, name: `${c.patient.lastName}, ${c.patient.firstName}` },
    dos: ymdInTz(c.visit.visitDate),
    facility: { id: c.patient.facility.id, name: c.patient.facility.name },
    provider: { id: c.visit.provider.id, name: `${c.visit.provider.lastName}, ${c.visit.provider.firstName}`, npi: c.visit.provider.npi },
    payerId: c.payerId, payerName: c.payerName,
    cptCount: c.serviceLines.length, totalCharges: dec(c.totalCharges),
    totalPaid: c.totalPaid == null ? null : dec(c.totalPaid),
    outstanding: Math.max(0, dec(c.totalCharges) - dec(c.totalPaid)),
    daysInAR: daysInAr(c, now), submittedAt: c.submittedAt, createdAt: c.createdAt,
    scrubPass: pcs.length === 0, scrubErrors: pcs, firstScrubPassed: c.firstScrubPassed,
  }
}
export type ClaimRow = ReturnType<typeof shape>

export async function listClaims(db: Db, f: ClaimFilters, page = 1, limit = 25) {
  const now = new Date()
  // Phase 1 volume (hundreds of open claims): fetch the filtered set, sort by problem priority in memory.
  const rows = (await db.claim.findMany({ where: whereOf(f), include: LIST_INCLUDE })).map(c => shape(c, now))
  const inBucket = (d: number | null) => {
    const b = BUCKETS.find(x => x.key === f.aging)
    return !b || (d != null && d >= b.min && d <= b.max)
  }
  const filtered = f.aging ? rows.filter(r => OPEN_AR.includes(r.status) && inBucket(r.daysInAR)) : rows
  filtered.sort((a, b) => PRIORITY.indexOf(a.status) - PRIORITY.indexOf(b.status) || (b.daysInAR ?? -1) - (a.daysInAR ?? -1) || b.createdAt.getTime() - a.createdAt.getTime())
  return { claims: filtered.slice((page - 1) * limit, page * limit), total: filtered.length, page, limit }
}

export async function claimDetail(db: Db, claimId: string) {
  const c = await db.claim.findUnique({
    where: { id: claimId },
    include: {
      patient: { include: { facility: true, coverages: true, practitioners: true } },
      visit: { include: { provider: true } },
      serviceLines: { orderBy: { lineNumber: 'asc' } },
      events: { orderBy: { createdAt: 'desc' }, include: { user: { select: { firstName: true, lastName: true } } } },
      notes: { orderBy: { createdAt: 'desc' }, include: { user: { select: { firstName: true, lastName: true } } } },
      parent: { select: { id: true, patientControlNumber: true, status: true } },
      children: { select: { id: true, patientControlNumber: true, status: true } },
    },
  })
  if (!c) return null
  const referring = c.patient.practitioners.find(p => p.relation === 'Primary')
  const cov = c.patient.coverages.find(x => x.active && x.isPrimary) ?? c.patient.coverages.find(x => x.active)
  return {
    id: c.id, claimId: c.patientControlNumber, status: c.status, stediCorrelationId: c.stediCorrelationId,
    patient: { id: c.patient.id, name: `${c.patient.lastName}, ${c.patient.firstName}`, dob: c.patient.dob.toISOString().slice(0, 10), memberId: cov?.memberId ?? null },
    payer: { id: c.payerId, name: c.payerName },
    facility: { name: c.patient.facility.name, posCode: c.patient.facility.posCode ?? (c.patient.facility.facilityType === 'SNF' ? '31' : null), type: c.patient.facility.facilityType },
    provider: { name: `${c.visit.provider.lastName}, ${c.visit.provider.firstName}`, npi: c.visit.provider.npi },
    referringProvider: referring ? { name: `${referring.lastName ?? ''}, ${referring.firstName ?? ''}`, npi: referring.npi } : null,
    dos: ymdInTz(c.visit.visitDate), daysInAR: daysInAr(c),
    money: { charges: dec(c.totalCharges), allowed: c.totalAllowed == null ? null : dec(c.totalAllowed), paid: c.totalPaid == null ? null : dec(c.totalPaid), patientResponsibility: c.patientResponsibility == null ? null : dec(c.patientResponsibility), adjustment: c.totalAdjustment == null ? null : dec(c.totalAdjustment), writeOff: c.writeOffAmount == null ? null : dec(c.writeOffAmount) },
    diagnoses: Array.isArray(c.diagnoses) ? c.diagnoses : [],
    scrubErrors: Array.isArray(c.scrubErrors) ? c.scrubErrors : [],
    serviceLines: c.serviceLines.map(l => ({
      lineNumber: l.lineNumber, cptCode: l.cptCode, modifiers: l.modifiers, description: l.description, diagnosisPointers: l.diagnosisPointers, units: l.units,
      charge: dec(l.chargeAmount), allowed: l.allowedAmount == null ? null : dec(l.allowedAmount), paid: l.paidAmount == null ? null : dec(l.paidAmount), adjustment: l.adjustmentAmount == null ? null : dec(l.adjustmentAmount),
      reasons: Array.isArray(l.adjustmentReasonCodes) ? l.adjustmentReasonCodes : [], remarks: Array.isArray(l.remarkCodes) ? l.remarkCodes : [],
    })),
    events: c.events.map(e => ({ id: e.id, type: e.eventType, description: e.description, statusCodes: e.statusCodes, correlationId: e.stediCorrelationId, createdAt: e.createdAt, by: e.user ? `${e.user.firstName} ${e.user.lastName}` : null, hasPayload: e.rawPayload != null })),
    notes: c.notes.map(n => ({ id: n.id, note: n.note, createdAt: n.createdAt, by: `${n.user.firstName} ${n.user.lastName}` })),
    parent: c.parent, children: c.children,
    timestamps: { submittedAt: c.submittedAt, acceptedAt: c.acceptedAt, adjudicatedAt: c.adjudicatedAt, deniedAt: c.deniedAt, closedAt: c.closedAt, voidedAt: c.voidedAt },
    voidReason: c.voidReason, writeOffReason: c.writeOffReason,
  }
}

export async function claimSummary(db: Db, f: ClaimFilters = {}) {
  const now = new Date()
  const all = (await db.claim.findMany({ where: whereOf(f), include: LIST_INCLUDE })).map(c => shape(c, now))
  const open = all.filter(c => OPEN_AR.includes(c.status))
  const since = new Date(now.getTime() - 30 * DAY)
  const recent = all.filter(c => c.createdAt >= since)
  const adj = await db.claim.findMany({ where: { adjudicatedAt: { gte: since }, ...(whereOf(f).AND ? { AND: whereOf(f).AND } : {}) }, select: { status: true, parentClaimId: true } })
  const paid = adj.filter(c => ['FullPaidClosed', 'PartialPaidPending', 'PartialPaidClosed'].includes(c.status) && !c.parentClaimId)
  const buckets = BUCKETS.map(b => {
    const rows = open.filter(c => c.daysInAR != null && c.daysInAR >= b.min && c.daysInAR <= b.max)
    return { key: b.key, label: b.label, color: b.color, count: rows.length, billed: sum(rows.map(r => r.totalCharges)), paid: sum(rows.map(r => r.totalPaid ?? 0)), outstanding: sum(rows.map(r => r.outstanding)) }
  })
  const aged = open.filter(c => c.daysInAR != null)
  return {
    totalOutstanding: sum(open.map(c => c.outstanding)), openClaims: open.length,
    avgDaysInAR: aged.length ? Math.round((sum(aged.map(c => c.daysInAR ?? 0)) / aged.length) * 10) / 10 : null,
    cleanClaimRate: recent.length ? Math.round((recent.filter(c => c.firstScrubPassed === true).length / recent.length) * 1000) / 10 : null,
    firstPassResolutionRate: adj.length ? Math.round((paid.length / adj.length) * 1000) / 10 : null,
    queue: { draft: all.filter(c => c.status === 'Draft').length, ready: all.filter(c => c.status === 'Ready').length, queuedCharges: sum(all.filter(c => c.status === 'Draft' || c.status === 'Ready').map(c => c.totalCharges)) },
    buckets,
  }
}
const sum = (xs: number[]): number => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100

/** Rejected (277CA) + Denied (835) claims grouped by reason code: where the billing team works. */
export async function denialQueue(db: Db, f: ClaimFilters = {}) {
  const now = new Date()
  const claims = await db.claim.findMany({
    where: { AND: [whereOf(f), { status: { in: ['Rejected', 'Denied'] } }] },
    include: { ...LIST_INCLUDE, events: { orderBy: { createdAt: 'desc' }, select: { eventType: true, statusCodes: true, description: true, createdAt: true } } },
  })
  const rows = claims.map(c => {
    const base = shape(c, now)
    const isDenied = c.status === 'Denied'
    const ev = c.events.find(e => e.eventType === (isDenied ? 'ERAReceived' : 'Rejected'))
    let code = isDenied ? 'Denied' : 'Rejected', description = ev?.description ?? ''
    if (isDenied) {
      const r = asRecord(ev?.statusCodes).reasons
      const first = Array.isArray(r) ? asRecord(r[0]) : {}
      if (first.label) { code = String(first.label); description = String(first.description ?? '') || description }
    } else {
      const codes = Array.isArray(ev?.statusCodes) ? (ev!.statusCodes as unknown[]).map(asRecord) : []
      const rej = codes.find(x => /^(A3|A4|A6|A7|A8|E\d)$/.test(String(x.category)))
      if (rej) { code = `${rej.category}${rej.statusCode ? `:${rej.statusCode}` : ''}`; description = String(rej.message ?? '') || CATEGORY_TEXT[String(rej.category)] || description }
    }
    const since = c.deniedAt ?? ev?.createdAt ?? c.updatedAt
    const taken = c.events.some(e => e.eventType === 'WrittenOff') ? 'Written Off' : c.events.some(e => e.eventType === 'Appealed') ? 'Appealed' : c.events.some(e => e.eventType === 'Resubmitted') ? 'Resubmitted' : 'None'
    return { ...base, denialCode: code, denialDescription: description, daysSinceDenial: Math.max(0, Math.floor((now.getTime() - since.getTime()) / DAY)), actionTaken: taken }
  })
  const groups = new Map<string, { code: string; description: string; claims: typeof rows }>()
  for (const r of rows) {
    const g = groups.get(r.denialCode) ?? { code: r.denialCode, description: r.denialDescription, claims: [] }
    g.claims.push(r)
    groups.set(r.denialCode, g)
  }
  const grouped = [...groups.values()].map(g => ({ ...g, count: g.claims.length, dollars: sum(g.claims.map(c => c.totalCharges)) })).sort((a, b) => b.count - a.count)
  return {
    totalDeniedRejected: rows.length, dollarsAtRisk: sum(rows.map(r => r.totalCharges)),
    avgDaysSinceDenial: rows.length ? Math.round((sum(rows.map(r => r.daysSinceDenial)) / rows.length) * 10) / 10 : null,
    groups: grouped,
  }
}
