import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireRole } from '@/lib/auth'

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { error } = await requireRole(['PROVIDER', 'ADMIN'])
  if (error) return error

  const { id: visitId } = await context.params
  const body = await req.json()
  const {
    addendum,
    noteText,
    procedureNotes,
    specialSections,
    diagnoses,
    cptCodes,
    billingAlerts,
  } = body

  const visit = await prisma.visit.findUnique({ where: { id: visitId } })
  if (!visit) return NextResponse.json({ error: 'Visit not found' }, { status: 404 })
  if (visit.status === 'signed') {
    return NextResponse.json({ error: 'Visit is already signed' }, { status: 400 })
  }

  // Save the note snapshot
  const note = await prisma.visitNote.create({
    data: {
      visitId,
      noteText: noteText ?? '',
      procedureNotes: procedureNotes ?? [],
      specialSections: specialSections ?? [],
      diagnoses: diagnoses ?? [],
      cptCodes: cptCodes ?? [],
      addendum: addendum?.trim() || null,
      billingAlerts: billingAlerts ?? [],
    },
  })

  // Lock the visit
  await prisma.visit.update({
    where: { id: visitId },
    data: { status: 'signed', signedAt: new Date() },
  })

  return NextResponse.json({ noteId: note.id })
}
