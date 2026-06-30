import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { reconcilePatientDiagnoses } from '@/lib/careflow/patient-record'

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
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

  // Reconcile into the patient-level, cross-service-line diagnosis list.
  // Only happens here, at sign — never on draft saves. See
  // lib/careflow/patient-record.ts for the no-duplicates guarantee.
  //
  // NOTE: medications are not yet reconciled here. Today medications are a
  // read-only PCC import snapshot (VisitEmrImport.medications) — the rules
  // engine never generates or asserts a medication the way it does
  // diagnoses, so there's no signed-visit medication list to reconcile from
  // yet. reconcilePatientMedications() exists and is ready to call once
  // there's a source (e.g. a med-reconciliation field on a visit form).
  if (Array.isArray(diagnoses) && diagnoses.length > 0) {
    await reconcilePatientDiagnoses(visit.patientId, visitId, visit.careflowType, diagnoses)
  }

  return NextResponse.json({ noteId: note.id })
}
