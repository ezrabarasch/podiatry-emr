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

  const [diagnoses, total] = await Promise.all([
    prisma.patientDiagnosis.findMany({
      where: { patientId: id },
      // Active problems first, then most recently confirmed by the PCC sync.
      orderBy: [{ active: 'desc' }, { syncedAt: 'desc' }],
      skip,
      take,
    }),
    prisma.patientDiagnosis.count({ where: { patientId: id } }),
  ])

  return NextResponse.json({ diagnoses, total, page, limit })
}
