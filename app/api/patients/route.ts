import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, requireRole } from '@/lib/auth'

export async function GET() {
  if (!(await getSessionUser())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const patients = await prisma.patient.findMany({
    where: { active: true },
    include: { facility: true },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  })

  return NextResponse.json(patients)
}

export async function POST(req: Request) {
  const { error } = await requireRole(['PROVIDER', 'ADMIN'])
  if (error) return error

  const body = await req.json()
  const { firstName, lastName, dob, facilityId, pccPatientId } = body

  const facility = await prisma.facility.findUnique({ where: { id: facilityId } })
  if (!facility) return NextResponse.json({ error: 'Facility not found' }, { status: 404 })

  const patient = await prisma.patient.create({
    data: {
      firstName,
      lastName,
      dob: new Date(dob),
      facilityId,
      facilityType: facility.facilityType,
      pccPatientId: pccPatientId ?? null,
    },
    include: { facility: true },
  })

  return NextResponse.json(patient)
}
