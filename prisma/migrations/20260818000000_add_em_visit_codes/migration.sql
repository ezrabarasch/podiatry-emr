-- E/M leveling Foundation 1: seed the 7 nursing-facility E/M codes into the
-- shared codes reference table (initial 99304-99306, subsequent 99307-99310).
-- Data-only — no schema change. Seeded now so the leveling step (a later
-- foundation) has no data gap to fill in; 99310 is not yet targeted by any
-- rule but is seeded for completeness.
-- Hand-authored, same pattern as 20260804000000_careflow_wave1_rule_fixes.

INSERT INTO codes (id, system, code, description) VALUES
  (gen_random_uuid()::text, 'cpt', '99304', 'Initial nursing facility care, low complexity MDM'),
  (gen_random_uuid()::text, 'cpt', '99305', 'Initial nursing facility care, moderate complexity MDM'),
  (gen_random_uuid()::text, 'cpt', '99306', 'Initial nursing facility care, high complexity MDM'),
  (gen_random_uuid()::text, 'cpt', '99307', 'Subsequent nursing facility care, straightforward MDM'),
  (gen_random_uuid()::text, 'cpt', '99308', 'Subsequent nursing facility care, low complexity MDM'),
  (gen_random_uuid()::text, 'cpt', '99309', 'Subsequent nursing facility care, moderate complexity MDM'),
  (gen_random_uuid()::text, 'cpt', '99310', 'Subsequent nursing facility care, high complexity MDM')
ON CONFLICT (system, code) DO NOTHING;
