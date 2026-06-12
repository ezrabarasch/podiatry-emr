import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params

  const visit = await prisma.visit.findUnique({
    where: { id },
    include: {
      patient: { include: { facility: true } },
      provider: { select: { firstName: true, lastName: true, credentials: true } },
      fieldSelections: true,
    },
  })

  if (!visit) return NextResponse.json({ error: 'Visit not found' }, { status: 404 })

  return NextResponse.json(visit)
}
