import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { deactivateProviderIfNoPractices } from '@/lib/providerLifecycle'

// DELETE — remove a provider from this practice.
export async function DELETE(_req: Request, context: { params: Promise<{ id: string; providerId: string }> }) {
  const { prisma, error } = await requireRole(['ADMIN'])
  if (error) return error

  const { id, providerId } = await context.params

  const result = await prisma.$transaction(async tx => {
    const deleted = await tx.providerPractice.deleteMany({ where: { userId: providerId, practiceId: id } })
    if (deleted.count > 0) {
      await deactivateProviderIfNoPractices(tx, providerId)
    }
    return deleted
  })

  if (result.count === 0) {
    return NextResponse.json({ error: 'Provider is not assigned to this practice' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}
