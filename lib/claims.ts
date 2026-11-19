// Billing claims: pure logic (no DB, no network) so it can be unit-tested.
// Visit + patient + coverage + provider + facility + practice -> Stedi professional
// claim JSON (the legacy 837P JSON endpoint named in the billing spec), plus the scrub.
// DB access lives in lib/claims-service.ts; HTTP in lib/claims-stedi.ts.

// Test mode until the Stedi BAA is signed and a production key exists. Hardcoded on
// purpose: flipping it is a code change that must be reviewed, not an env var.
export const CLAIM_USAGE_INDICATOR = 'T' as const

// DOS is a calendar date in the practice's timezone, not in UTC.
export const CLAIM_TZ = 'America/New_York'

export type PayerKind = 'MEDICARE' | 'MEDICAID' | 'COMMERCIAL' | 'OTHER'

export interface ClaimVisit { id: string; visitDate: Date; note: { cptCodes: unknown; diagnoses: unknown } | null }
export interface ClaimPatient { firstName: string; lastName: string; dob: Date; gender: string | null }
export interface ClaimCoverage { payerName: string; payerType: PayerKind; memberId: string | null; groupId: string | null }
export interface ClaimProvider { firstName: string; lastName: string; credentials: string | null; npi: string | null; phone: string | null }
export interface ClaimFacility { name: string; facilityType: string; address: string | null; npi: string | null; posCode: string | null }
export interface ClaimPractice { name: string; tin: string | null; groupNpi: string | null; address: string | null; phone: string | null }

export interface ClaimContext {
  visit: ClaimVisit
  patient: ClaimPatient
  coverage: ClaimCoverage | null
  provider: ClaimProvider
  facility: ClaimFacility
  practice: ClaimPractice | null
  fees: Record<string, number>          // CPT -> charge (fee_schedule_items)
  payerId: string | null                // Stedi payer id resolved for the coverage
  patientControlNumber: string
  submitterId?: string | null           // overrides the TIN as the submitter id
  now?: Date
}

export interface ClaimDx { pointer: string; icd10: string; description: string; rank: string }
export interface ClaimLineDraft {
  lineNumber: number
  lineControlNumber: string
  cptCode: string
  modifiers: string[]
  description: string
  diagnosisPointers: string[]           // ICD-10 codes (letters are derived from the claim's dx list)
  units: number
  chargeAmount: number
}
export interface ClaimDraft {
  payload: Record<string, unknown>
  totalCharges: number
  lines: ClaimLineDraft[]
  diagnoses: ClaimDx[]
}

// ── small helpers ────────────────────────────────────────────────────────────

const asRecord = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {})
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
export const money = (n: number): string => (Math.round(n * 100) / 100).toFixed(2)
const digits = (s: string | null | undefined): string => (s ?? '').replace(/\D/g, '')

/** Calendar date (YYYY-MM-DD) of an instant in the practice timezone. */
export function ymdInTz(d: Date, tz: string = CLAIM_TZ): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}
const compact = (ymd: string): string => ymd.replace(/-/g, '')

/** "123 Main St, Miami, FL 33101" (or with a suite: "123 Main St, Ste 4, Miami, FL 33101-1234"). */
export function parseAddress(a: string | null | undefined): { address1: string; city: string; state: string; postalCode: string } | null {
  const m = (a ?? '').trim().match(/^(.+),\s*([^,]+),\s*([A-Za-z]{2})\s+(\d{5})(?:-?(\d{4}))?$/)
  if (!m) return null
  return { address1: m[1].trim(), city: m[2].trim(), state: m[3].toUpperCase(), postalCode: m[4] + (m[5] ?? '') }
}

export const isEM = (cpt: string): boolean => /^99[2-4]\d\d$/.test(cpt)

const Q_MODIFIER: Record<string, string> = { class_a: 'Q7', class_b: 'Q8', class_c: 'Q9' }

/**
 * Modifiers. The EMR stores no modifiers, so they are derived:
 *  - 25 on an E/M billed on the same visit as a procedure;
 *  - Q7/Q8/Q9 from the routine-foot-care class qualifier on the CPT line.
 * ASSUMPTION to confirm with billing: class_a -> Q7, class_b -> Q8, class_c -> Q9.
 */
export function deriveModifiers(cpt: string, qualifier: string | null, hasProcedure: boolean): string[] {
  const mods: string[] = []
  if (isEM(cpt) && hasProcedure) mods.push('25')
  if (!isEM(cpt) && qualifier && Q_MODIFIER[qualifier]) mods.push(Q_MODIFIER[qualifier])
  return mods
}

export function generatePatientControlNumberFrom(seq: number, now: Date = new Date()): string {
  return `QMD-${ymdInTz(now).slice(0, 4)}-${String(seq).padStart(4, '0')}`
}

