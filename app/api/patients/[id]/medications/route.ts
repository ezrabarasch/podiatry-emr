import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!(await getSessionUser())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await context.params
  const medications = await prisma.patientMedication.findMany({
    where: { patientId: id },
    orderBy: { description: 'asc' },
  })
  return NextResponse.json(medications)
}
