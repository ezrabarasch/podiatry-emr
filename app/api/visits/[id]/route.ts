import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, requireRole } from '@/lib/auth'

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  if (!(await getSessionUser())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { error } = await requireRole(['PROVIDER', 'ADMIN'])
  if (error) return error

  const { id } = await context.params

  const visit = await prisma.visit.findUnique({ where: { id } })
  if (!visit) return NextResponse.json({ error: 'Visit not found' }, { status: 404 })
  if (visit.status === 'signed') {
    return NextResponse.json({ error: 'Cannot delete a signed visit' }, { status: 400 })
  }

  await prisma.visit.delete({ where: { id } })
  return NextResponse.json({ deleted: true })
}
