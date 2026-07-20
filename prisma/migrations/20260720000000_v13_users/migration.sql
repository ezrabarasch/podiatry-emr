-- v1.3 — Replace Provider with User, add SessionLog, drop unused NextAuth tables.
-- NOTE: destructive. Existing providers/accounts/sessions/verification_tokens and
-- any visits referencing them are removed. Applied via `prisma migrate deploy`.

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('PROVIDER', 'OFFICE', 'ADMIN');

-- CreateEnum
CREATE TYPE "SessionAction" AS ENUM ('LOGIN', 'LOGOUT', 'FAILED', 'LOCKED');

-- DropForeignKey (visits previously referenced providers)
ALTER TABLE "visits" DROP CONSTRAINT "visits_providerId_fkey";

-- Clear visits that reference the soon-to-be-dropped providers table
DELETE FROM "visits";

-- DropTable (unused NextAuth tables — password now lives on users)
DROP TABLE "accounts";
DROP TABLE "sessions";
DROP TABLE "verification_tokens";
DROP TABLE "providers";

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "credentials" TEXT,
    "role" "Role" NOT NULL,
    "password" TEXT NOT NULL,
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "currentSessionToken" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "username" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "action" "SessionAction" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "session_logs_username_idx" ON "session_logs"("username");

-- CreateIndex
CREATE INDEX "session_logs_action_idx" ON "session_logs"("action");

-- AddForeignKey
ALTER TABLE "session_logs" ADD CONSTRAINT "session_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey (visits now reference users)
ALTER TABLE "visits" ADD CONSTRAINT "visits_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
