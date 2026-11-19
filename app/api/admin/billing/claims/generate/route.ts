import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'
import { generateClaims, rescrubClaim } from '@/lib/claims-service'

// POST /api/admin/billing/claims/generate
// Claims for signed visits that have none yet (pass scrub -> Ready, fail -> Draft with
// reasons), then a re-scrub of existing Drafts so fixed data (NPI, coverage, fee) promotes them.
export async function POST() {
  const { user, error } = await requireRole(['ADMIN', 'OFFICE'])
  if (error) return error

  const out = await generateClaims(prisma, user.id)

  const drafts = await prisma.claim.findMany({ where: { status: 'Draft' }, select: { id: true } })
  let promoted = 0
  for (const d of drafts) {
    try { if ((await rescrubClaim(prisma, d.id)).changed) promoted++ } catch (e) { console.error('rescrub failed', d.id, e) }
  }
  return NextResponse.json({ ...out, rescrubbed: drafts.length, promoted })
}
