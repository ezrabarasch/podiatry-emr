import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!(await getSessionUser())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await context.params

  // The Visits and Diagnoses tabs page their own data; this route only carries
  // the header/stat-card summary — counts plus the single latest row of each.
  const [patient, signedVisitCount] = await Promise.all([
    prisma.patient.findUnique({
      where: { id },
      include: {
        facility: true,
        coverages: { where: { active: true }, orderBy: { isPrimary: 'desc' } },
        diagnoses: { where: { active: true }, orderBy: { syncedAt: 'desc' }, take: 1, select: { syncedAt: true } },
        visits: { orderBy: { visitDate: 'desc' }, take: 1, select: { visitDate: true, visitType: true, status: true } },
        _count: { select: { visits: true, diagnoses: { where: { active: true } } } },
      },
    }),
    prisma.visit.count({ where: { patientId: id, status: 'signed' } }),
  ])

  if (!patient) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ ...patient, signedVisitCount })
}
