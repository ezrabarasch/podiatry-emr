-- A/P labeling Stage B: add the structured, labeled parallel form of the
-- progress note to the immutable signed-visit snapshot.
-- Purely additive — nullable column, no default, no backfill. Existing rows
-- get NULL automatically; nothing about noteText or any other column/row on
-- visit_notes is touched. NOT applied here — authored only.

ALTER TABLE "visit_notes" ADD COLUMN "noteStructured" JSONB;
