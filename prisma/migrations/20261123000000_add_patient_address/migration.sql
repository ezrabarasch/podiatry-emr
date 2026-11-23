-- Patient home address, synced from PCC GET /patients/{id} (previousAddress.*).
-- Used as the claim subscriber address (CMS-1500 box 5). Purely additive, all nullable.
ALTER TABLE "patients"
  ADD COLUMN "addressLine1" TEXT,
  ADD COLUMN "addressLine2" TEXT,
  ADD COLUMN "city" TEXT,
  ADD COLUMN "state" TEXT,
  ADD COLUMN "zipCode" TEXT,
  ADD COLUMN "county" TEXT;
