import { NextResponse } from 'next/server'
import { Prisma, CareflowType } from '@prisma/client'
import { requireRole } from '@/lib/auth'
import { pageParams } from '@/lib/pagination'

export async function GET(req: Request) {
  const { prisma, error } = await requireRole(['ADMIN'])
  if (error) return error

  const { searchParams } = new URL(req.url)
  const careflowType = searchParams.get('careflowType')?.trim()
  const section = searchParams.get('section')?.trim()
  const fieldKey = searchParams.get('fieldKey')?.trim()
  const active = searchParams.get('active')?.trim()
  const q = searchParams.get('q')?.trim()
  const { page, limit, skip, take } = pageParams(searchParams)

  const where: Prisma.CareflowRuleWhereInput = {}
  if (careflowType && careflowType in CareflowType) where.careflowType = careflowType as CareflowType
  if (section) where.section = section
  if (fieldKey) where.fieldKey = { contains: fieldKey, mode: 'insensitive' }
  // Anything other than an explicit "true"/"false" (e.g. "all") leaves active unfiltered.
  if (active === 'true' || active === 'false') where.active = active === 'true'
  if (q) where.noteFragment = { contains: q, mode: 'insensitive' }

  const [rules, total] = await Promise.all([
    prisma.careflowRule.findMany({
      where,
      orderBy: [{ section: 'asc' }, { fieldKey: 'asc' }, { priority: 'asc' }],
      skip,
      take,
    }),
    prisma.careflowRule.count({ where }),
  ])

  return NextResponse.json({ rules, total, page, limit })
}
