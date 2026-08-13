import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import type { CareflowType } from '@prisma/client'

// JUDGMENT CALL: this route previously had no auth check at all (it only ever
// touched global/exempt careflow-definition tables, so there was nothing to
// scope). The app-wide ESLint rule bans importing the bare `@/lib/prisma`
// singleton anywhere in app/**, so this route now needs a scoped client like
// every other route — which means it needs a session to build one from. Added
// the same getSessionUser() gate every other route already has; this is a
// deliberate, minor behavior tightening (previously-unauthenticated requests
// now 401), not a scoping requirement (CareflowSection/Group/Field are exempt
// and would be unaffected by scoping either way). Flagged for review.
export async function GET(
  _req: Request,
  context: { params: Promise<{ type: string }> }
) {
  const session = await getSessionUser()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { prisma } = session

  const { type } = await context.params

  const sections = await prisma.careflowSection.findMany({
    where: { careflowType: type as CareflowType, active: true },
    orderBy: { position: 'asc' },
    include: {
      groups: {
        orderBy: { position: 'asc' },
        include: {
          fields: { orderBy: { position: 'asc' } },
        },
      },
    },
  })

  return NextResponse.json({ sections })
}
