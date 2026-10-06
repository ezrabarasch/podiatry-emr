// Turns a stored Stedi eligibility v3 response into the structured view the
// Eligibility tab renders. Pure (no DB) so it has a self-test:
//   see scripts/stedi-detail-selftest.ts
// Field names follow Stedi's OpenAPI spec (github.com/Stedi/openApi healthcare.json).

/* eslint-disable @typescript-eslint/no-explicit-any */
type Raw = Record<string, any>

export interface BenefitRow {
  code: string
  name: string
  amount: string | null      // dollars, as sent
  percent: string | null     // already converted: "20%" (Stedi sends 0.20)
  level: string | null       // Individual / Family ...
  period: string | null      // Calendar Year / Lifetime ...
  serviceTypes: string[]
  authRequired: string | null // Yes / No / Unknown
  plan: string | null
  notes: string[]
}

export type NetworkKey = 'in' | 'out' | 'other'

export interface BenefitGroup {
  key: string
  label: string
  rows: Record<NetworkKey, BenefitRow[]>
}

export interface PayerError { code: string | null; description: string | null; followup: string | null; resolution: string | null; source: string }

export interface EligibilityDetail {
  header: {
    outcome: string; payerName: string | null; tradingPartnerServiceId: string | null
    controlNumber: string | null; applicationMode: string | null
  }
  plan: {
    groupNumber: string | null; groupName: string | null; planNumber: string | null
    planDescription: string | null; effective: string | null; term: string | null
    serviceTypeCodes: string[]; otherDates: { label: string; date: string }[]
  }
  subscriber: { memberId: string | null; firstName: string | null; lastName: string | null; dob: string | null; gender: string | null }
  dependents: { firstName: string | null; lastName: string | null; dob: string | null; gender: string | null; relation: string | null; planNumber: string | null }[]
  groups: BenefitGroup[]
  errors: PayerError[]
}

const GROUPS: { key: string; label: string; codes: string[] }[] = [
  { key: 'coverage', label: 'Coverage status', codes: ['1', '2', '3', '4', '5', '6', '7', '8', 'CB'] },
  { key: 'copay', label: 'Copay', codes: ['B'] },
  { key: 'deductible', label: 'Deductible', codes: ['C'] },
  { key: 'oop', label: 'Out-of-pocket (stop loss)', codes: ['G'] },
  { key: 'coinsurance', label: 'Coinsurance', codes: ['A'] },
  { key: 'limitations', label: 'Limitations', codes: ['F'] },
  { key: 'exclusions', label: 'Exclusions / non-covered', codes: ['E', 'I', 'O', 'M'] },
]
const OTHER = { key: 'other', label: 'Other benefit information' }

const AUTH_LABEL: Record<string, string> = { Y: 'Yes', N: 'No', U: 'Unknown' }
const str = (v: unknown) => (v === undefined || v === null || v === '' ? null : String(v))

// YYYYMMDD -> YYYY-MM-DD; ranges ("20240101-20241231") keep both ends.
export function isoDate(s: unknown): string | null {
  const v = str(s)
  return v ? v.replace(/(\d{4})(\d{2})(\d{2})/g, '$1-$2-$3') : null
}

// Stedi sends coinsurance as a decimal fraction ("0.80" = 80%).
export function pctLabel(s: unknown): string | null {
  const n = Number(str(s))
  return str(s) === null || Number.isNaN(n) ? null : `${Math.round(n * 10000) / 100}%`
}

function networkOf(b: Raw): NetworkKey {
  const c = b.inPlanNetworkIndicatorCode
  return c === 'Y' ? 'in' : c === 'N' ? 'out' : 'other' // W = not applicable, U = unknown
}

function rowOf(b: Raw): BenefitRow {
  return {
    code: String(b.code ?? ''),
    name: String(b.name ?? b.code ?? ''),
    amount: str(b.benefitAmount),
    percent: pctLabel(b.benefitPercent),
    level: str(b.coverageLevel) ?? str(b.coverageLevelCode),
    period: str(b.timeQualifier) ?? str(b.timeQualifierCode),
    serviceTypes: ((b.serviceTypes?.length ? b.serviceTypes : b.serviceTypeCodes) ?? []).map(String),
    authRequired: b.authOrCertIndicator ? (AUTH_LABEL[b.authOrCertIndicator] ?? String(b.authOrCertIndicator)) : null,
    plan: str(b.planCoverage) ?? str(b.benefitsAdditionalInformation?.planDescription),
    notes: (b.additionalInformation ?? []).map((a: Raw) => str(a.description)).filter(Boolean) as string[],
  }
}

