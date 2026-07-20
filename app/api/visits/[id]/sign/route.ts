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

  const visit = await prisma.visit.findUnique({
    where: { id: visitId },
    include: { emrImport: true, fieldSelections: true },
  })
  if (!visit) return NextResponse.json({ error: 'Visit not found' }, { status: 404 })
  if (visit.status === 'signed') {
    return NextResponse.json({ error: 'Visit is already signed' }, { status: 400 })
  }

  // Assemble the note from the generate endpoint (single source of truth for the
  // careflow logic). Forward the auth cookie so the internal request is authed.
  const origin = new URL(req.url).origin
  const genRes = await fetch(`${origin}/api/visits/${visitId}/generate`, {
    headers: { cookie: req.headers.get('cookie') ?? '' },
  })
  if (!genRes.ok) {
    return NextResponse.json({ error: 'Failed to assemble note' }, { status: 500 })
  }
  const gen = await genRes.json()

  const addendum =
    visit.fieldSelections.find(s => s.section === '_addendum' && s.fieldKey === 'text')?.value?.trim() || null

  const note = await prisma.visitNote.create({
    data: {
      visitId,
      noteText: gen.noteText ?? '',
      diagnoses: gen.diagnoses ?? [],
      cptCodes: gen.cptCodes ?? [],
      procedureNotes: gen.procedureNotes ?? [],
      specialSections: gen.specialSections ?? [],
      billingAlerts: gen.billingAlerts ?? [],
      addendum,
      vitalsSnapshot: visit.emrImport?.vitals ?? undefined,
      medicationsSnapshot: visit.emrImport?.medications ?? undefined,
      medicalHistorySnapshot: visit.emrImport?.medicalHistory ?? undefined,
      snapshotAt: new Date(),
    },
  })

  await prisma.visit.update({
    where: { id: visitId },
    data: { status: 'signed', signedAt: new Date() },
  })

  return NextResponse.json(note)
}
