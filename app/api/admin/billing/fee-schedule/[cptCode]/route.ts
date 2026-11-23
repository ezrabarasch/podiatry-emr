import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'
import { normalizeFee } from '@/lib/fee-schedule'

type Ctx = { params: Promise<{ cptCode: string }> }

// PUT { amount, description? } - update one entry. The code itself is the key and cannot change.
export async function PUT(req: Request, context: Ctx) {
  const { error } = await requireRole(['ADMIN'])
  if (error) return error
  const { cptCode } = await context.params
  const b = await req.json().catch(() => ({}))
  const it = normalizeFee(cptCode, b.amount, b.description)
  if (typeof it === 'string') return NextResponse.json({ error: it }, { status: 400 })
  try {
    const r = await prisma.feeScheduleItem.update({ where: { cptCode: it.cptCode }, data: { amount: it.amount, description: it.description } })
    return NextResponse.json({ cptCode: r.cptCode, description: r.description, amount: Number(r.amount), updatedAt: r.updatedAt })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') return NextResponse.json({ error: 'Not on the fee schedule' }, { status: 404 })
    throw e
  }
}

// DELETE [?force=1] - remove one entry. Existing claims keep their stored charges, but new claims
// for this code fail scrub until it is re-added; if it is used on claim lines, 409 until forced.
export async function DELETE(req: Request, context: Ctx) {
  const { error } = await requireRole(['ADMIN'])
  if (error) return error
  const { cptCode } = await context.params
  const code = cptCode.toUpperCase()
  if (new URL(req.url).searchParams.get('force') !== '1') {
    const used = await prisma.claimServiceLine.count({ where: { cptCode: code } })
    if (used > 0) return NextResponse.json({ error: `${code} is used on ${used} claim line${used === 1 ? '' : 's'}`, usedOnClaimLines: used }, { status: 409 })
  }
  const { count } = await prisma.feeScheduleItem.deleteMany({ where: { cptCode: code } })
  return count ? NextResponse.json({ deleted: code }) : NextResponse.json({ error: 'Not on the fee schedule' }, { status: 404 })
}
