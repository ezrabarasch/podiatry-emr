import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'
import { claimDetail } from '@/lib/claims-service'

// GET /api/admin/billing/claims/[claimId] - header, service lines, diagnoses, timeline, notes.
export async function GET(_req: Request, context: { params: Promise<{ claimId: string }> }) {
  const { error } = await requireRole(['ADMIN', 'OFFICE'])
  if (error) return error
  const { claimId } = await context.params
  const detail = await claimDetail(prisma, claimId)
  if (!detail) return NextResponse.json({ error: 'Claim not found' }, { status: 404 })
  return NextResponse.json(detail)
}
