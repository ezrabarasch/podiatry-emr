-- Practice/Provider schema foundation: Practice entity, provider<->practice
-- and practice<->careflowType many-to-many join tables, plus provider fields
-- on User and an optional Practice link on Facility.
-- Purely additive — no drops, no column type changes, no data changes.
-- Hand-authored (local Postgres unreachable in this session). Applied via `prisma migrate deploy`.

-- CreateTable
CREATE TABLE "practices" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tin" TEXT,
    "groupNpi" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "practices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_practices" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,

    CONSTRAINT "provider_practices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "practice_service_types" (
    "id" TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "careflowType" "CareflowType" NOT NULL,

    CONSTRAINT "practice_service_types_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "facilities" ADD COLUMN "practiceId" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN "npi" TEXT,
ADD COLUMN "licenseNumber" TEXT,
ADD COLUMN "specialty" TEXT,
ADD COLUMN "address" TEXT,
ADD COLUMN "phone" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "provider_practices_userId_practiceId_key" ON "provider_practices"("userId", "practiceId");

-- CreateIndex
CREATE UNIQUE INDEX "practice_service_types_practiceId_careflowType_key" ON "practice_service_types"("practiceId", "careflowType");

-- AddForeignKey
ALTER TABLE "facilities" ADD CONSTRAINT "facilities_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "practices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_practices" ADD CONSTRAINT "provider_practices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_practices" ADD CONSTRAINT "provider_practices_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_service_types" ADD CONSTRAINT "practice_service_types_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
