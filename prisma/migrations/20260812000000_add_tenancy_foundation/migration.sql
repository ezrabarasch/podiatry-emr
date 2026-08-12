-- Tenancy foundation: Tenant model, direct tenantId on Facility/Practice/User/
-- Patient/Visit, Practice<->Facility many-to-many (PracticeFacility, coexists
-- with the old Facility.practiceId single FK — dropped in a LATER migration),
-- Visit.practiceId (the practice a visit was created under), SUPER_ADMIN role,
-- and the login-identifier swap from User.username to User.email.
--
-- This is the first DATA-WRITING migration in this repo — it backfills real
-- rows (a "Tenant #1" row, tenantId on every existing row, practice_facilities
-- rows derived from today's facilities.practiceId, visits.practiceId derived
-- from patient->facility, and placeholder emails for any user missing one)
-- before tightening constraints to NOT NULL. No existing column is dropped.
--
-- Hand-authored (local Postgres unreachable in this session). Applied via
-- `prisma migrate deploy` — REVIEW BEFORE APPLYING TO ANY DATABASE.
--
-- Ordering: create tables -> add nullable columns -> enum -> unique-index
-- swap -> backfill -> enforce NOT NULL + add FKs. No drops of existing columns.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. CreateTable: tenants
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE "tenants" (
    "id"        TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "active"    BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. CreateTable: practice_facilities (Practice <-> Facility many-to-many)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE "practice_facilities" (
    "id"         TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "active"     BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "practice_facilities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "practice_facilities_practiceId_facilityId_key" ON "practice_facilities"("practiceId", "facilityId");

ALTER TABLE "practice_facilities" ADD CONSTRAINT "practice_facilities_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "practice_facilities" ADD CONSTRAINT "practice_facilities_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "facilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. AlterTable: add nullable tenantId to the 5 direct-tenancy tables, and
--    nullable practiceId to visits. NOT NULL is enforced later, after backfill.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "facilities" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "practices"  ADD COLUMN "tenantId" TEXT;
ALTER TABLE "users"      ADD COLUMN "tenantId" TEXT;
ALTER TABLE "patients"   ADD COLUMN "tenantId" TEXT;
ALTER TABLE "visits"     ADD COLUMN "tenantId" TEXT;

ALTER TABLE "visits" ADD COLUMN "practiceId" TEXT; -- stays nullable permanently, not just during backfill

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. AlterEnum: Role gains SUPER_ADMIN
--
-- Postgres note: ALTER TYPE ... ADD VALUE cannot be used in the same
-- transaction as a statement that REFERENCES the new value (PG rule, applies
-- regardless of PG version). Nothing else in this migration file sets or
-- reads 'SUPER_ADMIN', so that restriction does not bite here. If your
-- migration runner errors on this line specifically (some tooling still
-- refuses to run ADD VALUE inside any transaction at all), run this single
-- statement standalone before the rest of the file.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TYPE "Role" ADD VALUE 'SUPER_ADMIN';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Login identifier swap: username loses its uniqueness, email gains it.
--
-- FLAG: "users_username_key" is the index name Prisma's default naming
-- convention produces for a single-field `@unique` on users.username
-- (<table>_<column>_key — matches the composite-unique naming already visible
-- elsewhere in this repo's migrations, e.g. provider_practices_userId_
-- practiceId_key). This could NOT be verified against the real database in
-- this session (no DB access) — CONFIRM this is the actual index name on the
-- target database before applying (e.g. via `\d users` in psql, or
-- `SELECT indexname FROM pg_indexes WHERE tablename = 'users'`). If it
-- differs, this DROP INDEX statement will fail loudly (safe failure mode —
-- it will not silently do the wrong thing).
-- ─────────────────────────────────────────────────────────────────────────────

DROP INDEX "users_username_key";

-- Safe to create now even though some emails are still NULL below — Postgres
-- unique indexes permit multiple NULLs (NULL is never considered equal to
-- NULL). The email backfill in step 6 must produce values that are unique
-- per row so this index still holds once every row is populated.
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. BACKFILL — the data-writing part of this migration.
-- ─────────────────────────────────────────────────────────────────────────────

-- 6a. One tenant row for all pre-existing data ("the user's company").
-- Deterministic literal id so every backfill statement below can reference it
-- without a subquery.
INSERT INTO "tenants" ("id", "name", "active", "createdAt", "updatedAt")
VALUES ('00000000-0000-0000-0000-000000000001', 'Tenant #1', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- 6b. Backfill tenantId on every existing row of the 5 direct-tenancy tables.
UPDATE "facilities" SET "tenantId" = '00000000-0000-0000-0000-000000000001' WHERE "tenantId" IS NULL;
UPDATE "practices"  SET "tenantId" = '00000000-0000-0000-0000-000000000001' WHERE "tenantId" IS NULL;
UPDATE "users"      SET "tenantId" = '00000000-0000-0000-0000-000000000001' WHERE "tenantId" IS NULL;
UPDATE "patients"   SET "tenantId" = '00000000-0000-0000-0000-000000000001' WHERE "tenantId" IS NULL;
UPDATE "visits"     SET "tenantId" = '00000000-0000-0000-0000-000000000001' WHERE "tenantId" IS NULL;

-- 6c. One practice_facilities row per facility that already has a practiceId
-- set today (the single-FK relationship, carried forward into the new join
-- as an active link). Facilities with a NULL practiceId get no join row —
-- they remain unassigned-to-any-practice under the new model too, exactly
-- matching their current state.
--
-- Id generation note: this project's Prisma schema uses @default(uuid()),
-- which is generated CLIENT-SIDE by the Prisma Client library, never as a
-- database DEFAULT — confirmed by the prior hand-authored migration
-- (20260810000000_add_practice_provider_schema), whose CREATE TABLE
-- statements declare "id" TEXT NOT NULL with no DB-level default at all. This
-- raw SQL backfill therefore cannot rely on any id column default and must
-- generate one per row itself. The expression below needs no Postgres
-- extension (no pgcrypto, no version assumption) and works on any Postgres
-- version; if the target database has native gen_random_uuid() available
-- (built into core as of PG13), that is a simpler equivalent.
INSERT INTO "practice_facilities" ("id", "practiceId", "facilityId", "active")
SELECT
  md5(random()::text || clock_timestamp()::text || f."id")::uuid,
  f."practiceId",
  f."id",
  true
FROM "facilities" f
WHERE f."practiceId" IS NOT NULL;

-- 6d. Visit.practiceId, derived transitively via patient -> facility -> the
-- facility's current (single-FK) practice, exactly the same resolution path
-- the Phase 4 visit-creation POST route already uses at request time. Visits
-- whose patient's facility has no practiceId are left NULL (unresolvable) —
-- this is expected and permanent; the column stays nullable for exactly this
-- reason (see step 3's comment).
UPDATE "visits" v
SET "practiceId" = f."practiceId"
FROM "patients" p
JOIN "facilities" f ON f."id" = p."facilityId"
WHERE v."patientId" = p."id"
  AND f."practiceId" IS NOT NULL;

-- 6e. Email backfill. User.email is becoming the required, unique login
-- field (schema change, see report), but the current schema has it as
-- optional and the seed script (prisma/seed.ts) never sets it — every demo
-- user (admin/provider/office) has email = NULL today. A NOT NULL constraint
-- below would fail immediately without this step.
--
-- IMPORTANT — these are PLACEHOLDER values, not real email addresses. They
-- use the "id" column (already guaranteed unique, being the primary key) so
-- the value is unique per row and the users_email_key index created in step
-- 5 does not reject the backfill. `.invalid` is the IANA-reserved TLD for
-- addresses that are guaranteed not to resolve, specifically to make these
-- impossible to mistake for real, deliverable addresses. Every affected user
-- MUST have their real email collected and set before login-by-email is
-- usable for them — this backfill only prevents the migration itself from
-- failing, it does not make placeholder-email accounts functional for login.
UPDATE "users"
SET "email" = LOWER("username") || '+' || "id" || '@placeholder.invalid'
WHERE "email" IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Enforce NOT NULL now that backfill has populated every row, and add the
--    tenantId foreign keys. Visit.practiceId is deliberately NOT set NOT NULL
--    (see step 3/6d) — it stays permanently nullable.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "facilities" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "practices"  ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "users"      ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "patients"   ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "visits"     ALTER COLUMN "tenantId" SET NOT NULL;

ALTER TABLE "users" ALTER COLUMN "email" SET NOT NULL;

-- No ON DELETE clause specified (Postgres default NO ACTION) for the five
-- tenantId foreign keys, matching Prisma's own default when `onDelete` is
-- omitted from a `@relation` — deleting a Tenant while any dependent row
-- still references it is blocked rather than silently cascading away an
-- entire company's data.
ALTER TABLE "facilities" ADD CONSTRAINT "facilities_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON UPDATE CASCADE;
ALTER TABLE "practices"  ADD CONSTRAINT "practices_tenantId_fkey"  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON UPDATE CASCADE;
ALTER TABLE "users"      ADD CONSTRAINT "users_tenantId_fkey"      FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON UPDATE CASCADE;
ALTER TABLE "patients"   ADD CONSTRAINT "patients_tenantId_fkey"   FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON UPDATE CASCADE;
ALTER TABLE "visits"     ADD CONSTRAINT "visits_tenantId_fkey"     FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON UPDATE CASCADE;

-- Visit.practiceId FK — nullable, ON DELETE SET NULL to match the existing
-- convention for the other nullable practice FK in this schema
-- (facilities_practiceId_fkey, added in 20260810000000, uses the same
-- ON DELETE SET NULL for the same reason: a nullable optional link should
-- gracefully null out rather than block deletion of the referenced practice).
ALTER TABLE "visits" ADD CONSTRAINT "visits_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "practices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Facility.practiceId is NOT dropped in this migration. It coexists with
--    practice_facilities (populated in step 6c) until a LATER migration
--    drops it, once the many-to-many join has been proven in the app layer.
-- ─────────────────────────────────────────────────────────────────────────────
