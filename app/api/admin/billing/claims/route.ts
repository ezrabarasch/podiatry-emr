import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'
import { claimFiltersFrom, listClaims } from '@/lib/claims-service'

// GET /api/admin/billing/claims - list, problems first (Rejected, Denied, ...) then days in AR.
export async function GET(req: Request) {
  const { error } = await requireRole(['ADMIN', 'OFFICE'])
  if (error) return error
  const sp = new URL(req.url).searchParams
  const page = Math.max(1, parseInt(sp.get('page') ?? '1', 10) || 1)
  const limit = Math.min(200, Math.max(1, parseInt(sp.get('limit') ?? '25', 10) || 25))
  return NextResponse.json(await listClaims(prisma, claimFiltersFrom(sp), page, limit))
}
