-- patient_uploads table (document attachments stored on local disk).
-- Standalone; hand-authored. Applied via `prisma migrate deploy`.

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
CREATE INDEX "patient_uploads_patientId_idx" ON "patient_uploads"("patientId");

-- AddForeignKey
ALTER TABLE "patient_uploads" ADD CONSTRAINT "patient_uploads_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_uploads" ADD CONSTRAINT "patient_uploads_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
