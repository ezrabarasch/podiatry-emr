-- Optional human-readable description per fee schedule entry (editor UI). Purely additive.
ALTER TABLE "fee_schedule_items" ADD COLUMN "description" TEXT;
