import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, requireRole } from '@/lib/auth'

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!(await getSessionUser())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await context.params

  const visits = await prisma.visit.findMany({
    where: { patientId: id },
    include: {
      provider: {
        select: { firstName: true, lastName: true, credentials: true }
      }
    },
    orderBy: { visitDate: 'desc' },
  })

  return NextResponse.json(visits)
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireRole(['PROVIDER', 'ADMIN'])
  if (error) return error

  const { id } = await context.params

  const patient = await prisma.patient.findUnique({
    where: { id },
    include: { facility: true },
  })

  if (!patient) return NextResponse.json({ error: 'Patient not found' }, { status: 404 })

  const visit = await prisma.visit.create({
    data: {
      patientId: patient.id,
      providerId: user.id,
      visitDate: new Date(),
      visitType: 'established',
      facilityType: patient.facilityType,
      careflowType: 'at_risk_podiatry',
      status: 'draft',
    },
  })

  return NextResponse.json(visit)
}
