-- Office/admin staff <-> practice membership: a new join table, deliberately
-- separate from provider_practices (providers grow provider-specific fields
-- in later phases). No data backfill — this is a brand-new, empty table with
-- no existing office/admin memberships to migrate.
-- Purely additive — no drops, no column type changes, no data changes.
-- Hand-authored (local Postgres unreachable in this session). Applied via
-- `prisma migrate deploy`.

-- CreateTable
CREATE TABLE "staff_practices" (
    "id"         TEXT NOT NULL,
    "userId"     TEXT NOT NULL,
    "practiceId" TEXT NOT NULL,

    CONSTRAINT "staff_practices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_practices_userId_practiceId_key" ON "staff_practices"("userId", "practiceId");

-- AddForeignKey
ALTER TABLE "staff_practices" ADD CONSTRAINT "staff_practices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_practices" ADD CONSTRAINT "staff_practices_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "practices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
