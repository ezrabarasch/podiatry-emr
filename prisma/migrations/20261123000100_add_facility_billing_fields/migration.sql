-- Structured facility address + contact/tax fields for the CMS-1500 service facility (box 32).
-- The legacy single-string "address" column stays; the claim builder prefers these when complete.
-- Purely additive, all nullable.
ALTER TABLE "facilities"
  ADD COLUMN "addressLine1" TEXT,
  ADD COLUMN "addressLine2" TEXT,
  ADD COLUMN "city" TEXT,
  ADD COLUMN "state" TEXT,
  ADD COLUMN "zipCode" TEXT,
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "fax" TEXT,
  ADD COLUMN "tin" TEXT;
