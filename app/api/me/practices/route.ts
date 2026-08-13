import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'

// The current user's own allowed practices (id + name) — for the
// select-practice page. Not admin-gated: any authenticated user can see the
// names of practices they're already a member of. The scoped client already
// filters Practice reads to the caller's own allowedPracticeIds (and tenant),
// so the extra `where` here is redundant with the scoping layer but kept for
// clarity/defense-in-depth at the call site.
export async function GET() {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { user, prisma } = session

  const practices = await prisma.practice.findMany({
    where: { id: { in: user.allowedPracticeIds } },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json(practices)
}
