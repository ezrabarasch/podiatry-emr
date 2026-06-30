import { prisma } from '@/lib/prisma'
import type { CareflowType } from '@prisma/client'

interface SignedDiagnosis {
  icd10: string
  description: string
}

interface SignedMedication {
  name: string
  dosage?: string | null
  frequency?: string | null
}

/**
 * Reconciles a just-signed visit's diagnoses into the patient-level
 * PatientDiagnosis table. Runs only at sign time (never on draft saves),
 * per product decision: the shared chart reflects confirmed encounters,
 * not in-progress charting.
 *
 * "No duplicates": PatientDiagnosis is unique on (patientId, icd10) — a
 * diagnosis already on the chart gets its lastConfirmedAt/lastConfirmedById
 * bumped rather than a second row created. Every signed visit that asserts
 * it is still recorded in PatientDiagnosisAssertion, so cross-service-line
 * history is never lost even though the patient-facing list has one row
 * per diagnosis.
 */
export async function reconcilePatientDiagnoses(
  patientId: string,
  visitId: string,
  careflowType: CareflowType,
  diagnoses: SignedDiagnosis[]
) {
  for (const dx of diagnoses) {
    const record = await prisma.patientDiagnosis.upsert({
      where: { patientId_icd10: { patientId, icd10: dx.icd10 } },
      update: {
        lastConfirmedAt: new Date(),
        lastConfirmedById: visitId,
        description: dx.description, // keep description current if it changed
        active: true,
      },
      create: {
        patientId,
        icd10: dx.icd10,
        description: dx.description,
        lastConfirmedById: visitId,
      },
    })

    // Provenance log entry — safe to call even if this visit already logged
    // this diagnosis (shouldn't happen since sign is one-shot, but unique
    // constraint + upsert-style guard keeps it idempotent).
    await prisma.patientDiagnosisAssertion.upsert({
      where: { patientDiagnosisId_visitId: { patientDiagnosisId: record.id, visitId } },
      update: {},
      create: { patientDiagnosisId: record.id, visitId, careflowType },
    })
  }
}

/**
 * Same pattern as diagnoses, for medications. Uniqueness is on
 * (patientId, name, dosage, frequency) — a med with a changed dosage is
 * treated as a distinct row deliberately, since "metformin 500mg" and
 * "metformin 1000mg" are clinically different facts, not duplicates of
 * the same fact.
 */
export async function reconcilePatientMedications(
  patientId: string,
  visitId: string,
  careflowType: CareflowType,
  medications: SignedMedication[]
) {
  for (const med of medications) {
    const dosage = med.dosage ?? null
    const frequency = med.frequency ?? null

    const existing = await prisma.patientMedication.findFirst({
      where: { patientId, name: med.name, dosage, frequency },
    })

    const record = existing
      ? await prisma.patientMedication.update({
          where: { id: existing.id },
          data: { lastConfirmedAt: new Date(), lastConfirmedById: visitId, active: true },
        })
      : await prisma.patientMedication.create({
          data: { patientId, name: med.name, dosage, frequency, lastConfirmedById: visitId },
        })

    await prisma.patientMedicationAssertion.upsert({
      where: { patientMedicationId_visitId: { patientMedicationId: record.id, visitId } },
      update: {},
      create: { patientMedicationId: record.id, visitId, careflowType },
    })
  }
}
