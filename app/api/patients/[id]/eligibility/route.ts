import { NextResponse } from 'next/server'
import { getSessionUser, requireRole } from '@/lib/auth'
import { CHECK_SELECT, enqueueEligibility } from '@/lib/stedi'

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { prisma } = session
  const { id } = await context.params

  const patient = await prisma.patient.findUnique({ where: { id }, select: { id: true } })
  if (!patient) return NextResponse.json({ error: 'Patient not found' }, { status: 404 })

  const check = await prisma.stediEligibilityCheck.findFirst({
    where: { patientId: id },
    orderBy: { requestedAt: 'desc' },
    select: CHECK_SELECT,
  })
  return NextResponse.json({ check })
}

// "Re-check" button.
export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { prisma, error } = await requireRole(['PROVIDER', 'ADMIN', 'OFFICE'])
  if (error) return error
  const { id } = await context.params

  const patient = await prisma.patient.findUnique({ where: { id }, select: { id: true } })
  if (!patient) return NextResponse.json({ error: 'Patient not found' }, { status: 404 })

  const { id: checkId } = await enqueueEligibility(prisma, id)
  const check = await prisma.stediEligibilityCheck.findUnique({ where: { id: checkId }, select: CHECK_SELECT })
  return NextResponse.json({ check })
}
