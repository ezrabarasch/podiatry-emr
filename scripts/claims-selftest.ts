// Self-test for the pure claims logic (no DB, no network).
// Run: TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node"}' npx ts-node --transpile-only scripts/claims-selftest.ts
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { buildClaim, deriveModifiers, effectivePos, generatePatientControlNumberFrom, parseAddress, scrubClaim, ymdInTz, type ClaimContext } from '../lib/claims'
import { computeEraOutcome, outcomeOf, parse277Report, parseEraReport, parseX12Statuses, verifyStediSignature } from '../lib/claims-stedi'

const base = (): ClaimContext => ({
  visit: {
    id: 'v1',
    visitDate: new Date('2026-11-19T03:00:00Z'), // 10pm on Nov 18 in New York
    note: {
      cptCodes: [{ code: '99308', description: 'Subsequent NF care', qualifier: null }, { code: '11721', description: 'Debridement of nails, 6+', qualifier: 'class_b' }],
      diagnoses: [{ icd10: 'L60.0', description: 'Ingrowing nail' }, { icd10: 'I10', description: 'Hypertension' }, { icd10: 'L84', description: 'Corns' }],
    },
  },
  patient: { firstName: 'Tennille', lastName: 'Vallejo', dob: new Date('1933-11-04T00:00:00Z'), gender: 'Female' },
  coverage: { payerName: 'Medicare', payerType: 'MEDICARE', memberId: '1EG4TE5MK73', groupId: null },
  provider: { firstName: 'Richard', lastName: 'See', credentials: 'DPM', npi: '1234567893', phone: '555-111-2222' },
  facility: { name: 'Facility 12', facilityType: 'SNF', address: '100 Main St, Miami, FL 33101', npi: null, posCode: null },
  practice: { name: 'DPM TEST', tin: '12-3456789', groupNpi: '1999999984', address: '200 Ocean Dr, Miami Beach, FL 33139-1234', phone: '(555) 333-4444' },
  fees: { '99308': 125, '11721': 95 },
  payerId: 'CMS',
  patientControlNumber: 'QMD-2026-0001',
  now: new Date('2026-11-19T15:00:00Z'),
})

// ── helpers ──
assert.deepEqual(parseAddress('100 Main St, Miami, FL 33101'), { address1: '100 Main St', city: 'Miami', state: 'FL', postalCode: '33101' })
assert.deepEqual(parseAddress('1 A St, Ste 4, Miami, fl 33101-1234'), { address1: '1 A St, Ste 4', city: 'Miami', state: 'FL', postalCode: '331011234' })
assert.equal(parseAddress('Miami FL'), null)
assert.equal(parseAddress(null), null)
assert.equal(ymdInTz(new Date('2026-11-19T03:00:00Z')), '2026-11-18') // DOS is the New York date
assert.equal(generatePatientControlNumberFrom(7, new Date('2026-11-19T15:00:00Z')), 'QMD-2026-0007')
assert.ok(generatePatientControlNumberFrom(123456, new Date()).length <= 20)
assert.deepEqual(deriveModifiers('99308', null, true), ['25'])
assert.deepEqual(deriveModifiers('99308', null, false), [])
assert.deepEqual(deriveModifiers('11721', 'class_b', true), ['Q8'])
assert.deepEqual(deriveModifiers('11055', 'class_c', true), ['Q9'])
assert.equal(effectivePos({ ...base().facility, posCode: '13' }), '13')
assert.equal(effectivePos(base().facility), '31')
assert.equal(effectivePos({ ...base().facility, facilityType: 'OTHER' }), null)

// ── payload ──
const d = buildClaim(base())
const p = d.payload as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
assert.equal(p.usageIndicator, 'T')
assert.equal(p.tradingPartnerServiceId, 'CMS')
assert.equal(p.claimInformation.patientControlNumber, 'QMD-2026-0001')
assert.equal(p.claimInformation.claimChargeAmount, '220.00')
assert.equal(p.claimInformation.claimFilingCode, 'MB')
assert.equal(p.claimInformation.placeOfServiceCode, '31')
assert.deepEqual(p.claimInformation.healthCareCodeInformation, [
  { diagnosisTypeCode: 'ABK', diagnosisCode: 'L600' }, { diagnosisTypeCode: 'ABF', diagnosisCode: 'I10' }, { diagnosisTypeCode: 'ABF', diagnosisCode: 'L84' },
])
const lines = p.claimInformation.serviceLines
assert.equal(lines.length, 2)
assert.equal(lines[0].serviceDate, '20261118')
assert.deepEqual(lines[0].professionalService.procedureModifiers, ['25'])
assert.deepEqual(lines[1].professionalService.procedureModifiers, ['Q8'])
assert.deepEqual(lines[0].professionalService.compositeDiagnosisCodePointers.diagnosisCodePointers, ['1', '2', '3'])
assert.equal(lines[0].providerControlNumber, 'QMD-2026-0001-L1')
assert.equal(lines[0].renderingProvider.npi, '1234567893')
assert.equal(p.billing.npi, '1999999984')
assert.equal(p.billing.employerId, '123456789')
assert.equal(p.billing.taxonomyCode, '213E00000X')
assert.equal(p.billing.address.postalCode, '331391234')
assert.equal(p.subscriber.dateOfBirth, '19331104')
assert.equal(p.subscriber.gender, 'F')
assert.equal(p.subscriber.address.city, 'Miami')
assert.equal(JSON.stringify(p).includes('null'), false) // no nulls/holes in what we send
assert.deepEqual(d.diagnoses.map(x => [x.pointer, x.icd10, x.rank]), [['A', 'L60.0', 'Primary'], ['B', 'I10', 'Secondary'], ['C', 'L84', 'Diagnosis #3']])
assert.equal(d.totalCharges, 220)

