import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'

// DELETE — remove a provider from this practice.
export async function DELETE(_req: Request, context: { params: Promise<{ id: string; providerId: string }> }) {
  const { error } = await requireRole(['ADMIN'])
  if (error) return error

  const { id, providerId } = await context.params

  const result = await prisma.providerPractice.deleteMany({ where: { userId: providerId, practiceId: id } })
  if (result.count === 0) {
    return NextResponse.json({ error: 'Provider is not assigned to this practice' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}
