import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'
import { claimFiltersFrom, denialQueue } from '@/lib/claims-service'

// GET /api/admin/billing/claims/denials
export async function GET(req: Request) {
  const { error } = await requireRole(['ADMIN', 'OFFICE'])
  if (error) return error
  return NextResponse.json(await denialQueue(prisma, claimFiltersFrom(new URL(req.url).searchParams)))
}
