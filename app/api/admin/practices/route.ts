import { NextResponse } from 'next/server'
import { CareflowType, Prisma } from '@prisma/client'
import { requireRole } from '@/lib/auth'

const trimOrNull = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

export async function GET() {
  const { prisma, error } = await requireRole(['ADMIN'])
  if (error) return error

  const practices = await prisma.practice.findMany({
    orderBy: { name: 'asc' },
    include: {
      serviceTypes: true,
      _count: { select: { facilities: true, providers: true } },
    },
  })

  return NextResponse.json(
    practices.map(({ serviceTypes, _count, ...p }) => ({
      ...p,
      serviceTypes: serviceTypes.map(st => st.careflowType),
      facilityCount: _count.facilities,
      providerCount: _count.providers,
    }))
  )
}

export async function POST(req: Request) {
  const { user, prisma, error } = await requireRole(['ADMIN'])
  if (error) return error

  const b = await req.json()
  if (!b.name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  const serviceTypes = Array.isArray(b.serviceTypes) ? [...new Set(b.serviceTypes)] : []
  if (serviceTypes.length === 0) {
    return NextResponse.json({ error: 'At least one service type is required' }, { status: 400 })
  }
  if (!serviceTypes.every(t => typeof t === 'string' && t in CareflowType)) {
    return NextResponse.json({ error: 'Invalid service type' }, { status: 400 })
  }

  try {
    const practice = await prisma.$transaction(async tx => {
      const created = await tx.practice.create({
        data: {
          name: b.name.trim(),
          tin: trimOrNull(b.tin),
          groupNpi: trimOrNull(b.groupNpi),
          address: trimOrNull(b.address),
          phone: trimOrNull(b.phone),
          email: trimOrNull(b.email),
          tenantId: user.tenantId,
          ...(b.active !== undefined ? { active: !!b.active } : {}),
        },
      })
      await tx.practiceServiceType.createMany({
        data: (serviceTypes as CareflowType[]).map(careflowType => ({ practiceId: created.id, careflowType })),
      })
      return created
    })
    return NextResponse.json(practice)
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return NextResponse.json({ error: 'A practice with that value already exists' }, { status: 409 })
    }
    throw e
  }
}
