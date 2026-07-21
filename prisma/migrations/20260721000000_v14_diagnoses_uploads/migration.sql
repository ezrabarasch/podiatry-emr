-- v1.4 patient detail expansion: problem list + document uploads.
-- Hand-authored (local Postgres down). Applied via `prisma migrate deploy`.

-- CreateTable
CREATE TABLE "patient_diagnoses" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "icd10Code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_diagnoses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_uploads" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileLabel" TEXT,
    "mimeType" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "patient_diagnoses_patientId_idx" ON "patient_diagnoses"("patientId");

-- CreateIndex
CREATE INDEX "patient_uploads_patientId_idx" ON "patient_uploads"("patientId");

-- AddForeignKey
ALTER TABLE "patient_diagnoses" ADD CONSTRAINT "patient_diagnoses_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_uploads" ADD CONSTRAINT "patient_uploads_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_uploads" ADD CONSTRAINT "patient_uploads_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
