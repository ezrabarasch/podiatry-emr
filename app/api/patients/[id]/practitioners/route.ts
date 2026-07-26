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

  const [practitioners, total] = await Promise.all([
    prisma.patientPractitioner.findMany({
      where: { patientId: id },
      orderBy: { providerType: 'asc' },
      skip,
      take,
    }),
    prisma.patientPractitioner.count({ where: { patientId: id } }),
  ])

  return NextResponse.json({ practitioners, total, page, limit })
}
