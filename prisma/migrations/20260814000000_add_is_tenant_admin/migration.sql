-- isTenantAdmin flag on users: distinguishes the tenant-level administrator
-- (company owner — sees all the tenant's practices, auto-added to new ones)
-- from a practice-scoped admin (admin capabilities but limited to assigned
-- practices). Purely additive column, default false, then two data backfills
-- so staging keeps working immediately after this deploys and the scoping
-- layer's Visit alignment (next brief) has something to key off.
-- Hand-authored (local Postgres unreachable in this session). Applied via
-- `prisma migrate deploy`.

-- AddColumn
ALTER TABLE "users" ADD COLUMN "isTenantAdmin" BOOLEAN NOT NULL DEFAULT false;

-- BACKFILL (staging-specific): the seeded admin user is this tenant's owner.
-- Verified via a read-only query against staging before writing this: exactly
-- one user has username='admin' (admin@qmed.test, role=ADMIN). On a fresh/prod
-- DB the tenant admin would be designated at provisioning time instead of by
-- a hardcoded username match — this statement is a one-time staging-data
-- backfill, not a general-purpose designation mechanism.
UPDATE "users" SET "isTenantAdmin" = true WHERE "username" = 'admin';

-- BACKFILL: null-practiceId visits get resolved to the tenant's practice, so
-- the Visit scoping filter's null-fallback (next brief) can eventually be
-- retired. Verified via a read-only query against staging before writing
-- this: exactly 2 visits have practiceId IS NULL, and exactly 1 practice
-- exists for this tenant ("DBP Podiatry"), so this resolves deterministically
-- with no ambiguity — a tenant with 2+ practices would need a different,
-- visit-by-visit resolution instead of this LIMIT 1 shortcut.
UPDATE "visits"
SET "practiceId" = (SELECT id FROM "practices" WHERE "tenantId" = '00000000-0000-0000-0000-000000000001' LIMIT 1)
WHERE "practiceId" IS NULL AND "tenantId" = '00000000-0000-0000-0000-000000000001';
