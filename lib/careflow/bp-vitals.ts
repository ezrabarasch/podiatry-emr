// BP vitals coding rule — pure logic (SPEC confirmed 2026-08-25).
// No DB/Next.js imports here on purpose, so this stays trivially unit-testable
// (see scripts/bp-vitals-selftest.ts) — the DB-touching half lives in
// app/api/visits/[id]/generate/route.ts (computeBpCase).

// Tunable thresholds — Jonathan may move these to 130/80 later.
export const BP_SYSTOLIC_NORMAL_MAX = 120
export const BP_DIASTOLIC_NORMAL_MAX = 80
// Prefix match, not an exact list — catches subcodes (I11.0, I13.10, etc).
export const HTN_ICD10_PREFIXES = ['I10', 'I11', 'I12', 'I13', 'I14', 'I15', 'I16']
// SNF/NF vitals are taken on overnight rounds; the morning reading is that
// day's vital set. Window is visit-date-anchored, not visit-time-anchored —
// tighten to visit-start-time once the scheduler integration lands.
export const BP_WINDOW_TZ = 'America/New_York'
export const BP_WINDOW_START_HOUR = 0
export const BP_WINDOW_END_HOUR = 6
// ASSUMPTION, not yet independently confirmed: patient_observations.recordedDate
// is stored as UTC wall-clock (dt() in sync_to_emr.py parses PCC's "Z"-suffixed
// ISO8601 timestamps, and the DB session runs in GMT). All 2016 sample rows are
// consistent with this but don't prove it outright — verify against a freshly
// synced real-time reading before trusting this in production. Flip to false
// if recordedDate turns out to already be naive local time.
export const BP_RECORDED_DATE_IS_UTC = true

export type BpCase = { fieldValue: string; label: string; systolic: number; diastolic: number; unit: string | null }

/** NY (or BP_WINDOW_TZ) UTC offset in minutes, valid at the given instant — handles DST. */
export function tzOffsetMinutes(date: Date, timeZone: string): number {
  const part = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'shortOffset' })
    .formatToParts(date)
    .find(p => p.type === 'timeZoneName')?.value ?? 'GMT-5'
  const m = /GMT([+-]\d+)(?::(\d+))?/.exec(part)
  return m ? parseInt(m[1], 10) * 60 + (m[1].startsWith('-') ? -1 : 1) * parseInt(m[2] ?? '0', 10) : -300
}

/** [start, end) UTC bounds for the overnight vitals-rounds window on the visit's calendar date. */
export function bpWindowUtc(visitDate: Date): [Date, Date] {
  const y = visitDate.getUTCFullYear(), mo = visitDate.getUTCMonth(), d = visitDate.getUTCDate()
  const guessUtcMs = Date.UTC(y, mo, d, BP_WINDOW_START_HOUR, 0, 0)
  const offsetMin = tzOffsetMinutes(new Date(guessUtcMs), BP_WINDOW_TZ)
  // local wall-clock T corresponds to UTC instant (T - offset); offset is negative for US zones.
  const startUtcMs = guessUtcMs - offsetMin * 60000
  const endUtcMs = startUtcMs + (BP_WINDOW_END_HOUR - BP_WINDOW_START_HOUR) * 3600000
  return BP_RECORDED_DATE_IS_UTC
    ? [new Date(startUtcMs), new Date(endUtcMs)]
    : [new Date(Date.UTC(y, mo, d, BP_WINDOW_START_HOUR, 0, 0)), new Date(Date.UTC(y, mo, d, BP_WINDOW_END_HOUR, 0, 0))]
}

/** Case table (locked 2026-08-25): (normal/elevated) x (HTN dx present/absent). */
export function classifyBp(systolic: number, diastolic: number, hasHtn: boolean, unit: string | null): BpCase {
  const isNormal = systolic <= BP_SYSTOLIC_NORMAL_MAX && diastolic <= BP_DIASTOLIC_NORMAL_MAX
  if (isNormal && !hasHtn) return { fieldValue: 'normal_no_htn', label: 'Normal, No HTN', systolic, diastolic, unit }
  if (isNormal && hasHtn) return { fieldValue: 'normal_with_htn', label: 'Normal, w/HTN', systolic, diastolic, unit }
  if (!isNormal && hasHtn) return { fieldValue: 'elevated_with_htn', label: 'Elevated, w/HTN', systolic, diastolic, unit }
  return { fieldValue: 'elevated_no_htn', label: 'Elevated, No HTN', systolic, diastolic, unit }
}