/** The effective place of service: the facility's own code, else the default for its type. */
export function effectivePos(f: ClaimFacility): string | null {
  if (f.posCode && f.posCode.trim()) return f.posCode.trim()
  if (f.facilityType === 'SNF') return '31'
  if (f.facilityType === 'ALF') return '13'
  return null
}

const FILING_CODE: Record<PayerKind, string> = { MEDICARE: 'MB', MEDICAID: 'MC', COMMERCIAL: 'CI', OTHER: 'CI' }
const RANK_LABEL = (i: number): string => (i === 0 ? 'Primary' : i === 1 ? 'Secondary' : `Diagnosis #${i + 1}`)
const LETTERS = 'ABCDEFGHIJKL'

function noteCpts(visit: ClaimVisit): Array<{ code: string; description: string; qualifier: string | null }> {
  const raw = visit.note?.cptCodes
  if (!Array.isArray(raw)) return []
  return raw.map(r => {
    const o = asRecord(r)
    return { code: str(o.code).trim().toUpperCase(), description: str(o.description), qualifier: str(o.qualifier) || null }
  }).filter(c => c.code)
}

function noteDx(visit: ClaimVisit): ClaimDx[] {
  const raw = visit.note?.diagnoses
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: ClaimDx[] = []
  for (const r of raw) {
    const o = asRecord(r)
    const icd10 = str(o.icd10).trim().toUpperCase()
    if (!icd10 || seen.has(icd10) || out.length >= 12) continue // CMS-1500 Box 21 holds 12
    seen.add(icd10)
    const i = out.length
    out.push({ pointer: LETTERS[i], icd10, description: str(o.description), rank: RANK_LABEL(i) })
  }
  return out
}

// ── builder ──────────────────────────────────────────────────────────────────

/** Visit data -> claim draft: Stedi payload + the rows to store. Always returns a best-effort draft; scrubClaim says whether it is sendable. */
export function buildClaim(ctx: ClaimContext): ClaimDraft {
  const { visit, patient, coverage, provider, facility, practice } = ctx
  const cpts = noteCpts(visit)
  const dx = noteDx(visit)
  const hasProcedure = cpts.some(c => !isEM(c.code))
  const pointers = dx.slice(0, 4).map(d => d.icd10) // a line can point at up to 4 diagnoses

  const lines: ClaimLineDraft[] = cpts.map((c, i) => ({
    lineNumber: i + 1,
    lineControlNumber: `${ctx.patientControlNumber}-L${i + 1}`,
    cptCode: c.code,
    modifiers: deriveModifiers(c.code, c.qualifier, hasProcedure),
    description: c.description,
    diagnosisPointers: pointers,
    units: 1,
    chargeAmount: ctx.fees[c.code] ?? 0,
  }))
  const totalCharges = lines.reduce((s, l) => s + l.chargeAmount * l.units, 0)

  const dos = compact(ymdInTz(visit.visitDate))
  const facAddr = parseAddress(facility.address)
  const prAddr = parseAddress(practice?.address)
  const tin = digits(practice?.tin)
  const billingNpi = practice?.groupNpi?.trim() || provider.npi?.trim() || ''
  const taxonomy = (provider.credentials ?? '').toUpperCase().includes('DPM') ? '213E00000X' : undefined
  const gender = (patient.gender ?? '').trim().charAt(0).toUpperCase()
  const payerKind: PayerKind = coverage?.payerType ?? 'OTHER'
  const addr = (a: ReturnType<typeof parseAddress>) => a ? { address1: a.address1, city: a.city, state: a.state, postalCode: a.postalCode } : undefined

  const payload: Record<string, unknown> = {
    usageIndicator: CLAIM_USAGE_INDICATOR,
    tradingPartnerServiceId: ctx.payerId ?? '',
    tradingPartnerName: coverage?.payerName ?? '',
    submitter: {
      organizationName: practice?.name ?? '',
      submitterIdentification: ctx.submitterId || tin,
      contactInformation: { name: practice?.name ?? '', phoneNumber: digits(practice?.phone) || undefined },
    },
    receiver: { organizationName: coverage?.payerName ?? '' },
    // SNF residents are their own subscriber. Patient address = the facility's address
    // (the EMR holds no patient address) - a known limitation, see the billing report.
    subscriber: {
      memberId: coverage?.memberId ?? '',
      paymentResponsibilityLevelCode: 'P',
      firstName: patient.firstName,
      lastName: patient.lastName,
      gender: gender === 'M' || gender === 'F' ? gender : 'U',
      dateOfBirth: compact(patient.dob.toISOString().slice(0, 10)),
      groupNumber: coverage?.groupId || undefined,
      address: addr(facAddr),
    },
    billing: {
      providerType: 'BillingProvider',
      npi: billingNpi,
      employerId: tin,
      taxonomyCode: taxonomy,
      organizationName: practice?.name ?? '',
      address: addr(prAddr),
      contactInformation: { name: practice?.name ?? '', phoneNumber: digits(practice?.phone) || undefined },
    },
    claimInformation: {
      claimFilingCode: FILING_CODE[payerKind],
      patientControlNumber: ctx.patientControlNumber,
      claimChargeAmount: money(totalCharges),
      placeOfServiceCode: effectivePos(facility) ?? '31',
      claimFrequencyCode: '1',
      signatureIndicator: 'Y',
      planParticipationCode: 'A',
      benefitsAssignmentCertificationIndicator: 'Y',
      releaseInformationCode: 'Y',
      healthCareCodeInformation: dx.map((d, i) => ({ diagnosisTypeCode: i === 0 ? 'ABK' : 'ABF', diagnosisCode: d.icd10.replace('.', '') })),
      serviceFacilityLocation: { organizationName: facility.name, address: addr(facAddr), npi: facility.npi || undefined },
      serviceLines: lines.map(l => ({
        serviceDate: dos,
        professionalService: {
          procedureIdentifier: 'HC',
          procedureCode: l.cptCode,
          procedureModifiers: l.modifiers.length ? l.modifiers : undefined,
          lineItemChargeAmount: money(l.chargeAmount),
          measurementUnit: 'UN',
          serviceUnitCount: String(l.units),
          compositeDiagnosisCodePointers: {
            diagnosisCodePointers: l.diagnosisPointers.map(code => String(dx.findIndex(d => d.icd10 === code) + 1)),
          },
        },
        providerControlNumber: l.lineControlNumber,
        renderingProvider: {
          providerType: 'RenderingProvider',
          npi: provider.npi ?? '',
          firstName: provider.firstName,
          lastName: provider.lastName,
          taxonomyCode: taxonomy,
        },
      })),
    },
  }
  // JSON round-trip drops the undefined keys so the stored/sent payload has no nulls or holes.
  return { payload: JSON.parse(JSON.stringify(payload)), totalCharges, lines, diagnoses: dx }
}

