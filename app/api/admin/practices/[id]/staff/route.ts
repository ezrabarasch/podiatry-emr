import { NextResponse } from 'next/server'
import { Prisma, Role } from '@prisma/client'
import { requireRole } from '@/lib/auth'

// POST — assign an existing OFFICE/ADMIN user to this practice.
// StaffPractice isn't a scoped model, so the practice/user lookups below are
// what actually enforce tenant (and, for a non-tenant-admin caller, practice)
// validity — they run through the scoped client, so a foreign id 404s here
// before the unscoped StaffPractice write is ever reached.
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { prisma, error } = await requireRole(['ADMIN'])
  if (error) return error

  const { id } = await context.params
  const b = await req.json()
  const userId = typeof b.userId === 'string' ? b.userId.trim() : ''
  if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 })

  const practice = await prisma.practice.findUnique({ where: { id } })
  if (!practice) return NextResponse.json({ error: 'Practice not found' }, { status: 404 })

  const staffUser = await prisma.user.findUnique({ where: { id: userId } })
  if (!staffUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  if (staffUser.role !== Role.OFFICE && staffUser.role !== Role.ADMIN) {
    return NextResponse.json({ error: 'User must be OFFICE or ADMIN staff, not a provider' }, { status: 400 })
  }

  try {
    await prisma.staffPractice.create({ data: { userId, practiceId: id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002') return NextResponse.json({ error: 'User already assigned to this practice' }, { status: 409 })
      if (e.code === 'P2003') return NextResponse.json({ error: 'Invalid user or practice' }, { status: 400 })
    }
    throw e
  }
}
