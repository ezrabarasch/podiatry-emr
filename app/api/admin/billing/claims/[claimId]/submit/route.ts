import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'
import { submitClaim } from '@/lib/claims-service'

// POST /api/admin/billing/claims/[claimId]/submit  { force?: boolean, reason?: string }
// Re-scrubs, then sends to Stedi (test mode). `force` overrides a failed scrub: ADMIN only, reason required, logged.
export async function POST(req: Request, context: { params: Promise<{ claimId: string }> }) {
  const { user, error } = await requireRole(['ADMIN', 'OFFICE'])
  if (error) return error
  const { claimId } = await context.params
  const b = await req.json().catch(() => ({}))
  const r = await submitClaim(prisma, claimId, { id: user.id, role: user.role }, { force: b.force === true, reason: typeof b.reason === 'string' ? b.reason : undefined })
  if (!r.ok) return NextResponse.json(r, { status: r.error === 'Claim not found' ? 404 : r.errors ? 422 : r.error.startsWith('Stedi') ? 502 : 409 })
  return NextResponse.json(r)
}
