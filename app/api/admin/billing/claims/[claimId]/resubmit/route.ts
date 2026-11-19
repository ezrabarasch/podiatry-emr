import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'
import { resubmitClaim } from '@/lib/claims-service'

// POST /api/admin/billing/claims/[claimId]/resubmit  { kind?: 'resubmit' | 'appeal' }
// Rejected -> resubmit, Denied -> appeal: a NEW claim linked to this one, rebuilt from current data.
export async function POST(req: Request, context: { params: Promise<{ claimId: string }> }) {
  const { user, error } = await requireRole(['ADMIN', 'OFFICE'])
  if (error) return error
  const { claimId } = await context.params
  const b = await req.json().catch(() => ({}))
  try {
    const { claim, scrub } = await resubmitClaim(prisma, claimId, user.id, b.kind === 'appeal' ? 'appeal' : 'resubmit')
    return NextResponse.json({ claimId: claim.id, claimNumber: claim.patientControlNumber, status: claim.status, scrub })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 409 })
  }
}
