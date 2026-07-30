-- Repair migration: rebuilds the multi-service-line schema on a from-scratch
-- database. The original CREATE migration (20260630062659) was never committed
-- to this branch's migrations folder - it exists only in tag
-- archive/multi-service-line-design-fix and in staging's already-applied
-- history. Without it, a fresh `prisma migrate deploy` reaches the Phase 3
-- reconciliation migration (20260729190000) with none of the assertion-era
-- columns/tables present, and fails.
--
-- Every statement is idempotent (IF NOT EXISTS / guarded DO blocks) so this is
-- a clean no-op on production and staging (which already have these objects,
-- hand-built or migrated) and actually builds them on a fresh database.
-- Must run BEFORE 20260729190000_multi_service_line_reconciliation.

-- ── Enum: CodeSystem (may already exist) ──
DO $$ BEGIN
  CREATE TYPE "CodeSystem" AS ENUM ('icd10', 'cpt');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ── Enum value: CareflowType += wound_care (may already exist) ──
ALTER TYPE "CareflowType" ADD VALUE IF NOT EXISTS 'wound_care';

-- ── patient_diagnoses / patient_medications already exist (created by
--    20260722010000_pcc_etl_expansion with PCC columns). Add the assertion-era
--    columns onto them. lastConfirmedById added WITHOUT NOT NULL here: on a
--    fresh build the table is empty so it doesn't matter, and the very next
--    migration (20260729190000) renames it and formalizes nullability anyway. ──
ALTER TABLE "patient_diagnoses" ADD COLUMN IF NOT EXISTS "firstAssertedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "patient_diagnoses" ADD COLUMN IF NOT EXISTS "lastConfirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "patient_diagnoses" ADD COLUMN IF NOT EXISTS "lastConfirmedById" TEXT;
ALTER TABLE "patient_diagnoses" ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "patient_medications" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "patient_medications" ADD COLUMN IF NOT EXISTS "dosage" TEXT;
ALTER TABLE "patient_medications" ADD COLUMN IF NOT EXISTS "frequency" TEXT;
ALTER TABLE "patient_medications" ADD COLUMN IF NOT EXISTS "firstAssertedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "patient_medications" ADD COLUMN IF NOT EXISTS "lastConfirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "patient_medications" ADD COLUMN IF NOT EXISTS "lastConfirmedById" TEXT;
ALTER TABLE "patient_medications" ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true;

-- ── Assertion tables + codes + careflow structure (don't exist on fresh build) ──
CREATE TABLE IF NOT EXISTS "patient_diagnosis_assertions" (
    "id" TEXT NOT NULL,
    "patientDiagnosisId" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "careflowType" "CareflowType" NOT NULL,
    "assertedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "patient_diagnosis_assertions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "patient_medication_assertions" (
    "id" TEXT NOT NULL,
    "patientMedicationId" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "careflowType" "CareflowType" NOT NULL,
    "assertedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "patient_medication_assertions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "codes" (
    "id" TEXT NOT NULL,
    "system" "CodeSystem" NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    CONSTRAINT "codes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "careflow_sections" (
    "id" TEXT NOT NULL,
    "careflowType" "CareflowType" NOT NULL DEFAULT 'at_risk_podiatry',
    "sectionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "careflow_sections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "careflow_field_groups" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "groupLabel" TEXT,
    "accentColor" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "careflow_field_groups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "careflow_fields" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "config" JSONB,
    "position" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "careflow_fields_pkey" PRIMARY KEY ("id")
);

-- ── Unique indexes (CREATE UNIQUE INDEX IF NOT EXISTS is supported) ──
CREATE UNIQUE INDEX IF NOT EXISTS "patient_diagnoses_patientId_icd10_key" ON "patient_diagnoses"("patientId", "icd10");
CREATE UNIQUE INDEX IF NOT EXISTS "patient_diagnosis_assertions_patientDiagnosisId_visitId_key" ON "patient_diagnosis_assertions"("patientDiagnosisId", "visitId");
CREATE UNIQUE INDEX IF NOT EXISTS "patient_medications_patientId_name_dosage_frequency_key" ON "patient_medications"("patientId", "name", "dosage", "frequency");
CREATE UNIQUE INDEX IF NOT EXISTS "patient_medication_assertions_patientMedicationId_visitId_key" ON "patient_medication_assertions"("patientMedicationId", "visitId");
CREATE UNIQUE INDEX IF NOT EXISTS "codes_system_code_key" ON "codes"("system", "code");
CREATE UNIQUE INDEX IF NOT EXISTS "careflow_sections_careflowType_sectionId_key" ON "careflow_sections"("careflowType", "sectionId");

-- ── Foreign keys (guarded: ADD CONSTRAINT has no IF NOT EXISTS, so wrap) ──
DO $$ BEGIN
  ALTER TABLE "patient_diagnosis_assertions" ADD CONSTRAINT "patient_diagnosis_assertions_patientDiagnosisId_fkey" FOREIGN KEY ("patientDiagnosisId") REFERENCES "patient_diagnoses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "patient_diagnosis_assertions" ADD CONSTRAINT "patient_diagnosis_assertions_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "patient_medication_assertions" ADD CONSTRAINT "patient_medication_assertions_patientMedicationId_fkey" FOREIGN KEY ("patientMedicationId") REFERENCES "patient_medications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "patient_medication_assertions" ADD CONSTRAINT "patient_medication_assertions_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "careflow_field_groups" ADD CONSTRAINT "careflow_field_groups_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "careflow_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "careflow_fields" ADD CONSTRAINT "careflow_fields_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "careflow_field_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

