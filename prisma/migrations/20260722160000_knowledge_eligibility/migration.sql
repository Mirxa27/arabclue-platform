-- Knowledge approval / revocation metadata for RAG eligibility
ALTER TABLE "Certificate" ADD COLUMN IF NOT EXISTS "approved" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Certificate" ADD COLUMN IF NOT EXISTS "revokedAt" TIMESTAMP(3);
ALTER TABLE "Certificate" ADD COLUMN IF NOT EXISTS "contentHash" TEXT;

ALTER TABLE "PastProject" ADD COLUMN IF NOT EXISTS "approved" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "PastProject" ADD COLUMN IF NOT EXISTS "revokedAt" TIMESTAMP(3);
