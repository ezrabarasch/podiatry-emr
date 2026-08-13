import { NextResponse } from 'next/server'
import { PayerType } from '@prisma/client'
import { getSessionUser, requireRole } from '@/lib/auth'
import { pageParams } from '@/lib/pagination'

export async function GET(req: Request) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { prisma } = session

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim() ?? ''
  const facilityId = searchParams.get('facilityId') ?? ''
  const payerType = searchParams.get('payerType') ?? ''
  // A search spans active + inactive; the default list is active-only.
  const includeInactive = searchParams.get('includeInactive') === 'true' || q.length > 0
  const { page, limit, skip, take } = pageParams(searchParams)

  const where = {
    ...(includeInactive ? {} : { active: true }),
    ...(facilityId ? { facilityId } : {}),
    // Payer filter matches the patient's primary coverage only.
    ...(payerType in PayerType
      ? { coverages: { some: { payerType: payerType as PayerType, isPrimary: true } } }
      : {}),
    ...(q
      ? {
          OR: [
            { firstName: { contains: q, mode: 'insensitive' as const } },
            { lastName: { contains: q, mode: 'insensitive' as const } },
            { pccPatientId: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  }

  const [patients, total] = await Promise.all([
    prisma.patient.findMany({
      where,
      include: {
        facility: true,
        coverages: { select: { payerType: true } },
        _count: { select: { visits: true } },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      skip,
      take,
    }),
    prisma.patient.count({ where }),
  ])

  return NextResponse.json({ patients, total, page, limit })
}

export async function POST(req: Request) {
  const { user, prisma, error } = await requireRole(['PROVIDER', 'ADMIN'])
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
      tenantId: user.tenantId,
    },
    include: { facility: true },
  })

  return NextResponse.json(patient)
}
