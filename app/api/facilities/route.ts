import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'

export async function GET() {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { prisma } = session

  const facilities = await prisma.facility.findMany({
    where: { active: true },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json(facilities)
}
