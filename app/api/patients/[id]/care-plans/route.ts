import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { pageParams } from '@/lib/pagination'

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { prisma } = session

  const { id } = await context.params
  const { page, limit, skip, take } = pageParams(new URL(req.url).searchParams)

  const [carePlans, total] = await Promise.all([
    prisma.patientCarePlan.findMany({
      where: { patientId: id },
      // Postgres sorts NULLs first on DESC; undated records belong at the end.
      orderBy: { createdDate: { sort: 'desc', nulls: 'last' } },
      skip,
      take,
    }),
    prisma.patientCarePlan.count({ where: { patientId: id } }),
  ])

  return NextResponse.json({ carePlans, total, page, limit })
}
