import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!(await getSessionUser())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await context.params

  const patient = await prisma.patient.findUnique({
    where: { id },
    include: {
      facility: true,
      coverages: { where: { active: true }, orderBy: { isPrimary: 'desc' } },
      diagnoses: { where: { active: true }, orderBy: { icd10Code: 'asc' } },
    },
  })

  if (!patient) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(patient)
}
