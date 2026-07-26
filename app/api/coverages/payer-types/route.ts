import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'

// Distinct payer types present in patient_coverages — drives the patient list
// payer filter so it only offers values that will actually match something.
export async function GET() {
  if (!(await getSessionUser())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rows = await prisma.patientCoverage.groupBy({
    by: ['payerType'],
    where: { isPrimary: true },
    orderBy: { payerType: 'asc' },
  })

  return NextResponse.json(rows.map(r => r.payerType))
}
