import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'
import { submitClaim } from '@/lib/claims-service'

// POST /api/admin/billing/claims/submit-batch  { claimIds: string[] }
// One at a time (Stedi has concurrency limits). A failure on one claim does not stop the rest.
export async function POST(req: Request) {
  const { user, error } = await requireRole(['ADMIN', 'OFFICE'])
  if (error) return error
  const b = await req.json().catch(() => ({}))
  const ids: string[] = Array.isArray(b.claimIds) ? b.claimIds.filter((x: unknown): x is string => typeof x === 'string') : []
  if (ids.length === 0) return NextResponse.json({ error: 'claimIds is required' }, { status: 400 })
  if (ids.length > 50) return NextResponse.json({ error: 'At most 50 claims per batch' }, { status: 400 })

  const results = []
  for (const id of [...new Set(ids)]) {
    try { results.push(await submitClaim(prisma, id, { id: user.id, role: user.role })) }
    catch (e) { results.push({ ok: false as const, claimId: id, error: e instanceof Error ? e.message : String(e) }) }
  }
  return NextResponse.json({ submitted: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length, results })
}
