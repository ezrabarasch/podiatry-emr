import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { Prisma, Role } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'

// Fields safe to return to the client (never the password hash).
const publicSelect = {
  id: true, username: true, email: true, firstName: true, lastName: true,
  credentials: true, role: true, active: true, lockedAt: true, lastLoginAt: true,
  createdAt: true,
} satisfies Prisma.UserSelect

export async function GET() {
  const { error } = await requireRole(['ADMIN'])
  if (error) return error

  const users = await prisma.user.findMany({
    select: publicSelect,
    orderBy: [{ active: 'desc' }, { username: 'asc' }],
  })
  return NextResponse.json(users)
}

export async function POST(req: Request) {
  const { error } = await requireRole(['ADMIN'])
  if (error) return error

  const { username, email, firstName, lastName, credentials, role, password } = await req.json()

  if (!username || !firstName || !lastName || !role || !password) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  if (!Object.values(Role).includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

  try {
    const user = await prisma.user.create({
      data: {
        username: username.trim(),
        email: email?.trim() || null,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        credentials: credentials?.trim() || null,
        role,
        password: await bcrypt.hash(password, 12),
      },
      select: publicSelect,
    })
    return NextResponse.json(user)
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return NextResponse.json({ error: 'Username already taken' }, { status: 409 })
    }
    throw e
  }
}
