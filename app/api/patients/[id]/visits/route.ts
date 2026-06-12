import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
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
  const { id } = await context.params
  const body = await req.json()
  const { providerId } = body

  const patient = await prisma.patient.findUnique({
    where: { id },
    include: { facility: true },
  })

  if (!patient) return NextResponse.json({ error: 'Patient not found' }, { status: 404 })

  const provider = await prisma.provider.findUnique({
    where: { id: providerId },
  })

  if (!provider) return NextResponse.json({ error: 'Provider not found' }, { status: 404 })

  const visit = await prisma.visit.create({
    data: {
      patientId: patient.id,
      providerId: provider.id,
      visitDate: new Date(),
      visitType: 'established',
      facilityType: patient.facilityType,
      careflowType: 'at_risk_podiatry',
      status: 'draft',
    },
  })

  return NextResponse.json(visit)
}
