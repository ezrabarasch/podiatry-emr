import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { Prisma, Role } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'
import { DEFAULT_TENANT_ID } from '@/lib/tenant'

const trimOrNull = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

// Fields safe to return to the client (never the password hash).
const publicSelect = {
  id: true, username: true, email: true, firstName: true, lastName: true,
  credentials: true, active: true, npi: true, licenseNumber: true, specialty: true,
  address: true, phone: true, createdAt: true,
} satisfies Prisma.UserSelect

export async function GET() {
  const { error } = await requireRole(['ADMIN'])
  if (error) return error

  const providers = await prisma.user.findMany({
    where: { role: Role.PROVIDER },
    select: {
      id: true, firstName: true, lastName: true, credentials: true, npi: true, specialty: true, active: true,
      _count: { select: { practices: true } },
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  })

  return NextResponse.json(
    providers.map(({ _count, ...p }) => ({ ...p, practiceCount: _count.practices }))
  )
}

export async function POST(req: Request) {
  const { error } = await requireRole(['ADMIN'])
  if (error) return error

  const b = await req.json()
  const { username, firstName, lastName, password, email } = b
  if (!username || !firstName || !lastName || !password || !email?.trim()) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const practiceIds = (Array.isArray(b.practiceIds) ? [...new Set(b.practiceIds)] : []) as string[]

  try {
    const provider = await prisma.$transaction(async tx => {
      const created = await tx.user.create({
        data: {
          username: username.trim(),
          email: email.trim(),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          credentials: trimOrNull(b.credentials),
          role: Role.PROVIDER,
          password: await bcrypt.hash(password, 12),
          npi: trimOrNull(b.npi),
          licenseNumber: trimOrNull(b.licenseNumber),
          specialty: trimOrNull(b.specialty),
          address: trimOrNull(b.address),
          phone: trimOrNull(b.phone),
          tenantId: DEFAULT_TENANT_ID, // STOPGAP: replace with session-derived tenantId in scoping phase
          ...(b.active !== undefined ? { active: !!b.active } : {}),
        },
        select: publicSelect,
      })
      if (practiceIds.length) {
        await tx.providerPractice.createMany({
          data: practiceIds.map(practiceId => ({ userId: created.id, practiceId })),
        })
      }
      return created
    })
    return NextResponse.json(provider)
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002') return NextResponse.json({ error: 'Email already taken' }, { status: 409 })
      if (e.code === 'P2003') return NextResponse.json({ error: 'Invalid practice' }, { status: 400 })
    }
    throw e
  }
}
