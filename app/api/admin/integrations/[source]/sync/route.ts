import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'

// POST — trigger an immediate full sync for a source.
// ponytail: stub — real execution is wired when the scheduler is deployed (Part 3).
export async function POST(_req: Request, context: { params: Promise<{ source: string }> }) {
  const { error } = await requireRole(['ADMIN'])
  if (error) return error

  const { source } = await context.params
  const src = await prisma.integrationSource.findUnique({ where: { name: source.toUpperCase() } })
  if (!src) return NextResponse.json({ error: 'Source not found' }, { status: 404 })

  console.log(`Manual sync triggered for ${src.name}`)
  return NextResponse.json({ ok: true, message: `Manual sync triggered for ${src.name}` })
}
