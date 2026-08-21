-- E/M derived-rule text updates + new macerated-interspaces rule.
-- Data-only migration. NOT run/applied here — author only.

-- Update by "conditionName" (not id): the wave1-inserted rows (cuts_fissures_present,
-- ulceration_present) were created with gen_random_uuid() ids, not the
-- deterministic `derived-${conditionName}` id seed.ts's upsert expects — see
-- 20260804000000_careflow_wave1_rule_fixes. conditionName is the reliable match.
UPDATE careflow_derived_rules
SET "noteFragment" = 'Apply skin emollient and dry dressing to affected area daily.',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "conditionName" = 'xerosis_present';

UPDATE careflow_derived_rules
SET "noteFragment" = 'Apply skin emollient and dry dressing daily PRN.',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "conditionName" = 'cuts_fissures_present';

-- New rule: macerated interspaces (B35.3) -> same plan as cuts/fissures.
-- careflow_derived_rules has no unique constraint on "conditionName" (checked
-- prisma/schema.prisma — only `id` is @id/unique), so ON CONFLICT ("conditionName")
-- isn't valid SQL here. Using the deterministic id seed.ts's upsert already keys
-- on (`derived-${conditionName}`) as the conflict target instead — id IS the
-- primary key, so this both prevents a duplicate row on re-run AND keeps this
-- migration and seed.ts reconciled under the same key.
INSERT INTO careflow_derived_rules
  (id, "careflowType", "conditionName", "triggerCodes", "noteFragment", "outputSection", priority, active, "createdAt", "updatedAt")
VALUES
  ('derived-macerated_interspaces_present', 'at_risk_podiatry', 'macerated_interspaces_present',
   '["B35.3"]'::jsonb, 'Apply skin emollient and dry dressing daily PRN.', 'Assessment & Plan', 120,
   true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (id) DO NOTHING;
