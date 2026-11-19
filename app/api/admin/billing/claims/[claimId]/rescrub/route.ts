import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'
import { rescrubClaim } from '@/lib/claims-service'

// POST /api/admin/billing/claims/[claimId]/rescrub - rebuild + scrub a Draft/Ready claim from current data.
export async function POST(_req: Request, context: { params: Promise<{ claimId: string }> }) {
  const { error } = await requireRole(['ADMIN', 'OFFICE'])
  if (error) return error
  const { claimId } = await context.params
  try {
    const { claim, scrub } = await rescrubClaim(prisma, claimId)
    return NextResponse.json({ status: claim.status, pass: scrub.pass, errors: scrub.errors })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 409 })
  }
}
