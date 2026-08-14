import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'

// DELETE — remove a staff user from this practice. No lifecycle side effect
// here (unlike the provider equivalent) — deactivate-on-zero-practices is a
// PROVIDER-only rule (lib/providerLifecycle.ts); OFFICE/ADMIN users are never
// auto-deactivated for losing a practice assignment.
export async function DELETE(_req: Request, context: { params: Promise<{ id: string; userId: string }> }) {
  const { prisma, error } = await requireRole(['ADMIN'])
  if (error) return error

  const { id, userId } = await context.params

  const practice = await prisma.practice.findUnique({ where: { id } })
  if (!practice) return NextResponse.json({ error: 'Practice not found' }, { status: 404 })

  const result = await prisma.staffPractice.deleteMany({ where: { practiceId: id, userId } })
  if (result.count === 0) {
    return NextResponse.json({ error: 'Staff member is not assigned to this practice' }, { status: 404 })
  }
  return NextResponse.json({ ok: true })
}
