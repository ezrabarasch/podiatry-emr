-- Stedi eligibility (Phase 1): request queue + results, and a payer-label map.
--
-- The app inserts a 'pending' stedi_eligibility_checks row; etl/stedi/worker.py
-- claims it, calls Stedi, and writes the result back (same shape as the PCC
-- webhook poller). No tenantId: rows are reached only through patientId and the
-- scoped Prisma client filters patient-child models by ancestry. No FK to
-- patient_coverages/visits on purpose - the PCC sync deletes and recreates
-- coverage rows, and a check must outlive that.
--
-- Additive only. Hand-authored (no shadow DB), matching the repo convention.

CREATE TABLE "stedi_eligibility_checks" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "visitId" TEXT,
    "coverageId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "outcome" TEXT,
    "payerId" TEXT,
    "message" TEXT,
    "summary" JSONB,
    "rawResponse" JSONB,
    "latencyMs" INTEGER,
    "applicationMode" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "stedi_eligibility_checks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "stedi_eligibility_checks_patientId_requestedAt_idx" ON "stedi_eligibility_checks"("patientId", "requestedAt");
CREATE INDEX "stedi_eligibility_checks_status_idx" ON "stedi_eligibility_checks"("status");

ALTER TABLE "stedi_eligibility_checks" ADD CONSTRAINT "stedi_eligibility_checks_patientId_fkey"
    FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- EMR payer labels are PCC billing categories, not insurers; this maps the
-- ones that ARE resolvable. Medicare falls back to payerType in code.
CREATE TABLE "stedi_payer_map" (
    "labelKey" TEXT NOT NULL,
    "stediPayerId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,

    CONSTRAINT "stedi_payer_map_pkey" PRIMARY KEY ("labelKey")
);

-- IDs verified against Stedi's payer search (2026-10-06).
INSERT INTO "stedi_payer_map" ("labelKey", "stediPayerId", "displayName") VALUES
    ('medicaid-fl', '77027', 'Medicaid Florida'),
    ('fl mcd mng-molina healthcare', '51062', 'Molina Healthcare Florida')
ON CONFLICT DO NOTHING;
