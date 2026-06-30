import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import type { CareflowType } from '@prisma/client'

export async function GET(
  _req: Request,
  context: { params: Promise<{ type: string }> }
) {
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
