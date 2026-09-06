-- BP vitals coding rule + Vitals display section (SPEC confirmed 2026-08-25).
-- Data-only. Corrects the existing manual blood_pressure rules' ICD codes to
-- match the locked 4-case table, adds R03.0 as a reference code, adds a new
-- "Vitals:" static section header (above physical_exam@39), and adds the A/P
-- follow-up derived rule for the elevated cases.

-- Case 4 (Elevated, No HTN) must emit R03.0 (elevated BP reading, no HTN dx on
-- file) — the existing row had no ICD code at all.
UPDATE careflow_rules
SET "icd10Codes" = '["R03.0"]'::jsonb, "updatedAt" = CURRENT_TIMESTAMP
WHERE section = 'vitals' AND "fieldKey" = 'blood_pressure' AND "fieldValue" = 'elevated_no_htn';

-- Case 2 (Normal, w/HTN) must emit NO ICD code per the locked case table —
-- the existing row incorrectly re-coded I10 on every normal reading just
-- because the patient has HTN on file. Case 3 (elevated_with_htn) keeps I10;
-- only this row changes.
UPDATE careflow_rules
SET "icd10Codes" = NULL, "updatedAt" = CURRENT_TIMESTAMP
WHERE section = 'vitals' AND "fieldKey" = 'blood_pressure' AND "fieldValue" = 'normal_with_htn';

-- R03.0 reference description (I10 already exists).
INSERT INTO codes (id, system, code, description) VALUES
  (gen_random_uuid()::text, 'icd10', 'R03.0', 'Elevated blood pressure reading, without diagnosis of hypertension')
ON CONFLICT (system, code) DO NOTHING;

-- New "Vitals:" section header, priority 29 — above physical_exam (39) and
-- right before the existing blood_pressure rule fragments (30). Deterministic
-- id (not gen_random_uuid()) matches this table's existing
-- `static-<section>-<position>` convention seed.ts's upsert keys on — the
-- wave1 migration used random uuids for a different table and that caused a
-- real seed-vs-migration id mismatch bug fixed earlier; not repeating it here.
INSERT INTO careflow_static_fragments (id, "careflowType", section, position, "fragmentText", active, "createdAt", "updatedAt")
VALUES ('static-vitals-29', 'at_risk_podiatry', 'vitals', 29, 'Vitals:', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (id) DO NOTHING;

-- A/P follow-up line for the two elevated cases (3 & 4). Fires whenever I10 or
-- R03.0 is in the visit's icd10Set — today that's only ever the blood_pressure
-- rule (confirmed: no other rule adds either code), so this can't over-fire.
-- Deterministic id matches this table's existing `derived-<conditionName>` convention.
INSERT INTO careflow_derived_rules
  (id, "careflowType", "conditionName", "triggerCodes", "noteFragment", "outputSection", priority, active, "createdAt", "updatedAt")
VALUES
  ('derived-bp_followup_present', 'at_risk_podiatry', 'bp_followup_present',
   '["I10", "R03.0"]'::jsonb, 'Follow up with PCP recommended for elevated blood pressure.',
   'Assessment & Plan', 121, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (id) DO NOTHING;
