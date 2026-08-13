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

  const [medications, total] = await Promise.all([
    prisma.patientMedication.findMany({
      where: { patientId: id },
      orderBy: { description: 'asc' },
      skip,
      take,
    }),
    prisma.patientMedication.count({ where: { patientId: id } }),
  ])

  return NextResponse.json({ medications, total, page, limit })
}
