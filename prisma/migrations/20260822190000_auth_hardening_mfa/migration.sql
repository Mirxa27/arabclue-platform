-- Auth hardening (H27): stage MFA enrolment without disabling the live factor,
-- persist the last consumed TOTP step for replay rejection, and store hashed
-- single-use recovery codes.
--
-- Strictly additive: two nullable columns on User and one new table. Existing
-- plaintext `mfaSecret` values are sealed in-application on the next successful
-- MFA use (encrypt-in-place with a detectable ciphertext prefix) so this
-- migration does not rewrite live credential rows.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "pendingMfaSecret" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mfaLastUsedStep" BIGINT;

CREATE TABLE IF NOT EXISTS "MfaRecoveryCode" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "codeHash"  TEXT NOT NULL,
  "usedAt"    TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MfaRecoveryCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MfaRecoveryCode_codeHash_key"
  ON "MfaRecoveryCode"("codeHash");

CREATE INDEX IF NOT EXISTS "MfaRecoveryCode_userId_idx"
  ON "MfaRecoveryCode"("userId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'MfaRecoveryCode_userId_fkey'
  ) THEN
    ALTER TABLE "MfaRecoveryCode"
      ADD CONSTRAINT "MfaRecoveryCode_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
