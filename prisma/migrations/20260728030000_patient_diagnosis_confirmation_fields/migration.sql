-- Sign-time reconciliation columns (firstAssertedAt, lastConfirmedAt,
-- lastConfirmedById) already exist in production, added outside migration
-- history. This migration is written to be safe on both production (no-op
-- adds) and fresh/staging environments (creates the columns).
ALTER TABLE "patient_diagnoses" ADD COLUMN IF NOT EXISTS "firstAssertedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "patient_diagnoses" ADD COLUMN IF NOT EXISTS "lastConfirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "patient_diagnoses" ADD COLUMN IF NOT EXISTS "lastConfirmedById" TEXT;

-- PCC-synced diagnoses have no confirming provider, so this must be nullable.
-- Explicit DROP NOT NULL covers production, where the column already exists
-- as NOT NULL.
ALTER TABLE "patient_diagnoses" ALTER COLUMN "lastConfirmedById" DROP NOT NULL;
