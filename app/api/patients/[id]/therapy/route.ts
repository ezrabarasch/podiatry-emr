import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'
import { pageParams } from '@/lib/pagination'

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!(await getSessionUser())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await context.params
  const { page, limit, skip, take } = pageParams(new URL(req.url).searchParams)

  const [therapy, total] = await Promise.all([
    prisma.patientTherapyTrack.findMany({
      where: { patientId: id },
      // Postgres sorts NULLs first on DESC; undated records belong at the end.
      orderBy: { startOfCareDate: { sort: 'desc', nulls: 'last' } },
      skip,
      take,
    }),
    prisma.patientTherapyTrack.count({ where: { patientId: id } }),
  ])

  return NextResponse.json({ therapy, total, page, limit })
}
