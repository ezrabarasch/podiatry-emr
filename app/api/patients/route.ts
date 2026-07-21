import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, requireRole } from '@/lib/auth'

export async function GET(req: Request) {
  if (!(await getSessionUser())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim() ?? ''
  // A search spans active + inactive; the default list is active-only.
  const includeInactive = searchParams.get('includeInactive') === 'true' || q.length > 0

  const patients = await prisma.patient.findMany({
    where: {
      ...(includeInactive ? {} : { active: true }),
      ...(q
        ? {
            OR: [
              { firstName: { contains: q, mode: 'insensitive' } },
              { lastName: { contains: q, mode: 'insensitive' } },
              { pccPatientId: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    include: {
      facility: true,
      coverages: { select: { payerType: true } },
      _count: { select: { visits: true } },
    },
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
