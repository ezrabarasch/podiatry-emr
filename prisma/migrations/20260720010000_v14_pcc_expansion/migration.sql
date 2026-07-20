-- v1.4 — PCC data schema expansion.
-- Adds patient demographic/clinical fields, facility POS code, and the
-- patient_coverages table. Applied via `prisma migrate deploy`.

-- CreateEnum
CREATE TYPE "PayerType" AS ENUM ('MEDICARE', 'MEDICAID', 'COMMERCIAL', 'OTHER');

-- AlterTable
ALTER TABLE "facilities" ADD COLUMN "posCode" TEXT;

-- AlterTable
ALTER TABLE "patients"
    ADD COLUMN "roomNumber" TEXT,
    ADD COLUMN "admissionDate" TIMESTAMP(3),
    ADD COLUMN "dischargeDate" TIMESTAMP(3),
    ADD COLUMN "medicareNumber" TEXT,
    ADD COLUMN "medicaidNumber" TEXT,
    ADD COLUMN "primaryLanguage" TEXT,
    ADD COLUMN "isDeceased" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "patient_coverages" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "payerName" TEXT NOT NULL,
    "payerType" "PayerType" NOT NULL,
    "memberId" TEXT,
    "groupId" TEXT,
    "effectiveDate" TIMESTAMP(3),
    "terminationDate" TIMESTAMP(3),
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_coverages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "patient_coverages_patientId_idx" ON "patient_coverages"("patientId");

-- AddForeignKey
ALTER TABLE "patient_coverages" ADD CONSTRAINT "patient_coverages_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
