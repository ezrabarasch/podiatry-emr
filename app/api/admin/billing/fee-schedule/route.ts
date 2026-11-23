import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'
import { normalizeFee, type FeeInput } from '@/lib/fee-schedule'
import { upsertFees } from '@/lib/fee-schedule-service'

const row = (i: { cptCode: string; description: string | null; amount: Prisma.Decimal; updatedAt: Date }) =>
  ({ cptCode: i.cptCode, description: i.description, amount: Number(i.amount), updatedAt: i.updatedAt })

// GET ?q=&page=&pageSize= - the charge per CPT/HCPCS code, sorted by code. A claim cannot be
// built without one (scrub fails until set). Search matches code prefix or description text.
export async function GET(req: Request) {
  const { error } = await requireRole(['ADMIN', 'OFFICE'])
  if (error) return error
  const sp = new URL(req.url).searchParams
  const q = (sp.get('q') ?? '').trim()
  const pageSize = Math.min(Math.max(Number(sp.get('pageSize')) || 25, 1), 200)
  const page = Math.max(Number(sp.get('page')) || 1, 1)
  const where: Prisma.FeeScheduleItemWhereInput = q
    ? { OR: [{ cptCode: { startsWith: q.toUpperCase() } }, { description: { contains: q, mode: 'insensitive' } }] }
    : {}
  const [total, items] = await Promise.all([
    prisma.feeScheduleItem.count({ where }),
    prisma.feeScheduleItem.findMany({ where, orderBy: { cptCode: 'asc' }, skip: (page - 1) * pageSize, take: pageSize }),
  ])
  return NextResponse.json({ items: items.map(row), total, page, pageSize })
}

// POST { cptCode, amount, description? } - add one entry (409 if the code already exists).
export async function POST(req: Request) {
  const { error } = await requireRole(['ADMIN'])
  if (error) return error
  const b = await req.json().catch(() => ({}))
  const it = normalizeFee(b.cptCode, b.amount, b.description)
  if (typeof it === 'string') return NextResponse.json({ error: it }, { status: 400 })
  try {
    return NextResponse.json(row(await prisma.feeScheduleItem.create({ data: it })), { status: 201 })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return NextResponse.json({ error: `${it.cptCode} is already on the fee schedule` }, { status: 409 })
    }
    throw e
  }
}

// PUT { items: [{ cptCode, amount, description? }] } - bulk upsert, all-or-nothing (ADMIN only;
// this sets what every claim bills). A missing description leaves the existing one untouched.
export async function PUT(req: Request) {
  const { error } = await requireRole(['ADMIN'])
  if (error) return error
  const b = await req.json().catch(() => ({}))
  const raw: unknown[] = Array.isArray(b.items) ? b.items : []
  const items = raw.map(r => {
    const o = (r ?? {}) as Record<string, unknown>
    return normalizeFee(o.cptCode, o.amount, o.description)
  })
  const bad = items.find(i => typeof i === 'string')
  if (items.length === 0 || bad) return NextResponse.json({ error: (bad as string) ?? 'items is required' }, { status: 400 })
  await upsertFees(items as FeeInput[])
  return NextResponse.json({ saved: items.length })
}
