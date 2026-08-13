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
  const contacts = await prisma.patientContact.findMany({
    where: { patientId: id },
    orderBy: [{ isGuarantor: 'desc' }, { lastName: 'asc' }],
  })
  return NextResponse.json(contacts)
}
