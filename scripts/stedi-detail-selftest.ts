// Self-check for the Eligibility tab's detail builder (lib/stedi-detail.ts). Pure logic, no DB.
// Fixtures are condensed from real Stedi test-mode responses.
//
//   TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node"}' npx ts-node --transpile-only scripts/stedi-detail-selftest.ts

import assert from 'assert'
import { buildDetail, isoDate, pctLabel } from '../lib/stedi-detail'

assert.strictEqual(isoDate('20240101'), '2024-01-01')
assert.strictEqual(isoDate('20240101-20241231'), '2024-01-01-2024-12-31')
assert.strictEqual(isoDate(undefined), null)
assert.strictEqual(pctLabel('0.8'), '80%')   // Stedi sends a decimal fraction
assert.strictEqual(pctLabel('0'), '0%')
assert.strictEqual(pctLabel(undefined), null)

const aetna = {
  controlNumber: '000000001', tradingPartnerServiceId: '60054',
  meta: { applicationMode: 'test' }, payer: { name: 'AETNA INC' },
  subscriber: { memberId: 'AETNA9wcSu', firstName: 'John', lastName: 'Doe', dateOfBirth: '19800101', gender: 'M' },
  planInformation: { groupNumber: '916700514772464', groupDescription: 'ACME CORP' },
  planDateInformation: { planBegin: '20240101', planEnd: '20241231', service: '20241126' },
  planStatus: [
    { statusCode: '1', planDetails: 'Aetna Choice POS II', serviceTypeCodes: ['30'] },
    { statusCode: '1', serviceTypeCodes: ['30', '98'] },
  ],
  benefitsInformation: [
    { code: '1', name: 'Active Coverage', serviceTypeCodes: ['30'], coverageLevel: 'Family', inPlanNetworkIndicatorCode: 'W' },
    { code: 'B', name: 'Co-Payment', benefitAmount: '25', serviceTypes: ['Professional (Physician) Visit - Office'], serviceTypeCodes: ['98'],
      coverageLevel: 'Family', inPlanNetworkIndicatorCode: 'Y', authOrCertIndicator: 'N',
      additionalInformation: [{ description: 'Specialist copay applies' }] },
    { code: 'B', name: 'Co-Payment', benefitAmount: '0', serviceTypeCodes: ['98'], inPlanNetworkIndicatorCode: 'N' },
    { code: 'C', name: 'Deductible', benefitAmount: '100', timeQualifier: 'Calendar Year', coverageLevel: 'Individual',
      serviceTypeCodes: ['30'], inPlanNetworkIndicatorCode: 'Y' },
    { code: 'A', name: 'Co-Insurance', benefitPercent: '0.2', serviceTypeCodes: ['30'], inPlanNetworkIndicatorCode: 'N' },
    { code: 'F', name: 'Limitations', serviceTypeCodes: ['30'], inPlanNetworkIndicatorCode: 'W', authOrCertIndicator: 'U' },
    { code: 'I', name: 'Non-Covered', serviceTypeCodes: ['86'] },
    { code: 'X', name: 'Health Care Facility', serviceTypeCodes: ['1'] },
  ],
}

const d = buildDetail(aetna, 'active')
assert.strictEqual(d.header.payerName, 'AETNA INC')
assert.strictEqual(d.header.tradingPartnerServiceId, '60054')
assert.strictEqual(d.header.controlNumber, '000000001')
assert.strictEqual(d.header.applicationMode, 'test')
assert.strictEqual(d.plan.groupNumber, '916700514772464')
assert.strictEqual(d.plan.groupName, 'ACME CORP')
assert.strictEqual(d.plan.planDescription, 'Aetna Choice POS II')
assert.strictEqual(d.plan.effective, '2024-01-01')
assert.strictEqual(d.plan.term, '2024-12-31')
assert.deepStrictEqual(d.plan.serviceTypeCodes, ['30', '98'])           // de-duplicated across planStatus rows
assert.deepStrictEqual(d.plan.otherDates, [{ label: 'service', date: '2024-11-26' }])
assert.deepStrictEqual(d.subscriber, { memberId: 'AETNA9wcSu', firstName: 'John', lastName: 'Doe', dob: '1980-01-01', gender: 'M' })

const g = (k: string) => d.groups.find(x => x.key === k)!
assert.deepStrictEqual(d.groups.map(x => x.key), ['coverage', 'copay', 'deductible', 'coinsurance', 'limitations', 'exclusions', 'other'])
// in-network and out-of-network copays are kept apart
assert.strictEqual(g('copay').rows.in.length, 1)
assert.strictEqual(g('copay').rows.out.length, 1)
assert.strictEqual(g('copay').rows.in[0].amount, '25')
assert.strictEqual(g('copay').rows.in[0].authRequired, 'No')
assert.deepStrictEqual(g('copay').rows.in[0].notes, ['Specialist copay applies'])
assert.deepStrictEqual(g('copay').rows.in[0].serviceTypes, ['Professional (Physician) Visit - Office']) // names win over codes
assert.strictEqual(g('deductible').rows.in[0].period, 'Calendar Year')
assert.strictEqual(g('deductible').rows.in[0].level, 'Individual')
assert.strictEqual(g('coinsurance').rows.out[0].percent, '20%')
assert.strictEqual(g('coverage').rows.other[0].level, 'Family')          // W = not network-specific
assert.strictEqual(g('limitations').rows.other[0].authRequired, 'Unknown')
assert.strictEqual(g('exclusions').rows.other.length, 1)                 // no network indicator -> "other"
assert.strictEqual(g('other').rows.other[0].code, 'X')                   // unmapped codes are kept, not dropped
assert.deepStrictEqual(d.errors, [])

// every payer error is surfaced, de-duplicated across response/subscriber lists
const bad = buildDetail({
  meta: { applicationMode: 'production' },
  errors: [{ code: '71', description: 'Birth Date Does Not Match', followupAction: 'Please Correct and Resubmit', possibleResolutions: 'Check DOB' }],
  subscriber: { aaaErrors: [{ code: '71', description: 'Birth Date Does Not Match' }, { code: '15', description: 'Required data missing' }] },
}, 'error')
assert.strictEqual(bad.errors.length, 2)
assert.deepStrictEqual(bad.errors[0], { code: '71', description: 'Birth Date Does Not Match', followup: 'Please Correct and Resubmit', resolution: 'Check DOB', source: 'Response' })
assert.strictEqual(bad.errors[1].code, '15')
assert.strictEqual(bad.header.applicationMode, 'production')
assert.strictEqual(bad.groups.length, 0)

// empty / sparse responses never throw
assert.doesNotThrow(() => buildDetail({}, 'unknown'))

console.log('stedi-detail selftest: all assertions passed')
