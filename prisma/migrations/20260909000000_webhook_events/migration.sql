-- Webhook slice 2: PCC ADT01 event log + async work queue.
--
-- Additive only - a new table, no existing data touched. Global (no
-- tenantId) - deferred until PCC integration itself is per-tenant; see
-- IntegrationSource/IntegrationSyncConfig, which are global for the same
-- reason today.
--
-- Hand-authored (local Postgres unreachable in this session), matching this
-- repo's established migration convention.

CREATE TABLE "webhook_events" (
    "id"          TEXT NOT NULL,
    "messageId"   TEXT NOT NULL,
    "eventType"   TEXT NOT NULL,
    "patientId"   TEXT NOT NULL,
    "facId"       TEXT NOT NULL,
    "orgUuid"     TEXT NOT NULL,
    "eventDate"   TIMESTAMP(3) NOT NULL,
    "receivedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "status"      TEXT NOT NULL DEFAULT 'received',
    "error"       TEXT,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "webhook_events_messageId_key" ON "webhook_events"("messageId");
