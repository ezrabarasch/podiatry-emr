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

  const [observations, total] = await Promise.all([
    prisma.patientObservation.findMany({
      where: { patientId: id },
      select: {
        id: true,
        type: true,
        value: true,
        diastolicValue: true,
        systolicValue: true,
        unit: true,
        method: true,
        recordedDate: true,
        recordedBy: true,
      },
      orderBy: { recordedDate: 'desc' },
      skip,
      take,
    }),
    prisma.patientObservation.count({ where: { patientId: id } }),
  ])

  return NextResponse.json({ observations, total, page, limit })
}
