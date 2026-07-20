import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { Prisma, Role } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'

const publicSelect = {
  id: true, username: true, email: true, firstName: true, lastName: true,
  credentials: true, role: true, active: true, lockedAt: true, lastLoginAt: true,
  createdAt: true,
} satisfies Prisma.UserSelect

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { error } = await requireRole(['ADMIN'])
  if (error) return error

  const { id } = await context.params
  const user = await prisma.user.findUnique({ where: { id }, select: publicSelect })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  return NextResponse.json(user)
}

export async function PUT(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { error } = await requireRole(['ADMIN'])
  if (error) return error

  const { id } = await context.params
  const body = await req.json()

  const data: Prisma.UserUpdateInput = {}
  if (body.firstName !== undefined) data.firstName = body.firstName.trim()
  if (body.lastName !== undefined) data.lastName = body.lastName.trim()
  if (body.email !== undefined) data.email = body.email?.trim() || null
  if (body.credentials !== undefined) data.credentials = body.credentials?.trim() || null
  if (body.active !== undefined) data.active = !!body.active
  if (body.role !== undefined) {
    if (!Object.values(Role).includes(body.role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    }
    data.role = body.role
  }
  // Reset password only when a new one is provided.
  if (body.password) data.password = await bcrypt.hash(body.password, 12)
  // Unlock: clear the lock and reset the failed-attempt counter.
  if (body.unlock) {
    data.lockedAt = null
    data.failedLoginAttempts = 0
  }

  try {
    const user = await prisma.user.update({ where: { id }, data, select: publicSelect })
    return NextResponse.json(user)
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }
    throw e
  }
}
