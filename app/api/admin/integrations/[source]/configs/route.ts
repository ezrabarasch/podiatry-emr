import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'
import { FREQUENCIES, type Frequency } from '@/lib/integrations'

// PUT — update enabled/frequency for one source's resources.
// Body: { configs: [{ resourceName, enabled, frequency }] }
export async function PUT(req: Request, context: { params: Promise<{ source: string }> }) {
  const { error } = await requireRole(['ADMIN'])
  if (error) return error

  const { source } = await context.params
  const src = await prisma.integrationSource.findUnique({ where: { name: source.toUpperCase() } })
  if (!src) return NextResponse.json({ error: 'Source not found' }, { status: 404 })

  const body = await req.json()
  const configs = Array.isArray(body?.configs) ? body.configs : []

  for (const c of configs) {
    if (typeof c?.resourceName !== 'string') continue
    const data: { enabled?: boolean; frequency?: string; cronExpression?: string } = {}
    if (c.enabled !== undefined) data.enabled = !!c.enabled
    if (c.frequency !== undefined) {
      if (!(c.frequency in FREQUENCIES)) {
        return NextResponse.json({ error: `Invalid frequency: ${c.frequency}` }, { status: 400 })
      }
      data.frequency = c.frequency
      data.cronExpression = FREQUENCIES[c.frequency as Frequency].cron
    }
    if (Object.keys(data).length === 0) continue
    await prisma.integrationSyncConfig.updateMany({
      where: { sourceId: src.id, resourceName: c.resourceName },
      data,
    })
  }

  const updated = await prisma.integrationSyncConfig.findMany({
    where: { sourceId: src.id },
    orderBy: { resourceName: 'asc' },
  })
  return NextResponse.json(updated)
}
