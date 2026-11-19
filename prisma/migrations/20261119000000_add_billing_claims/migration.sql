-- Billing claims (phase 1): claims, claim_service_lines, claim_events, claim_notes,
-- plus fee_schedule_items (no fee schedule existed; a claim cannot be built without
-- line charges). Purely additive: new enums, tables, one sequence. No existing table
-- or column is touched.

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('Draft', 'Ready', 'Submitted', 'Accepted', 'Rejected', 'AwaitingPayment', 'Denied', 'Appealed', 'PartialPaidPending', 'FullPaidClosed', 'PartialPaidClosed', 'Void');

-- CreateEnum
CREATE TYPE "ClaimEventType" AS ENUM ('Submitted', 'Acknowledged', 'Accepted', 'Rejected', 'ERAReceived', 'Resubmitted', 'Appealed', 'Voided', 'WrittenOff', 'NoteAdded');

-- Patient control numbers: QMD-<year>-<sequence>, e.g. QMD-2026-0001 (<= 20 chars, unique).
-- A sequence (not max()+1) so concurrent claim generation can never hand out the same number.
CREATE SEQUENCE "claim_number_seq" START 1;

-- CreateTable
CREATE TABLE "claims" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "patientControlNumber" VARCHAR(20) NOT NULL,
    "stediCorrelationId" VARCHAR(100),
    "status" "ClaimStatus" NOT NULL DEFAULT 'Draft',
    "payerId" VARCHAR(50),
    "payerName" VARCHAR(200),
    "totalCharges" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalAllowed" DECIMAL(12,2),
    "totalPaid" DECIMAL(12,2),
    "totalAdjustment" DECIMAL(12,2),
    "patientResponsibility" DECIMAL(12,2),
    "diagnoses" JSONB,
    "scrubErrors" JSONB,
    "firstScrubPassed" BOOLEAN,
    "submittedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "adjudicatedAt" TIMESTAMP(3),
    "deniedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "writeOffAmount" DECIMAL(12,2),
    "writeOffReason" TEXT,
    "parentClaimId" TEXT,
    "claimPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claim_service_lines" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "lineControlNumber" VARCHAR(30),
    "cptCode" VARCHAR(5) NOT NULL,
    "modifiers" TEXT[],
    "description" TEXT NOT NULL,
    "diagnosisPointers" TEXT[],
    "units" INTEGER NOT NULL DEFAULT 1,
    "chargeAmount" DECIMAL(10,2) NOT NULL,
    "allowedAmount" DECIMAL(10,2),
    "paidAmount" DECIMAL(10,2),
    "adjustmentAmount" DECIMAL(10,2),
    "adjustmentReasonCodes" JSONB,
    "remarkCodes" JSONB,

    CONSTRAINT "claim_service_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claim_events" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "eventType" "ClaimEventType" NOT NULL,
    "statusCodes" JSONB,
    "description" TEXT NOT NULL,
    "rawPayload" JSONB,
    "stediCorrelationId" VARCHAR(100),
    "stediEventId" VARCHAR(100),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "claim_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claim_notes" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "claim_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_schedule_items" (
    "id" TEXT NOT NULL,
    "cptCode" VARCHAR(5) NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fee_schedule_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "claims_patientControlNumber_key" ON "claims"("patientControlNumber");

-- CreateIndex
CREATE INDEX "claims_status_idx" ON "claims"("status");

-- CreateIndex
CREATE INDEX "claims_patientId_idx" ON "claims"("patientId");

-- CreateIndex
CREATE INDEX "claims_visitId_idx" ON "claims"("visitId");

-- CreateIndex
CREATE INDEX "claims_submittedAt_idx" ON "claims"("submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "claim_service_lines_claimId_lineNumber_key" ON "claim_service_lines"("claimId", "lineNumber");

-- CreateIndex
CREATE INDEX "claim_events_claimId_createdAt_idx" ON "claim_events"("claimId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "claim_events_claimId_stediEventId_key" ON "claim_events"("claimId", "stediEventId");

-- CreateIndex
CREATE UNIQUE INDEX "fee_schedule_items_cptCode_key" ON "fee_schedule_items"("cptCode");

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "visits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_parentClaimId_fkey" FOREIGN KEY ("parentClaimId") REFERENCES "claims"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claim_service_lines" ADD CONSTRAINT "claim_service_lines_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claim_events" ADD CONSTRAINT "claim_events_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claim_events" ADD CONSTRAINT "claim_events_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claim_notes" ADD CONSTRAINT "claim_notes_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claim_notes" ADD CONSTRAINT "claim_notes_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
