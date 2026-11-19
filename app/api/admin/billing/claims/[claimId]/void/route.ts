import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'
import { voidClaim } from '@/lib/claims-service'

// POST /api/admin/billing/claims/[claimId]/void  { reason: string }  (void a claim; reason required)
export async function POST(req: Request, context: { params: Promise<{ claimId: string }> }) {
  const { user, error } = await requireRole(['ADMIN', 'OFFICE'])
  if (error) return error
  const { claimId } = await context.params
  const b = await req.json().catch(() => ({}))
  const text = typeof b.reason === 'string' ? b.reason.trim() : ''
  if (!text) return NextResponse.json({ error: 'reason is required' }, { status: 400 })
  if (text.length > 2000) return NextResponse.json({ error: 'reason is too long (2000 characters max)' }, { status: 400 })
  try {
    return NextResponse.json(await voidClaim(prisma, claimId, user.id, text))
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 409 })
  }
}
