// Self-check for the BP vitals coding rule (lib/careflow/bp-vitals.ts).
// Pure-logic only (no DB) — the case classification + the DST-aware window math.
//
//   npx ts-node scripts/bp-vitals-selftest.ts

import assert from 'assert'
import { classifyBp, bpWindowUtc, tzOffsetMinutes } from '../lib/careflow/bp-vitals'

// ── classifyBp: all 4 cases, at the exact 120/80 boundary ──────────────────
assert.strictEqual(classifyBp(120, 80, false, 'mmHg').fieldValue, 'normal_no_htn')
assert.strictEqual(classifyBp(120, 80, true, 'mmHg').fieldValue, 'normal_with_htn')
assert.strictEqual(classifyBp(121, 80, false, 'mmHg').fieldValue, 'elevated_no_htn')   // systolic alone over
assert.strictEqual(classifyBp(120, 81, false, 'mmHg').fieldValue, 'elevated_no_htn')   // diastolic alone over, no htn
assert.strictEqual(classifyBp(120, 81, true, 'mmHg').fieldValue, 'elevated_with_htn')  // diastolic alone over, htn
assert.strictEqual(classifyBp(150, 95, true, 'mmHg').fieldValue, 'elevated_with_htn')
assert.strictEqual(classifyBp(150, 95, false, 'mmHg').fieldValue, 'elevated_no_htn')
assert.strictEqual(classifyBp(110, 70, true, 'mmHg').fieldValue, 'normal_with_htn')
console.log('classifyBp: case boundaries OK')

// ── tzOffsetMinutes: known winter (EST, -300) vs summer (EDT, -240) dates ──
assert.strictEqual(tzOffsetMinutes(new Date(Date.UTC(2026, 0, 15)), 'America/New_York'), -300) // Jan = EST
assert.strictEqual(tzOffsetMinutes(new Date(Date.UTC(2026, 6, 15)), 'America/New_York'), -240) // Jul = EDT
console.log('tzOffsetMinutes: DST offsets OK')

// ── bpWindowUtc: 6-hour window, correct UTC boundaries across DST ──────────
const [wStartEst, wEndEst] = bpWindowUtc(new Date(Date.UTC(2026, 0, 15))) // Jan 15 — EST (-5h)
assert.strictEqual(wStartEst.toISOString(), '2026-01-15T05:00:00.000Z') // 00:00 EST = 05:00 UTC
assert.strictEqual(wEndEst.toISOString(), '2026-01-15T11:00:00.000Z')   // 06:00 EST = 11:00 UTC
assert.strictEqual(wEndEst.getTime() - wStartEst.getTime(), 6 * 3600000)

const [wStartEdt] = bpWindowUtc(new Date(Date.UTC(2026, 6, 15))) // Jul 15 — EDT (-4h)
assert.strictEqual(wStartEdt.toISOString(), '2026-07-15T04:00:00.000Z') // 00:00 EDT = 04:00 UTC
console.log('bpWindowUtc: window boundaries OK (both DST sides)')

console.log('All BP vitals self-checks passed.')
