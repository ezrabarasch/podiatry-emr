ALTER TABLE patients ADD COLUMN IF NOT EXISTS gender text;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS "maritalStatus" text;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS "medicalRecordNumber" text;