// ── scrub ──
assert.deepEqual(scrubClaim(base()), { pass: true, errors: [] })
const fails = (mut: (c: ClaimContext) => void, match: RegExp, opts?: { duplicateOf?: string }) => {
  const c = base(); mut(c)
  const r = scrubClaim(c, opts)
  assert.equal(r.pass, false, `expected scrub to fail for ${match}`)
  assert.ok(r.errors.some(e => match.test(e)), `no error matching ${match}: ${r.errors.join(' | ')}`)
}
fails(c => { c.provider.npi = null }, /NPI/)
fails(c => { c.provider.npi = '123' }, /NPI/)
fails(c => { c.coverage = null }, /no active primary coverage/)
fails(c => { c.coverage!.memberId = '' }, /member ID/)
fails(c => { c.payerId = null }, /payer ID/)
fails(c => { c.facility.facilityType = 'OTHER' }, /place-of-service/)
fails(c => { c.facility.address = 'nowhere' }, /Facility address/)
fails(c => { c.practice = null }, /practice/i)
fails(c => { c.practice!.tin = null }, /TIN/)
fails(c => { c.practice!.address = null }, /Practice address/)
fails(c => { c.fees = {} }, /No fee/)
fails(c => { c.visit.note = null }, /no CPT/)
fails(c => { (c.visit.note!.cptCodes as unknown[]).push({ code: '1234' }) }, /5-character/)
fails(c => { c.visit.note!.diagnoses = [] }, /no diagnosis/)
fails(c => { c.visit.note!.diagnoses = [{ icd10: 'XX', description: '' }] }, /ICD-10/)
fails(c => { c.visit.visitDate = new Date('2026-11-25T15:00:00Z') }, /future/)
fails(() => { /* duplicate */ }, /Duplicate of claim QMD-2026-0099/, { duplicateOf: 'QMD-2026-0099' })

// ── 277CA from the synchronous response (X12) ──
const isa = 'ISA*00*          *00*          *ZZ*SENDER         *ZZ*RECEIVER       *240702*0815*^*00501*000000001*0*T*:~'
assert.equal(isa.length, 106)
const x12 = (stc: string) => `${isa}GS*HN*A*B*20240702*0815*1*X*005010X214~ST*277*0001~${stc}~SE*3*0001~GE*1*1~IEA*1*000000001~`
const ok = parseX12Statuses(x12('STC*A1:19:PR*20240702*WQ*220.00'))
assert.deepEqual(ok.map(c => [c.category, c.statusCode, c.entity]), [['A1', '19', 'PR']])
assert.equal(outcomeOf(ok), 'accepted')
const rej = parseX12Statuses(x12('STC*A7:164:85*20240702*U*220.00'))
assert.equal(outcomeOf(rej), 'rejected')
assert.deepEqual(parseX12Statuses('not x12'), [])
assert.equal(outcomeOf([]), 'unknown')

// ── 277CA report JSON (Stedi docs example shape) ──
const r277 = { transactions: [{ payers: [{ claimStatusTransactions: [{
  claimTransactionBatchNumber: '01J1SNRJ0FP4ZE6EFWM4G4XB3N',
  claimStatusDetails: [{ patientClaimStatusDetails: [{ claims: [{ claimStatus: {
    patientAccountNumber: 'QMD-2026-0001', referencedTransactionTraceNumber: 'QMD-2026-0001',
    informationClaimStatuses: [{ statusInformationEffectiveDate: '20240702', informationStatuses: [
      { healthCareClaimStatusCategoryCode: 'A1', statusCode: '19', entityIdentifierCode: 'PR', statusCodeValue: 'Entity acknowledges receipt of claim/encounter.' },
      { healthCareClaimStatusCategoryCode: 'A2', statusCode: '20', entityIdentifierCode: 'QC', statusCodeValue: 'Accepted for processing.' }] }] } }] }] }],
}] }] }] }
const a = parse277Report(r277)
assert.equal(a.length, 1)
assert.equal(a[0].pcn, 'QMD-2026-0001')
assert.equal(a[0].correlationId, '01J1SNRJ0FP4ZE6EFWM4G4XB3N')
assert.equal(outcomeOf(a[0].codes), 'accepted')
assert.deepEqual(a[0].codes.map(c => c.category), ['A1', 'A2'])
assert.deepEqual(parse277Report({}), [])

