-- Relax Visit.visitType from required to nullable. A draft visit can now be
-- created without a visit type — the human chooses new_patient/established
-- via the Header careflow field on the visit form, and it becomes a hard
-- requirement only at sign time (enforced in app code, not the DB).
-- Purely a nullability relaxation — no data change, no drop.
-- Hand-authored (local Postgres unreachable in this session). Applied via `prisma migrate deploy`.

-- AlterTable
ALTER TABLE "visits" ALTER COLUMN "visitType" DROP NOT NULL;
