import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'

// Distinct payer types present in patient_coverages — drives the patient list
// payer filter so it only offers values that will actually match something.
// PatientCoverage is patient-ancestry-scoped (lib/scopedPrisma.ts), so this
// only ever reflects payer types among patients in the caller's own scope.
export async function GET() {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { prisma } = session

  const rows = await prisma.patientCoverage.groupBy({
    by: ['payerType'],
    where: { isPrimary: true },
    orderBy: { payerType: 'asc' },
  })

  return NextResponse.json(rows.map(r => r.payerType))
}
