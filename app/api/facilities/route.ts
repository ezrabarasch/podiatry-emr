import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'

export async function GET() {
  if (!(await getSessionUser())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const facilities = await prisma.facility.findMany({
    where: { active: true },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json(facilities)
}
