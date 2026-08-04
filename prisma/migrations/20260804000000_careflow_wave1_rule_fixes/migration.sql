-- Wave 1: careflow rule/code fixes (clinical form feedback batch 1)
-- Items #7,#8,#10,#13,#14,#15 + G8404 code. #16,#17 handled separately.
-- Applied & verified on staging 2026-08-03/04 before this migration was tracked.

-- #7: Remove diabetic_education rule (service not provided)
DELETE FROM careflow_rules
WHERE section = 'treatment' AND "fieldKey" = 'diabetic_education';

-- #8: G8404 (LE neuro exam) when monofilament or neuro exam fails
UPDATE careflow_rules SET "cptCodes" = '["G8404"]'::jsonb, "updatedAt" = CURRENT_TIMESTAMP
WHERE section = 'neuro_exam' AND "fieldKey" = 'monofilament' AND "fieldValue" = 'fail';
UPDATE careflow_rules SET "cptCodes" = '["G8404"]'::jsonb, "updatedAt" = CURRENT_TIMESTAMP
WHERE section = 'neuro_exam' AND "fieldKey" = 'neuro_result' AND "fieldValue" = 'failed';

-- #10: Fix 1st-digit ulcer codes (were heel codes) -> "other part of foot"
UPDATE careflow_rules SET "icd10Codes" = '["L97.519"]'::jsonb, "updatedAt" = CURRENT_TIMESTAMP
WHERE section = 'derm_exam' AND "fieldKey" = 'ulceration_right' AND "fieldValue" = '1st';
UPDATE careflow_rules SET "icd10Codes" = '["L97.529"]'::jsonb, "updatedAt" = CURRENT_TIMESTAMP
WHERE section = 'derm_exam' AND "fieldKey" = 'ulceration_left' AND "fieldValue" = '1st';

-- #15: Strip inline referral from ulceration finding fragments
UPDATE careflow_rules
SET "noteFragment" = regexp_replace("noteFragment", '\s*Refer to wound care provider for ulceration\.', ''),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "fieldKey" IN ('ulceration_right', 'ulceration_left');

-- #15: Add missing left bandage_present row; code the right one
INSERT INTO careflow_rules
  (id, "careflowType", section, "fieldKey", "fieldValue", "noteFragment", "icd10Codes", priority, "updatedAt")
VALUES
  (gen_random_uuid()::text, 'at_risk_podiatry', 'derm_exam', 'ulceration_left', 'bandage_present',
   'Bandage present over left ulceration site.', '["L97.529"]'::jsonb, 0, CURRENT_TIMESTAMP)
ON CONFLICT ("careflowType", section, "fieldKey", "fieldValue") DO NOTHING;

UPDATE careflow_rules
SET "icd10Codes" = '["L97.519"]'::jsonb, "updatedAt" = CURRENT_TIMESTAMP
WHERE section = 'derm_exam' AND "fieldKey" = 'ulceration_right' AND "fieldValue" = 'bandage_present';

-- #14: Strip plan sentence from cuts/fissures finding fragments
UPDATE careflow_rules
SET "noteFragment" = regexp_replace("noteFragment", '\s*Apply skin emollient under occlusion daily PRN\.', ''),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "fieldKey" = 'cuts_fissures';

-- #15: Ulceration referral -> A&P derived rule (fires on any L97 code)
INSERT INTO careflow_derived_rules
  (id, "careflowType", "conditionName", "triggerCodes", "noteFragment", "outputSection", priority, "updatedAt")
VALUES
  (gen_random_uuid()::text, 'at_risk_podiatry', 'ulceration_present',
   '["L97.411", "L97.412", "L97.519", "L97.529"]'::jsonb,
   'Referral to Wound Care Team for Ulceration.', 'Assessment & Plan', 118, CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;

-- #14: Cuts/fissures plan -> A&P derived rule (fires on L98.8, unique to cuts/fissures)
INSERT INTO careflow_derived_rules
  (id, "careflowType", "conditionName", "triggerCodes", "noteFragment", "outputSection", priority, "updatedAt")
VALUES
  (gen_random_uuid()::text, 'at_risk_podiatry', 'cuts_fissures_present',
   '["L98.8"]'::jsonb,
   'Apply skin emollient under occlusion daily PRN.', 'Assessment & Plan', 119, CURRENT_TIMESTAMP)
ON CONFLICT DO NOTHING;

-- #13: Edema A&P wording
UPDATE careflow_derived_rules
SET "noteFragment" = 'Compression stockings ordered due to edema present.',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "conditionName" = 'edema_present';

-- #10/#8: Reference codes for new codes emitted above
INSERT INTO codes (id, system, code, description) VALUES
  (gen_random_uuid()::text, 'icd10', 'L97.519', 'Non-pressure chronic ulcer of other part of right foot, unspecified severity'),
  (gen_random_uuid()::text, 'icd10', 'L97.529', 'Non-pressure chronic ulcer of other part of left foot, unspecified severity'),
  (gen_random_uuid()::text, 'cpt', 'G8404', 'Lower extremity neurological exam performed and documented')
ON CONFLICT (system, code) DO NOTHING;
