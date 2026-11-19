import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'

// The charge per CPT/HCPCS code. A claim cannot be built without one (scrub fails until set).
export async function GET() {
  const { error } = await requireRole(['ADMIN', 'OFFICE'])
  if (error) return error
  const items = await prisma.feeScheduleItem.findMany({ orderBy: { cptCode: 'asc' } })
  return NextResponse.json({ items: items.map(i => ({ cptCode: i.cptCode, amount: Number(i.amount) })) })
}

// PUT { items: [{ cptCode, amount }] } - upsert (ADMIN only; this sets what every claim bills).
export async function PUT(req: Request) {
  const { error } = await requireRole(['ADMIN'])
  if (error) return error
  const b = await req.json().catch(() => ({}))
  const raw: unknown[] = Array.isArray(b.items) ? b.items : []
  const items = raw.map(r => {
    const o = (r ?? {}) as Record<string, unknown>
    return { cptCode: String(o.cptCode ?? '').trim().toUpperCase(), amount: Number(o.amount) }
  })
  const bad = items.find(i => !/^[A-Z0-9]{5}$/.test(i.cptCode) || !Number.isFinite(i.amount) || i.amount <= 0 || i.amount > 100000)
  if (items.length === 0 || bad) {
    return NextResponse.json({ error: bad ? `Invalid item: ${bad.cptCode || '(blank code)'} / ${bad.amount}` : 'items is required' }, { status: 400 })
  }
  for (const i of items) {
    await prisma.feeScheduleItem.upsert({ where: { cptCode: i.cptCode }, create: { cptCode: i.cptCode, amount: i.amount }, update: { amount: i.amount } })
  }
  return NextResponse.json({ saved: items.length })
}
