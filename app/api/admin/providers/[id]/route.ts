import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { Prisma, Role } from '@prisma/client'
import { requireRole } from '@/lib/auth'
import { deactivateProviderIfNoPractices } from '@/lib/providerLifecycle'

const trimOrNull = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

const publicSelect = {
  id: true, username: true, email: true, firstName: true, lastName: true,
  credentials: true, active: true, npi: true, licenseNumber: true, specialty: true,
  address: true, phone: true, createdAt: true,
} satisfies Prisma.UserSelect

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { prisma, error } = await requireRole(['ADMIN'])
  if (error) return error

  const { id } = await context.params
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      ...publicSelect,
      role: true,
      practices: { include: { practice: { select: { id: true, name: true } } } },
    },
  })
  if (!user || user.role !== Role.PROVIDER) return NextResponse.json({ error: 'Provider not found' }, { status: 404 })

  const { practices, role, ...rest } = user
  return NextResponse.json({
    ...rest,
    practices: practices.map(pp => pp.practice),
  })
}

export async function PUT(req: Request, context: { params: Promise<{ id: string }> }) {
  const { prisma, error } = await requireRole(['ADMIN'])
  if (error) return error

  const { id } = await context.params

  const existing = await prisma.user.findUnique({ where: { id }, select: { role: true } })
  if (!existing || existing.role !== Role.PROVIDER) {
    return NextResponse.json({ error: 'Provider not found' }, { status: 404 })
  }

  const b = await req.json()

  // role is intentionally never touched here — this surface only edits providers.
  const data: Prisma.UserUpdateInput = {}
  if (b.firstName !== undefined) data.firstName = b.firstName.trim()
  if (b.lastName !== undefined) data.lastName = b.lastName.trim()
  if (b.email !== undefined) {
    if (!b.email?.trim()) return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    data.email = b.email.trim()
  }
  if (b.credentials !== undefined) data.credentials = trimOrNull(b.credentials)
  if (b.npi !== undefined) data.npi = trimOrNull(b.npi)
  if (b.licenseNumber !== undefined) data.licenseNumber = trimOrNull(b.licenseNumber)
  if (b.specialty !== undefined) data.specialty = trimOrNull(b.specialty)
  if (b.address !== undefined) data.address = trimOrNull(b.address)
  if (b.phone !== undefined) data.phone = trimOrNull(b.phone)
  if (b.active !== undefined) data.active = !!b.active
  // Reset password only when a new one is provided (matches the generic users route).
  if (b.password) data.password = await bcrypt.hash(b.password, 12)

  let practiceIds: string[] | undefined
  if (b.practiceIds !== undefined) {
    practiceIds = (Array.isArray(b.practiceIds) ? [...new Set(b.practiceIds)] : []) as string[]
  }

  try {
    const provider = await prisma.$transaction(async tx => {
      const updated = await tx.user.update({ where: { id }, data, select: publicSelect })

      if (practiceIds) {
        const current = await tx.providerPractice.findMany({ where: { userId: id } })
        const currentIds = current.map(pp => pp.practiceId)
        const toAdd = practiceIds.filter(pid => !currentIds.includes(pid))
        const toRemove = currentIds.filter(pid => !practiceIds!.includes(pid))

        if (toAdd.length) {
          await tx.providerPractice.createMany({ data: toAdd.map(practiceId => ({ userId: id, practiceId })) })
        }
        if (toRemove.length) {
          await tx.providerPractice.deleteMany({ where: { userId: id, practiceId: { in: toRemove } } })
          await deactivateProviderIfNoPractices(tx, id)
        }
      }

      return updated
    })
    return NextResponse.json(provider)
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2025') return NextResponse.json({ error: 'Provider not found' }, { status: 404 })
      if (e.code === 'P2002') return NextResponse.json({ error: 'Email already taken' }, { status: 409 })
      if (e.code === 'P2003') return NextResponse.json({ error: 'Invalid practice' }, { status: 400 })
    }
    throw e
  }
}
