-- v1.4 PCC ETL expansion: 12 additional per-patient PCC resource tables.
-- Hand-authored (local Postgres down). Applied via `prisma migrate deploy`.
-- Columns are camelCase to match the rest of the schema; ids are supplied by the ETL.

-- CreateTable
CREATE TABLE "patient_medications" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "pccOrderId" TEXT,
    "description" TEXT NOT NULL,
    "status" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "directions" TEXT,
    "strength" TEXT,
    "strengthUOM" TEXT,
    "rxNormId" TEXT,
    "generic" BOOLEAN NOT NULL DEFAULT false,
    "narcotic" BOOLEAN NOT NULL DEFAULT false,
    "orderDate" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_medications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_allergies" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "pccAllergyId" TEXT,
    "allergen" TEXT NOT NULL,
    "allergenCode" TEXT,
    "category" TEXT,
    "type" TEXT,
    "severity" TEXT,
    "reaction" TEXT,
    "reactionNote" TEXT,
    "clinicalStatus" TEXT,
    "onsetDate" TIMESTAMP(3),
    "resolvedDate" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_allergies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_observations" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "pccObservationId" TEXT,
    "type" TEXT NOT NULL,
    "value" DOUBLE PRECISION,
    "diastolicValue" DOUBLE PRECISION,
    "systolicValue" DOUBLE PRECISION,
    "unit" TEXT,
    "method" TEXT,
    "recordedDate" TIMESTAMP(3) NOT NULL,
    "recordedBy" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_contacts" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "pccContactId" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "relationship" TEXT,
    "contactType" TEXT,
    "homePhone" TEXT,
    "cellPhone" TEXT,
    "officePhone" TEXT,
    "email" TEXT,
    "addressLine1" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "isGuarantor" BOOLEAN NOT NULL DEFAULT false,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_adt_records" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "pccAdtRecordId" TEXT,
    "actionCode" TEXT,
    "actionType" TEXT,
    "effectiveDateTime" TIMESTAMP(3),
    "roomDesc" TEXT,
    "bedDesc" TEXT,
    "unitDesc" TEXT,
    "floorDesc" TEXT,
    "payerName" TEXT,
    "payerType" TEXT,
    "transferReason" TEXT,
    "dischargeStatus" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_adt_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_practitioners" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "pccPractitionerId" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "npi" TEXT,
    "providerType" TEXT,
    "relation" TEXT,
    "title" TEXT,
    "taxonomyCode" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_practitioners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_immunizations" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "pccImmunizationId" TEXT,
    "immunization" TEXT,
    "cvxCode" TEXT,
    "administrationDateTime" TIMESTAMP(3),
    "administeredBy" TEXT,
    "lotNumber" TEXT,
    "manufacturerName" TEXT,
    "consentStatus" TEXT,
    "given" BOOLEAN NOT NULL DEFAULT false,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_immunizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_diagnostic_reports" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "pccReportId" TEXT,
    "reportName" TEXT,
    "reportType" TEXT,
    "reportStatus" TEXT,
    "category" TEXT,
    "effectiveDateTime" TIMESTAMP(3),
    "orderingPractitioner" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_diagnostic_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_care_plans" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "pccCarePlanId" TEXT,
    "status" TEXT,
    "createdDate" TIMESTAMP(3),
    "nextReviewDate" TIMESTAMP(3),
    "closedDate" TIMESTAMP(3),
    "closureReason" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_care_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_assessments" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "pccAssessmentId" TEXT,
    "assessmentRefDate" TIMESTAMP(3),
    "assessmentScore" DOUBLE PRECISION,
    "assessmentStatus" TEXT,
    "templateId" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_episodes_of_care" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "pccEpisodeId" TEXT,
    "name" TEXT,
    "type" TEXT,
    "status" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "payerName" TEXT,
    "payerType" TEXT,
    "model" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_episodes_of_care_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_therapy_tracks" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "discipline" TEXT,
    "onsetDate" TIMESTAMP(3),
    "startOfCareDate" TIMESTAMP(3),
    "certificationStartDate" TIMESTAMP(3),
    "certificationEndDate" TIMESTAMP(3),
    "medicalDiagnosis" TEXT,
    "treatmentDiagnosis" TEXT,
    "treatmentFreqPerWeek" TEXT,
    "therapyProvider" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_therapy_tracks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "patient_medications_patientId_pccOrderId_key" ON "patient_medications"("patientId", "pccOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "patient_allergies_patientId_allergen_key" ON "patient_allergies"("patientId", "allergen");

-- CreateIndex
CREATE INDEX "patient_observations_patientId_idx" ON "patient_observations"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "patient_contacts_patientId_pccContactId_key" ON "patient_contacts"("patientId", "pccContactId");

-- CreateIndex
CREATE UNIQUE INDEX "patient_adt_records_patientId_pccAdtRecordId_key" ON "patient_adt_records"("patientId", "pccAdtRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "patient_practitioners_patientId_pccPractitionerId_key" ON "patient_practitioners"("patientId", "pccPractitionerId");

-- CreateIndex
CREATE UNIQUE INDEX "patient_immunizations_patientId_pccImmunizationId_key" ON "patient_immunizations"("patientId", "pccImmunizationId");

-- CreateIndex
CREATE UNIQUE INDEX "patient_diagnostic_reports_patientId_pccReportId_key" ON "patient_diagnostic_reports"("patientId", "pccReportId");

-- CreateIndex
CREATE UNIQUE INDEX "patient_care_plans_patientId_pccCarePlanId_key" ON "patient_care_plans"("patientId", "pccCarePlanId");

-- CreateIndex
CREATE UNIQUE INDEX "patient_assessments_patientId_pccAssessmentId_key" ON "patient_assessments"("patientId", "pccAssessmentId");

-- CreateIndex
CREATE UNIQUE INDEX "patient_episodes_of_care_patientId_pccEpisodeId_key" ON "patient_episodes_of_care"("patientId", "pccEpisodeId");

-- CreateIndex
CREATE INDEX "patient_therapy_tracks_patientId_idx" ON "patient_therapy_tracks"("patientId");

-- AddForeignKey
ALTER TABLE "patient_medications" ADD CONSTRAINT "patient_medications_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_allergies" ADD CONSTRAINT "patient_allergies_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_observations" ADD CONSTRAINT "patient_observations_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_contacts" ADD CONSTRAINT "patient_contacts_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_adt_records" ADD CONSTRAINT "patient_adt_records_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_practitioners" ADD CONSTRAINT "patient_practitioners_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_immunizations" ADD CONSTRAINT "patient_immunizations_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_diagnostic_reports" ADD CONSTRAINT "patient_diagnostic_reports_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_care_plans" ADD CONSTRAINT "patient_care_plans_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_assessments" ADD CONSTRAINT "patient_assessments_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_episodes_of_care" ADD CONSTRAINT "patient_episodes_of_care_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_therapy_tracks" ADD CONSTRAINT "patient_therapy_tracks_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
