-- CreateEnum
CREATE TYPE "FacilityType" AS ENUM ('SNF', 'ALF');

-- CreateEnum
CREATE TYPE "VisitType" AS ENUM ('new_patient', 'established');

-- CreateEnum
CREATE TYPE "VisitStatus" AS ENUM ('draft', 'signed');

-- CreateEnum
CREATE TYPE "CareflowType" AS ENUM ('at_risk_podiatry');

-- CreateEnum
CREATE TYPE "PlaceOfService" AS ENUM ('bedside', 'wheelchair');

-- CreateEnum
CREATE TYPE "DataSource" AS ENUM ('manual', 'pcc_import');

-- CreateTable
CREATE TABLE "facilities" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "facilityType" "FacilityType" NOT NULL,
    "address" TEXT,
    "npi" TEXT,
    "pccFacilityId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "facilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "providers" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "credentials" TEXT,
    "npi" TEXT,
    "email" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_tokens" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "patients" (
    "id" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "pccPatientId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "dob" TIMESTAMP(3) NOT NULL,
    "facilityType" "FacilityType" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visits" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "visitDate" TIMESTAMP(3) NOT NULL,
    "visitType" "VisitType" NOT NULL,
    "facilityType" "FacilityType" NOT NULL,
    "placeOfService" "PlaceOfService",
    "careflowType" "CareflowType" NOT NULL DEFAULT 'at_risk_podiatry',
    "status" "VisitStatus" NOT NULL DEFAULT 'draft',
    "signedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visit_emr_imports" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "pccPatientId" TEXT,
    "vitals" JSONB NOT NULL,
    "medications" JSONB NOT NULL,
    "medicalHistory" JSONB NOT NULL,
    "pulledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rawResponse" JSONB,

    CONSTRAINT "visit_emr_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visit_field_selections" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "visit_field_selections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visit_notes" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "noteText" TEXT NOT NULL,
    "procedureNotes" JSONB,
    "specialSections" JSONB,
    "diagnoses" JSONB NOT NULL,
    "cptCodes" JSONB NOT NULL,
    "addendum" TEXT,
    "vitalsSnapshot" JSONB,
    "medicationsSnapshot" JSONB,
    "medicalHistorySnapshot" JSONB,
    "billingAlerts" JSONB,
    "snapshotAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "careflow_rules" (
    "id" TEXT NOT NULL,
    "careflowType" "CareflowType" NOT NULL DEFAULT 'at_risk_podiatry',
    "section" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "fieldValue" TEXT NOT NULL,
    "noteFragment" TEXT,
    "icd10Codes" JSONB,
    "cptCodes" JSONB,
    "cptQualifier" TEXT,
    "dxCondition" TEXT,
    "sectionLabel" TEXT,
    "procedureNarrative" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "careflow_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "careflow_static_fragments" (
    "id" TEXT NOT NULL,
    "careflowType" "CareflowType" NOT NULL DEFAULT 'at_risk_podiatry',
    "section" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "fragmentText" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "careflow_static_fragments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "careflow_derived_rules" (
    "id" TEXT NOT NULL,
    "careflowType" "CareflowType" NOT NULL DEFAULT 'at_risk_podiatry',
    "conditionName" TEXT NOT NULL,
    "triggerCodes" JSONB NOT NULL,
    "noteFragment" TEXT NOT NULL,
    "outputSection" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "careflow_derived_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cpt_qualifier_rules" (
    "id" TEXT NOT NULL,
    "cptCode" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "requiresQualifier" BOOLEAN NOT NULL DEFAULT false,
    "minimumClass" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cpt_qualifier_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "providers_email_key" ON "providers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_type_providerAccountId_key" ON "accounts"("type", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_sessionToken_key" ON "sessions"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_token_key" ON "verification_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_identifier_token_key" ON "verification_tokens"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "patients_pccPatientId_key" ON "patients"("pccPatientId");

-- CreateIndex
CREATE UNIQUE INDEX "visit_emr_imports_visitId_key" ON "visit_emr_imports"("visitId");

-- CreateIndex
CREATE UNIQUE INDEX "visit_field_selections_visitId_section_fieldKey_key" ON "visit_field_selections"("visitId", "section", "fieldKey");

-- CreateIndex
CREATE UNIQUE INDEX "visit_notes_visitId_key" ON "visit_notes"("visitId");

-- CreateIndex
CREATE UNIQUE INDEX "careflow_rules_careflowType_section_fieldKey_fieldValue_key" ON "careflow_rules"("careflowType", "section", "fieldKey", "fieldValue");

-- CreateIndex
CREATE UNIQUE INDEX "cpt_qualifier_rules_cptCode_key" ON "cpt_qualifier_rules"("cptCode");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "facilities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_emr_imports" ADD CONSTRAINT "visit_emr_imports_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_field_selections" ADD CONSTRAINT "visit_field_selections_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_notes" ADD CONSTRAINT "visit_notes_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;
