-- CreateEnum
CREATE TYPE "CodeSystem" AS ENUM ('icd10', 'cpt');

-- AlterEnum
ALTER TYPE "CareflowType" ADD VALUE 'wound_care';

-- CreateTable
CREATE TABLE "patient_diagnoses" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "icd10" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "firstAssertedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastConfirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastConfirmedById" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "patient_diagnoses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_diagnosis_assertions" (
    "id" TEXT NOT NULL,
    "patientDiagnosisId" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "careflowType" "CareflowType" NOT NULL,
    "assertedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_diagnosis_assertions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_medications" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dosage" TEXT,
    "frequency" TEXT,
    "firstAssertedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastConfirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastConfirmedById" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "patient_medications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_medication_assertions" (
    "id" TEXT NOT NULL,
    "patientMedicationId" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "careflowType" "CareflowType" NOT NULL,
    "assertedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_medication_assertions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "codes" (
    "id" TEXT NOT NULL,
    "system" "CodeSystem" NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "careflow_sections" (
    "id" TEXT NOT NULL,
    "careflowType" "CareflowType" NOT NULL DEFAULT 'at_risk_podiatry',
    "sectionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "careflow_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "careflow_field_groups" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "groupLabel" TEXT,
    "accentColor" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "careflow_field_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "careflow_fields" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "config" JSONB,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "careflow_fields_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "patient_diagnoses_patientId_icd10_key" ON "patient_diagnoses"("patientId", "icd10");

-- CreateIndex
CREATE UNIQUE INDEX "patient_diagnosis_assertions_patientDiagnosisId_visitId_key" ON "patient_diagnosis_assertions"("patientDiagnosisId", "visitId");

-- CreateIndex
CREATE UNIQUE INDEX "patient_medications_patientId_name_dosage_frequency_key" ON "patient_medications"("patientId", "name", "dosage", "frequency");

-- CreateIndex
CREATE UNIQUE INDEX "patient_medication_assertions_patientMedicationId_visitId_key" ON "patient_medication_assertions"("patientMedicationId", "visitId");

-- CreateIndex
CREATE UNIQUE INDEX "codes_system_code_key" ON "codes"("system", "code");

-- CreateIndex
CREATE UNIQUE INDEX "careflow_sections_careflowType_sectionId_key" ON "careflow_sections"("careflowType", "sectionId");

-- AddForeignKey
ALTER TABLE "patient_diagnoses" ADD CONSTRAINT "patient_diagnoses_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_diagnosis_assertions" ADD CONSTRAINT "patient_diagnosis_assertions_patientDiagnosisId_fkey" FOREIGN KEY ("patientDiagnosisId") REFERENCES "patient_diagnoses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_diagnosis_assertions" ADD CONSTRAINT "patient_diagnosis_assertions_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_medications" ADD CONSTRAINT "patient_medications_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_medication_assertions" ADD CONSTRAINT "patient_medication_assertions_patientMedicationId_fkey" FOREIGN KEY ("patientMedicationId") REFERENCES "patient_medications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_medication_assertions" ADD CONSTRAINT "patient_medication_assertions_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "careflow_field_groups" ADD CONSTRAINT "careflow_field_groups_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "careflow_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "careflow_fields" ADD CONSTRAINT "careflow_fields_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "careflow_field_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
