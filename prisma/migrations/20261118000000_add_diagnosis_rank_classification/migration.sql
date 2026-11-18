-- PCC /conditions rankDescription ("Primary", "Secondary", "Diagnosis #3", ...) and
-- classificationDescription (e.g. "Admission"). Both nullable: PCC leaves them blank for many rows.
ALTER TABLE "patient_diagnoses" ADD COLUMN "rank" TEXT,
  ADD COLUMN "classification" TEXT;
