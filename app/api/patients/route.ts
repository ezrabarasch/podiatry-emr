import { NextResponse } from 'next/server'
import { PayerType } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getSessionUser, requireRole } from '@/lib/auth'

export async function GET(req: Request) {
  if (!(await getSessionUser())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim() ?? ''
  const facilityId = searchParams.get('facilityId') ?? ''
  const payerType = searchParams.get('payerType') ?? ''
  // A search spans active + inactive; the default list is active-only.
  const includeInactive = searchParams.get('includeInactive') === 'true' || q.length > 0
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1)
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '25', 10) || 25))

  const where = {
    ...(includeInactive ? {} : { active: true }),
    ...(facilityId ? { facilityId } : {}),
    ...(payerType in PayerType ? { coverages: { some: { payerType: payerType as PayerType } } } : {}),
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
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.patient.count({ where }),
  ])

  return NextResponse.json({ patients, total, page, limit })
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
