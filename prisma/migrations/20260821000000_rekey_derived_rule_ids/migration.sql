-- Re-key derived-rule ids to the deterministic `derived-<conditionName>` form.
-- The wave1 migration (20260804000000) inserted ulceration_present and
-- cuts_fissures_present with gen_random_uuid() ids, but seed.ts upserts on
-- `derived-<conditionName>`. Without this, running seed.ts against a migrated DB
-- would INSERT duplicates (inflating apItemCount, which counts distinct rows).
-- Idempotent: the WHERE guard only touches rows whose id is still non-deterministic,
-- and does nothing on re-run or on already-correct rows. Safe on staging and prod.
-- No FK references careflow_derived_rules.id and the app never reads it at runtime
-- (fires by triggerCodes, labels by conditionName), so re-keying is invisible to the app.
UPDATE careflow_derived_rules
SET id = 'derived-' || "conditionName",
    "updatedAt" = CURRENT_TIMESTAMP
WHERE id <> 'derived-' || "conditionName";
