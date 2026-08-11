import { NextResponse } from 'next/server'
import { Prisma, Role } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'

// POST — assign an existing provider to this practice.
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { error } = await requireRole(['ADMIN'])
  if (error) return error

  const { id } = await context.params
  const b = await req.json()
  const providerId = typeof b.providerId === 'string' ? b.providerId.trim() : ''
  if (!providerId) return NextResponse.json({ error: 'providerId is required' }, { status: 400 })

  const practice = await prisma.practice.findUnique({ where: { id } })
  if (!practice) return NextResponse.json({ error: 'Practice not found' }, { status: 404 })

  const provider = await prisma.user.findUnique({ where: { id: providerId } })
  if (!provider) return NextResponse.json({ error: 'Provider not found' }, { status: 404 })
  if (provider.role !== Role.PROVIDER) {
    return NextResponse.json({ error: 'User is not a provider' }, { status: 400 })
  }

  try {
    await prisma.providerPractice.create({ data: { userId: providerId, practiceId: id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002') return NextResponse.json({ error: 'Provider already assigned to this practice' }, { status: 409 })
      if (e.code === 'P2003') return NextResponse.json({ error: 'Invalid provider or practice' }, { status: 400 })
    }
    throw e
  }
}