/** The Stedi professional-claim JSON for a visit (the spec's buildClaimPayload). */
export function buildClaimPayload(ctx: ClaimContext): Record<string, unknown> {
  return buildClaim(ctx).payload
}

// ── scrub ────────────────────────────────────────────────────────────────────

export interface ScrubResult { pass: boolean; errors: string[] }

/**
 * Pre-submission validation. Every failure names the thing to fix; the claim stays
 * Draft and the scrub re-runs after the data is corrected. `duplicateOf` is the claim
 * number of an existing live claim for the same patient + DOS + CPT set (caller queries).
 */
export function scrubClaim(ctx: ClaimContext, opts: { duplicateOf?: string | null } = {}): ScrubResult {
  const errors: string[] = []
  const { visit, patient, coverage, provider, facility, practice } = ctx
  const cpts = noteCpts(visit)
  const dx = noteDx(visit)
  const now = ctx.now ?? new Date()

  if (cpts.length === 0) errors.push('Visit has no CPT codes (note missing or empty)')
  for (const c of cpts) {
    if (!/^[A-Z0-9]{5}$/.test(c.code)) errors.push(`CPT "${c.code}" is not a valid 5-character code`)
    else if (!(ctx.fees[c.code] > 0)) errors.push(`No fee on the fee schedule for CPT ${c.code}`)
  }
  if (dx.length === 0) errors.push('Visit has no diagnosis codes')
  for (const d of dx) if (!/^[A-TV-Z]\d[A-Z0-9](\.?[A-Z0-9]{1,4})?$/.test(d.icd10)) errors.push(`ICD-10 "${d.icd10}" is not a valid format`)

  if (!coverage) errors.push('Patient has no active primary coverage')
  else {
    if (!coverage.memberId?.trim()) errors.push('Coverage is missing the member ID')
    if (!ctx.payerId) errors.push(`No Stedi payer ID mapped for "${coverage.payerName}"`)
  }

  if (!provider.npi || !/^\d{10}$/.test(provider.npi.trim())) errors.push('Rendering provider has no valid 10-digit NPI')
  if (!effectivePos(facility)) errors.push('Facility has no place-of-service code')
  if (!parseAddress(facility.address)) errors.push('Facility address is missing or not in "street, city, ST ZIP" form')
  if (!practice) errors.push('Facility is not linked to a practice (billing provider)')
  else {
    if (digits(practice.tin).length !== 9) errors.push('Practice TIN (EIN) is missing or not 9 digits')
    if (!(practice.groupNpi?.trim() || provider.npi?.trim())) errors.push('Billing provider has no NPI')
    if (!parseAddress(practice.address)) errors.push('Practice address is missing or not in "street, city, ST ZIP" form')
  }

  if (Number.isNaN(patient.dob.getTime())) errors.push('Patient has no date of birth')
  if (compact(ymdInTz(visit.visitDate)) > compact(ymdInTz(now))) errors.push('Date of service is in the future')
  if (opts.duplicateOf) errors.push(`Duplicate of claim ${opts.duplicateOf} (same patient, date of service and CPT set)`)

  return { pass: errors.length === 0, errors }
}
