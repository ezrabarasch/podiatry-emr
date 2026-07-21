import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'

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

  const visits = await prisma.visit.findMany({
    where: visitFilter(searchParams),
    include: {
      patient: { select: { id: true, firstName: true, lastName: true, dob: true, facility: { select: { name: true } } } },
      provider: { select: { id: true, firstName: true, lastName: true, credentials: true } },
    },
    orderBy: { visitDate: 'desc' },
  })

  return NextResponse.json(visits)
}
