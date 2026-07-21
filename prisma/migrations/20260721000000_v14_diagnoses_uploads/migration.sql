-- v1.4 patient problem list. Hand-authored. Applied via `prisma migrate deploy`.
-- Idempotent: the patient_diagnoses table already exists in some environments
-- (created out-of-band by the PCC sync), so guard against re-creation.
-- patient_uploads lives in its own later migration (20260721010000_patient_uploads).

-- CreateTable
CREATE TABLE IF NOT EXISTS "patient_diagnoses" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "icd10" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_diagnoses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "patient_diagnoses_patientId_idx" ON "patient_diagnoses"("patientId");

-- AddForeignKey (guarded — constraint may already exist on a pre-created table)
DO $$ BEGIN
    ALTER TABLE "patient_diagnoses" ADD CONSTRAINT "patient_diagnoses_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