function collectErrors(raw: Raw): PayerError[] {
  const out: PayerError[] = []
  const seen = new Set<string>()
  const add = (list: Raw[] | undefined, source: string) => {
    for (const e of list ?? []) {
      const key = `${e.code}|${e.description}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({
        code: str(e.code), description: str(e.description),
        followup: str(e.followupAction), resolution: str(e.possibleResolutions), source,
      })
    }
  }
  add(raw.errors, 'Response')
  add(raw.subscriber?.aaaErrors, 'Subscriber')
  add(raw.payer?.aaaErrors, 'Payer')
  for (const d of raw.dependents ?? []) add(d.aaaErrors, 'Dependent')
  return out
}

export function buildDetail(raw: Raw, outcome: string): EligibilityDetail {
  const plan = raw.planInformation ?? {}
  const dates = raw.planDateInformation ?? {}
  const statuses: Raw[] = raw.planStatus ?? []
  const benefits: Raw[] = raw.benefitsInformation ?? []
  const sub = raw.subscriber ?? {}

  const first = (...keys: string[]) => {
    for (const k of keys) if (dates[k]) return isoDate(dates[k])
    return null
  }
  const usedDates = new Set(['planBegin', 'eligibilityBegin', 'policyEffective', 'benefitBegin', 'benefit',
    'planEnd', 'eligibilityEnd', 'policyExpiration', 'benefitEnd'])
  const serviceTypeCodes = [...new Set(statuses.flatMap(s => s.serviceTypeCodes ?? []).map(String))]

  const groups: BenefitGroup[] = [...GROUPS, { ...OTHER, codes: [] as string[] }].map(g => ({
    key: g.key, label: g.label, rows: { in: [], out: [], other: [] },
  }))
  for (const b of benefits) {
    const code = String(b.code ?? '')
    const def = GROUPS.find(g => g.codes.includes(code))
    const target = groups.find(g => g.key === (def?.key ?? OTHER.key))!
    target.rows[networkOf(b)].push(rowOf(b))
  }

  return {
    header: {
      outcome,
      payerName: str(raw.payer?.name),
      tradingPartnerServiceId: str(raw.tradingPartnerServiceId),
      controlNumber: str(raw.controlNumber),
      applicationMode: str(raw.meta?.applicationMode),
    },
    plan: {
      groupNumber: str(plan.groupNumber),
      groupName: str(plan.groupDescription),
      planNumber: str(plan.planNumber) ?? str(benefits.find(b => b.benefitsAdditionalInformation?.planNumber)?.benefitsAdditionalInformation.planNumber),
      planDescription: str(statuses.find(s => s.planDetails)?.planDetails)
        ?? str(benefits.find(b => b.planCoverage)?.planCoverage),
      effective: first('planBegin', 'eligibilityBegin', 'policyEffective', 'benefitBegin', 'benefit'),
      term: first('planEnd', 'eligibilityEnd', 'policyExpiration', 'benefitEnd'),
      serviceTypeCodes,
      otherDates: Object.entries(dates)
        .filter(([k, v]) => !usedDates.has(k) && v)
        .map(([k, v]) => ({ label: k.replace(/([A-Z])/g, ' $1').toLowerCase(), date: isoDate(v)! })),
    },
    subscriber: {
      memberId: str(sub.memberId), firstName: str(sub.firstName), lastName: str(sub.lastName),
      dob: isoDate(sub.dateOfBirth), gender: str(sub.gender),
    },
    dependents: (raw.dependents ?? []).map((d: Raw) => ({
      firstName: str(d.firstName), lastName: str(d.lastName), dob: isoDate(d.dateOfBirth),
      gender: str(d.gender), relation: str(d.relationToSubscriber), planNumber: str(d.planNumber),
    })),
    groups: groups.filter(g => g.rows.in.length + g.rows.out.length + g.rows.other.length > 0),
    errors: collectErrors(raw),
  }
}
