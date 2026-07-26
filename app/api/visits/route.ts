import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'
import { pageParams } from '@/lib/pagination'

// Build a Visit where-clause from ?status=&providerId=&from=&to= query params.
// Shared shape with the CSV export route.
export function visitFilter(searchParams: URLSearchParams): Prisma.VisitWhereInput {
  const status = searchParams.get('status')
  const providerId = searchParams.get('providerId')
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  const where: Prisma.VisitWhereInput = {}
  if (status === 'draft' || status === 'signed') where.status = status
  if (providerId) where.providerId = providerId
  if (from || to) {
    where.visitDate = {}
    if (from) where.visitDate.gte = new Date(from)
    if (to) where.visitDate.lte = new Date(`${to}T23:59:59.999`)
  }
  return where
}

export async function GET(req: Request) {
  if (!(await getSessionUser())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const where = visitFilter(searchParams)
  const { page, limit, skip, take } = pageParams(searchParams)

  const [visits, total, providerIds] = await Promise.all([
    prisma.visit.findMany({
      where,
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, dob: true, facility: { select: { name: true } } } },
        provider: { select: { id: true, firstName: true, lastName: true, credentials: true } },
      },
      orderBy: { visitDate: 'desc' },
      skip,
      take,
    }),
    prisma.visit.count({ where }),
    // The provider dropdown lists everyone with visits, not just this page.
    prisma.visit.groupBy({ by: ['providerId'] }),
  ])

  const providers = await prisma.user.findMany({
    where: { id: { in: providerIds.map(p => p.providerId) } },
    select: { id: true, firstName: true, lastName: true, credentials: true },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  })

  return NextResponse.json({ visits, total, page, limit, providers })
}
