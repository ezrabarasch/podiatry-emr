-- Integration Hub: external EMR sync sources + per-resource schedules.
-- Hand-authored (local Postgres down). Applied via `prisma migrate deploy`.

-- CreateTable
CREATE TABLE "integration_sources" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'disconnected',
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_sync_configs" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "resourceName" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "frequency" TEXT NOT NULL DEFAULT 'DAILY_1AM',
    "cronExpression" TEXT NOT NULL,
    "lastSyncAt" TIMESTAMP(3),
    "lastCount" INTEGER,
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_sync_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "integration_sources_name_key" ON "integration_sources"("name");

-- CreateIndex
CREATE UNIQUE INDEX "integration_sync_configs_sourceId_resourceName_key" ON "integration_sync_configs"("sourceId", "resourceName");

-- AddForeignKey
ALTER TABLE "integration_sync_configs" ADD CONSTRAINT "integration_sync_configs_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "integration_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
