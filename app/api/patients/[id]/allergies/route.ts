import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { prisma } = session

  const { id } = await context.params
  const allergies = await prisma.patientAllergy.findMany({
    where: { patientId: id },
    orderBy: { allergen: 'asc' },
  })
  return NextResponse.json(allergies)
}
