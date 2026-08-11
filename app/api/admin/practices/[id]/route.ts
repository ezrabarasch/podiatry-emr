import { NextResponse } from 'next/server'
import { CareflowType, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'

const trimOrNull = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { error } = await requireRole(['ADMIN'])
  if (error) return error

  const { id } = await context.params
  const practice = await prisma.practice.findUnique({
    where: { id },
    include: {
      serviceTypes: true,
      facilities: { select: { id: true, name: true } },
      providers: { include: { user: { select: { id: true, firstName: true, lastName: true, credentials: true } } } },
    },
  })
  if (!practice) return NextResponse.json({ error: 'Practice not found' }, { status: 404 })

  const { serviceTypes, providers, ...rest } = practice
  return NextResponse.json({
    ...rest,
    serviceTypes: serviceTypes.map(st => st.careflowType),
    providers: providers.map(pp => pp.user),
  })
}

export async function PUT(req: Request, context: { params: Promise<{ id: string }> }) {
  const { error } = await requireRole(['ADMIN'])
  if (error) return error

  const { id } = await context.params
  const b = await req.json()

  const data: Prisma.PracticeUpdateInput = {}
  if (b.name !== undefined) {
    if (!b.name.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    data.name = b.name.trim()
  }
  if (b.tin !== undefined) data.tin = trimOrNull(b.tin)
  if (b.groupNpi !== undefined) data.groupNpi = trimOrNull(b.groupNpi)
  if (b.address !== undefined) data.address = trimOrNull(b.address)
  if (b.phone !== undefined) data.phone = trimOrNull(b.phone)
  if (b.email !== undefined) data.email = trimOrNull(b.email)
  if (b.active !== undefined) data.active = !!b.active

  let serviceTypes: CareflowType[] | undefined
  if (b.serviceTypes !== undefined) {
    const requested = Array.isArray(b.serviceTypes) ? [...new Set(b.serviceTypes)] : []
    if (requested.length === 0) {
      return NextResponse.json({ error: 'At least one service type is required' }, { status: 400 })
    }
    if (!requested.every(t => typeof t === 'string' && t in CareflowType)) {
      return NextResponse.json({ error: 'Invalid service type' }, { status: 400 })
    }
    serviceTypes = requested as CareflowType[]
  }

  try {
    const practice = await prisma.$transaction(async tx => {
      const updated = await tx.practice.update({ where: { id }, data })

      if (serviceTypes) {
        const existing = await tx.practiceServiceType.findMany({ where: { practiceId: id } })
        const existingTypes = existing.map(e => e.careflowType)
        const toAdd = serviceTypes.filter(t => !existingTypes.includes(t))
        const toRemove = existingTypes.filter(t => !serviceTypes!.includes(t))

        if (toAdd.length) {
          await tx.practiceServiceType.createMany({
            data: toAdd.map(careflowType => ({ practiceId: id, careflowType })),
          })
        }
        if (toRemove.length) {
          await tx.practiceServiceType.deleteMany({ where: { practiceId: id, careflowType: { in: toRemove } } })
        }
      }

      return updated
    })
    return NextResponse.json(practice)
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2025') return NextResponse.json({ error: 'Practice not found' }, { status: 404 })
      if (e.code === 'P2002') return NextResponse.json({ error: 'A practice with that value already exists' }, { status: 409 })
    }
    throw e
  }
}
