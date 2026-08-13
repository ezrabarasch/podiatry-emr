import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { reconcilePatientDiagnoses } from '@/lib/careflow/patient-record'
import { assembleNote } from '@/app/api/visits/[id]/generate/route'

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { prisma, error } = await requireRole(['PROVIDER', 'ADMIN'])
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
  if (!visit.visitType) {
    return NextResponse.json({ error: 'Visit type (new/established patient) must be selected before signing.' }, { status: 400 })
  }

  // Assemble the note directly (shared careflow logic, no HTTP self-fetch -
  // avoids origin/protocol mismatches behind a reverse proxy).
  const gen = await assembleNote(prisma, visitId)
  if (!gen) {
    return NextResponse.json({ error: 'Failed to assemble note' }, { status: 500 })
  }

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

  // Reconcile into the patient-level, cross-service-line diagnosis list.
  // Only happens here, at sign — never on draft saves. See
  // lib/careflow/patient-record.ts for the no-duplicates guarantee.
  //
  // NOTE: medications are not reconciled here yet. Today medications are a
  // read-only PCC import snapshot — the rules engine never asserts a
  // medication the way it does diagnoses, so there's no signed-visit
  // medication list to reconcile from. reconcilePatientMedications() exists
  // and is ready once there's a source (e.g. a med-rec field on a form).
  // gen.diagnoses is typed loosely (JsonArray on the signed-snapshot path).
  // Narrow to well-formed {icd10, description} entries before reconciling -
  // this both satisfies the type and guards against malformed rows.
  const rawDiagnoses: unknown[] = Array.isArray(gen.diagnoses) ? gen.diagnoses : []
  const signedDiagnoses = rawDiagnoses.filter(
    (d): d is { icd10: string; description: string } =>
      !!d && typeof d === 'object' &&
      typeof (d as { icd10?: unknown }).icd10 === 'string' &&
      typeof (d as { description?: unknown }).description === 'string'
  )
  if (signedDiagnoses.length > 0) {
    await reconcilePatientDiagnoses(prisma, visit.patientId, visitId, visit.careflowType, signedDiagnoses)
  }

  return NextResponse.json(note)
}
