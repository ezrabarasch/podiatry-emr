import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser } from '@/lib/auth'

// The current user's own allowed practices (id + name) — for the
// select-practice page. Not admin-gated: any authenticated user can see the
// names of practices they're already a member of.
export async function GET() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const practices = await prisma.practice.findMany({
    where: { id: { in: user.allowedPracticeIds } },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json(practices)
}
