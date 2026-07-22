import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!(await getSessionUser())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await context.params
  const observations = await prisma.patientObservation.findMany({
    where: { patientId: id },
    orderBy: { recordedDate: 'desc' },
  })
  return NextResponse.json(observations)
}
