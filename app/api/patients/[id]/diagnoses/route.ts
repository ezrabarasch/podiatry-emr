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

  // Active problems first, then by PCC rank (Primary, Secondary, Diagnosis #3, ...), unranked last.
  // Rank is text, so the DB can't order it numerically; one patient has tens of rows, so sort
  // in memory and page the sorted list. ponytail: revisit if a patient ever has thousands.
  const all = await prisma.patientDiagnosis.findMany({ where: { patientId: id } })
  all.sort((a, b) =>
    Number(b.active) - Number(a.active) ||
    rankOrder(a.rank) - rankOrder(b.rank) ||
    a.icd10.localeCompare(b.icd10)
  )
  const diagnoses = all.slice(skip, skip + take)

  return NextResponse.json({ diagnoses, total: all.length, page, limit })
}

function rankOrder(rank: string | null): number {
  if (rank === 'Primary') return 0
  if (rank === 'Secondary') return 1
  const n = rank?.match(/^Diagnosis #(\d+)$/)
  return n ? Number(n[1]) - 1 : 99
}
