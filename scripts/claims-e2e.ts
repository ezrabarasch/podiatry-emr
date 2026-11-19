// End-to-end claims pipeline check against a SCRATCH database (never point DATABASE_URL at a real one).
// Creates its own fixture, generates claims, submits one to Stedi in TEST mode (needs STEDI_API_KEY), then drives
// the payer responses with fixtures (277CA accepted, 835 paid / partial / denied) and asserts every transition.
// Run: DATABASE_URL=<scratch> STEDI_API_KEY=... npx ts-node --transpile-only scripts/claims-e2e.ts
import assert from 'node:assert/strict'
import { PrismaClient } from '@prisma/client'
import { applyAcknowledgment, applyEra, generateClaims, submitClaim, voidClaim, resubmitClaim, claimSummary, listClaims, denialQueue, claimDetail } from '../lib/claims-service'
import type { ParsedEra } from '../lib/claims-stedi'

const db = new PrismaClient()
const actor = { id: '', role: 'ADMIN' }
const era = (pcn: string, p: Partial<ParsedEra>): ParsedEra => ({ pcn, claimStatusCode: '1', charge: 85, paid: 0, patientResponsibility: 0, adjustments: [], lines: [], ...p })
const step = (s: string) => console.log(`\n== ${s}`)

async function main() {
  const url = process.env.DATABASE_URL ?? ''
  assert.match(url, /claims_scratch/, 'refusing to run: DATABASE_URL is not the scratch DB')

  step('fixture')
  const practice = await db.practice.create({ data: { name: 'Scratch Podiatry', tin: '123456789', groupNpi: '1234567893', address: '1 Practice Way, Hartford, CT 06103', phone: '2035550100' } })
  const facility = await db.facility.create({ data: { name: 'Scratch SNF', facilityType: 'SNF', posCode: '31', npi: '1234567893', address: '100 Main St, Milford, CT 06460', practiceId: practice.id } })
  const provider = await db.user.create({ data: { username: `e2e-prov-${Date.now()}`, firstName: 'Pat', lastName: 'Foot', credentials: 'DPM', role: 'PROVIDER', password: 'x', npi: '1234567893', phone: '2035550101' } })
  actor.id = provider.id
  const patient = await db.patient.create({ data: { facilityId: facility.id, firstName: 'Test', lastName: 'Patient', dob: new Date('1940-03-02T12:00:00Z'), facilityType: 'SNF', gender: 'F' } })
  await db.patientCoverage.create({ data: { patientId: patient.id, payerName: 'Medicare', payerType: 'MEDICARE', memberId: '1EG4TE5MK73', isPrimary: true } })
  await db.feeScheduleItem.upsert({ where: { cptCode: '11721' }, create: { cptCode: '11721', amount: 85 }, update: { amount: 85 } })
  const dates = ['2026-10-01', '2026-10-08', '2026-10-15']
  for (const d of dates) {
    await db.visit.create({
      data: {
        patientId: patient.id, providerId: provider.id, visitDate: new Date(`${d}T15:00:00Z`), facilityType: 'SNF', status: 'signed', signedAt: new Date(),
        note: { create: { noteText: 'e2e', diagnoses: [{ icd10: 'B35.1', description: 'Tinea unguium' }], cptCodes: [{ code: '11721', description: 'Debride nails 6+', qualifier: 'class_b' }] } },
      },
    })
  }

  step('generate (3 signed visits -> 3 Ready claims; second run is a no-op)')
  const g = await generateClaims(db, provider.id)
  console.log(g)
  assert.equal(g.generated, 3); assert.equal(g.ready, 3); assert.equal(g.failed, 0)
  assert.equal((await generateClaims(db, provider.id)).generated, 0)
  const claims = await db.claim.findMany({ orderBy: { patientControlNumber: 'asc' } })
  assert.ok(claims.every(c => c.status === 'Ready' && c.patientControlNumber.length <= 20 && /^QMD-\d{4}-\d{4}$/.test(c.patientControlNumber)))
  assert.equal(Number(claims[0].totalCharges), 85)
  const [c1, c2, c3] = claims

  step('submit claim 1 to Stedi (TEST mode, live call)')
  const sub = await submitClaim(db, c1.id, actor)
  console.log(JSON.stringify(sub).slice(0, 700))
  const after1 = await db.claim.findUniqueOrThrow({ where: { id: c1.id } })
  console.log('status after submit:', after1.status, 'correlationId:', after1.stediCorrelationId ?? '(none)')
  if (sub.ok) assert.equal(after1.status, 'Submitted')
  else assert.equal(after1.status, 'Ready') // a failed send must put the claim back
  assert.equal((await submitClaim(db, c1.id, actor)).ok && sub.ok ? 'double' : 'single', 'single') // never sent twice

  // The remaining steps use fixtures so they do not depend on payer responses. Claims 2 and 3 are
  // marked Submitted directly (they were never sent anywhere).
  await db.claim.updateMany({ where: { id: { in: [c1.id, c2.id, c3.id] } }, data: { status: 'Submitted', submittedAt: new Date(Date.now() - 40 * 86400000) } })

  step('277CA: A2 -> Awaiting Payment; duplicate event ignored; rejection path')
  const ack = await applyAcknowledgment(db, c1.id, [{ category: 'A2', statusCode: '20' }], { stediEventId: 'evt-ack-1', correlationId: 'corr-1' })
  assert.equal(ack.status, 'AwaitingPayment')
  assert.equal((await applyAcknowledgment(db, c1.id, [{ category: 'A2', statusCode: '20' }], { stediEventId: 'evt-ack-1' })).duplicate, true)
  assert.equal((await applyAcknowledgment(db, c3.id, [{ category: 'A7', statusCode: '164', message: 'Subscriber ID invalid' }], { stediEventId: 'evt-ack-3' })).status, 'Rejected')

  step('835: full paid / partial / denied')
  const full = await applyEra(db, c1.id, era(c1.patientControlNumber, { paid: 60, adjustments: [{ group: 'CO', code: '45', description: 'Contractual', amount: 25 }] }), { stediEventId: 'evt-era-1' })
  assert.equal(full.status, 'FullPaidClosed')
  assert.equal((await applyEra(db, c1.id, era(c1.patientControlNumber, { paid: 60 }), { stediEventId: 'evt-era-1' })).duplicate, true)
  const part = await applyEra(db, c2.id, era(c2.patientControlNumber, { paid: 40, adjustments: [{ group: 'CO', code: '45', description: 'Contractual', amount: 20 }] }), { stediEventId: 'evt-era-2' })
  assert.equal(part.status, 'PartialPaidPending')
  // c3 was rejected -> resubmit creates a linked claim; deny that one via ERA after faking its submission
  const rs = await resubmitClaim(db, c3.id, actor.id, 'resubmit')
  assert.equal(rs.claim.parentClaimId, c3.id)
  await db.claim.update({ where: { id: rs.claim.id }, data: { status: 'Submitted', submittedAt: new Date(Date.now() - 10 * 86400000) } })
  const den = await applyEra(db, rs.claim.id, era(rs.claim.patientControlNumber, { claimStatusCode: '4', paid: 0, adjustments: [{ group: 'CO', code: '50', description: 'Not medically necessary', amount: 85 }] }), { stediEventId: 'evt-era-3' })
  assert.equal(den.status, 'Denied')

  step('reads: list / summary / denial queue / detail')
  const list = await listClaims(db, {}, 1, 25)
  assert.equal(list.total, 4)
  assert.equal(list.claims[0].status, 'Denied') // problems first
  const sum = await claimSummary(db)
  console.log({ openClaims: sum.openClaims, totalOutstanding: sum.totalOutstanding, avgDaysInAR: sum.avgDaysInAR, cleanClaimRate: sum.cleanClaimRate })
  assert.equal(sum.openClaims, 2) // partial paid + denied (c1 closed, c3 rejected is not AR)
  const dq = await denialQueue(db, {})
  assert.ok(dq.groups.some(x => x.code === 'CO-50'))
  const det = await claimDetail(db, c2.id)
  assert.ok(det && det.events.length >= 3 && det.serviceLines[0].paid === 40)

  step('write-off + void rules')
  const { writeOffClaim } = await import('../lib/claims-service')
  assert.equal((await writeOffClaim(db, c2.id, actor.id, 'timely filing')).status, 'PartialPaidClosed')
  await assert.rejects(writeOffClaim(db, c2.id, actor.id, 'again'))
  await assert.rejects(voidClaim(db, c1.id, actor.id, 'closed claims cannot be voided'))

  console.log('\nE2E OK')
}

main().catch(e => { console.error(e); process.exitCode = 1 }).finally(() => db.$disconnect())
