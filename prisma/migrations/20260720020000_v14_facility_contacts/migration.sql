-- v1.4 — Facility contact fields.
-- Adds admin and DON contact info to facilities. Applied via `prisma migrate deploy`.

-- AlterTable
ALTER TABLE "facilities"
    ADD COLUMN "adminContactName" TEXT,
    ADD COLUMN "adminContactPhone" TEXT,
    ADD COLUMN "adminContactEmail" TEXT,
    ADD COLUMN "donContactName" TEXT,
    ADD COLUMN "donContactPhone" TEXT,
    ADD COLUMN "donContactEmail" TEXT;
