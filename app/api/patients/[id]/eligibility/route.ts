import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionUser, requireRole } from '@/lib/auth'
import { checkHistory, enqueueEligibility, getCheck } from '@/lib/stedi'

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await getSessionUser())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await context.params

  const patient = await prisma.patient.findUnique({ where: { id }, select: { id: true } })
  if (!patient) return NextResponse.json({ error: 'Patient not found' }, { status: 404 })

  const [check, history] = await Promise.all([getCheck(prisma, { patientId: id }), checkHistory(prisma, id)])
  return NextResponse.json({ check, history })
}

// "Re-check" button.
export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { error } = await requireRole(['PROVIDER', 'ADMIN', 'OFFICE'])
  if (error) return error
  const { id } = await context.params

  const patient = await prisma.patient.findUnique({ where: { id }, select: { id: true } })
  if (!patient) return NextResponse.json({ error: 'Patient not found' }, { status: 404 })

  const { id: checkId } = await enqueueEligibility(prisma, id)
  const [check, history] = await Promise.all([getCheck(prisma, { id: checkId }), checkHistory(prisma, id)])
  return NextResponse.json({ check, history })
}
