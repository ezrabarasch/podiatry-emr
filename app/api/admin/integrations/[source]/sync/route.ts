import { NextResponse } from 'next/server'
import { execSync } from 'child_process'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'

// Same shared sync install the hourly scheduler uses (scripts/sync-scheduler.js).
// One installation, wired to PROD's DB regardless of which app (staging/prod)
// calls this route — there is no staging-isolated sync target.
const PYTHON = '/home/dbcreator/pcc/.venv/bin/python'
const SCRIPT = '/home/dbcreator/pcc/sync_to_emr.py'

// POST — trigger an immediate sync for a source. With a resourceName, runs and
// waits on just that one resource (Run Now); without one, full-sync execution
// is still a stub (unchanged — that's the separate scheduler-deploy scope).
export async function POST(req: Request, context: { params: Promise<{ source: string }> }) {
  const { error } = await requireRole(['ADMIN'])
  if (error) return error

  const { source } = await context.params
  const src = await prisma.integrationSource.findUnique({ where: { name: source.toUpperCase() } })
  if (!src) return NextResponse.json({ error: 'Source not found' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const resourceName: string | undefined = body?.resourceName
  if (!resourceName) {
    console.log(`Manual sync triggered for ${src.name}`)
    return NextResponse.json({ ok: true, message: `Manual sync triggered for ${src.name}` })
  }

  const cfg = await prisma.integrationSyncConfig.findUnique({
    where: { sourceId_resourceName: { sourceId: src.id, resourceName } },
  })
  if (!cfg) return NextResponse.json({ error: 'Resource not found' }, { status: 404 })

  try {
    // Same invoke-and-parse pattern as scripts/sync-scheduler.js: the script
    // prints the row count as its final token; 30-minute ceiling matches it too.
    const out = execSync(`${PYTHON} ${SCRIPT} --resource ${resourceName}`, {
      encoding: 'utf8',
      timeout: 30 * 60 * 1000,
    })
    const count = parseInt(out.trim().split(/\s+/).pop() ?? '', 10)
    await prisma.integrationSyncConfig.update({
      where: { id: cfg.id },
      data: { lastSyncAt: new Date(), lastCount: Number.isNaN(count) ? null : count, lastError: null },
    })
    return NextResponse.json({ ok: true, count: Number.isNaN(count) ? null : count })
  } catch (err) {
    const message = String((err as Error).message || err).slice(0, 1000)
    await prisma.integrationSyncConfig.update({
      where: { id: cfg.id },
      data: { lastSyncAt: new Date(), lastError: message },
    })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
