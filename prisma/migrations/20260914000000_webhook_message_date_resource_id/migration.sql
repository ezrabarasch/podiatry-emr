-- Webhook pipeline expansion: capture messageDate and resourceId, which the
-- listener currently silently drops. Needed for event groups beyond ADT01 -
-- PCC's own docs confirm resourceId is used at least for MED02 (order ids).
--
-- Additive only - two new nullable columns, no existing data touched.
--
-- Hand-authored (local Postgres unreachable in this session), matching this
-- repo's established migration convention.

ALTER TABLE "webhook_events" ADD COLUMN "messageDate" TIMESTAMP(3);
ALTER TABLE "webhook_events" ADD COLUMN "resourceId" TEXT;
