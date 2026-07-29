-- Reconcile production's hand-built multi-service-line-foundation schema with
-- the intended design (Option 2 decision, 7/28-7/29 reconciliation).
--
-- The 6 supporting tables (patient_diagnosis_assertions,
-- patient_medication_assertions, careflow_sections, careflow_field_groups,
-- careflow_fields, codes/CodeSystem) already exist in production exactly
-- matching the intended design - no DDL needed for those, they only need to
-- be formally declared in schema.prisma.
--
-- patient_diagnoses and patient_medications both need correction: their
-- lastConfirmedById column (misleadingly named - it holds a visitId, not a
-- person id) is renamed to lastAssertedByVisitId and made properly nullable.
-- NULL = externally-sourced (e.g. PCC), no signed visit behind it.

-- patient_diagnoses: already nullable (from migration 20260728030000). Rename only.
ALTER TABLE "patient_diagnoses" RENAME COLUMN "lastConfirmedById" TO "lastAssertedByVisitId";

-- patient_medications: still NOT NULL. Drop constraint, then rename.
ALTER TABLE "patient_medications" ALTER COLUMN "lastConfirmedById" DROP NOT NULL;
ALTER TABLE "patient_medications" RENAME COLUMN "lastConfirmedById" TO "lastAssertedByVisitId";

-- Clean up placeholder/orphaned values. Confirmed 7/29: no real patient data
-- exists in production. 'pcc-sync' is a fake sentinel string (never a real
-- visit reference); the one genuine-looking UUID belongs to the John Doe
-- test patient and points at a visit that's since been deleted (visits table
-- is currently empty) - an orphaned reference either way. Both tables get a
-- blanket cleanup rather than targeting only the specific values already
-- known, in case other stray values exist that haven't surfaced yet.
UPDATE "patient_diagnoses" SET "lastAssertedByVisitId" = NULL
  WHERE "lastAssertedByVisitId" IS NOT NULL
  AND "lastAssertedByVisitId" NOT IN (SELECT id FROM visits);

UPDATE "patient_medications" SET "lastAssertedByVisitId" = NULL
  WHERE "lastAssertedByVisitId" IS NOT NULL
  AND "lastAssertedByVisitId" NOT IN (SELECT id FROM visits);

-- Add real FK constraints now that the column is nullable and honestly
-- represents "the visit that last confirmed this, if any". No FK existed
-- before, which is exactly how the fake sentinel values went undetected.
-- ON DELETE SET NULL (not CASCADE): deleting a visit shouldn't delete the
-- diagnosis/medication itself, just clear the stale pointer.
ALTER TABLE "patient_diagnoses" ADD CONSTRAINT "patient_diagnoses_lastAssertedByVisitId_fkey"
  FOREIGN KEY ("lastAssertedByVisitId") REFERENCES "visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "patient_medications" ADD CONSTRAINT "patient_medications_lastAssertedByVisitId_fkey"
  FOREIGN KEY ("lastAssertedByVisitId") REFERENCES "visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