// ── 835 ERA report JSON + payment outcomes ──
const era = (paid: string, pr: string, claimAdj: unknown[], lineAdj: unknown[], lineAllowed = '125', status = '1') => ({ transactions: [{
  paymentAndRemitReassociationDetails: { checkOrEFTTraceNumber: 'TRN123' },
  detailInfo: [{ paymentInfo: [{
    claimPaymentInfo: { patientControlNumber: 'QMD-2026-0001', claimStatusCode: status, totalClaimChargeAmount: '125', claimPaymentAmount: paid, patientResponsibilityAmount: pr },
    claimAdjustments: claimAdj,
    serviceLines: [{ lineItemControlNumber: 'QMD-2026-0001-L1', servicePaymentInformation: { adjudicatedProcedureCode: '99308', lineItemChargeAmount: '125', lineItemProviderPaymentAmount: paid },
      serviceSupplementalAmounts: { allowedActual: lineAllowed }, serviceAdjustments: lineAdj,
      healthCareCheckRemarkCodes: [{ codeListQualifierCode: 'HE', remarkCode: 'N130', remark: 'Consult plan benefit documents' }] }],
  }] }],
}] })
const ours = [{ lineNumber: 1, lineControlNumber: 'QMD-2026-0001-L1', cptCode: '99308' }]
// fully paid: $100 paid + $25 contractual (CO-45) = $125 charge
const full = parseEraReport(era('100', '0', [{ claimAdjustmentGroupCode: 'CO', adjustmentReasonCode1: '45', adjustmentReason1: 'Charge exceeds fee schedule', adjustmentAmount1: '25' }], [{ claimAdjustmentGroupCode: 'CO', adjustmentReasonCode1: '45', adjustmentAmount1: '25' }]))[0]
assert.equal(full.pcn, 'QMD-2026-0001'); assert.equal(full.traceNumber, 'TRN123')
const fo = computeEraOutcome(125, full, ours)
assert.equal(fo.status, 'FullPaidClosed'); assert.equal(fo.totalPaid, 100); assert.equal(fo.totalAdjustment, 25); assert.equal(fo.patientResponsibility, 0)
assert.equal(fo.lines[0].lineNumber, 1); assert.equal(fo.lines[0].paid, 100); assert.equal(fo.lines[0].reasons[0].code, '45'); assert.equal(fo.lines[0].remarks[0].code, 'N130')
// paid with patient responsibility (docs example: 500 paid + 300 PR of 800)
const pr = computeEraOutcome(800, parseEraReport({ transactions: [{ detailInfo: [{ paymentInfo: [{ claimPaymentInfo: { patientControlNumber: 'X', claimStatusCode: '1', totalClaimChargeAmount: '800', claimPaymentAmount: '500', patientResponsibilityAmount: '300' }, serviceLines: [] }] }] }] })[0], [])
assert.equal(pr.status, 'FullPaidClosed'); assert.equal(pr.patientResponsibility, 300)
// partial: $50 paid of $125, nothing explaining the rest -> still owed
const part = computeEraOutcome(125, parseEraReport(era('50', '0', [], [], '125'))[0], ours)
assert.equal(part.status, 'PartialPaidPending')
// denied: $0 paid
const den = computeEraOutcome(125, parseEraReport(era('0', '0', [{ claimAdjustmentGroupCode: 'CO', adjustmentReasonCode1: '16', adjustmentReason1: 'Missing information', adjustmentAmount1: '125' }], [], '0', '4'))[0], ours)
assert.equal(den.status, 'Denied'); assert.match(den.summary, /Denied/); assert.equal(den.reasons[0].code, '16')
assert.deepEqual(parseEraReport({}), [])

// ── webhook signature (Standard Webhooks) ──
const secretRaw = Buffer.from('super-secret-key-bytes-1234567890')
const secret = 'whsec_' + secretRaw.toString('base64')
const body = '{"id":"evt_1","type":"transaction.processed"}'
const ts = String(Math.floor(Date.now() / 1000))
const sig = createHmac('sha256', secretRaw).update(`msg_1.${ts}.${body}`).digest('base64')
const hdr = (over: Partial<{ id: string; timestamp: string; signature: string }> = {}) => ({ id: 'msg_1', timestamp: ts, signature: `v1,${sig}`, ...over })
assert.equal(verifyStediSignature(hdr(), body, secret), true)
assert.equal(verifyStediSignature(hdr({ signature: `v1,AAAA v1,${sig}` }), body, secret), true) // rotation: any match
assert.equal(verifyStediSignature(hdr(), body + ' ', secret), false)                          // tampered body
assert.equal(verifyStediSignature(hdr({ id: 'msg_2' }), body, secret), false)                  // tampered id
assert.equal(verifyStediSignature(hdr(), body, 'whsec_' + Buffer.from('other').toString('base64')), false)
assert.equal(verifyStediSignature(hdr({ timestamp: String(Number(ts) - 3600) }), body, secret), false) // stale / replay
assert.equal(verifyStediSignature({ id: null, timestamp: null, signature: null }, body, secret), false)
assert.equal(verifyStediSignature(hdr(), body, ''), false)

console.log('claims selftest: all assertions passed')
