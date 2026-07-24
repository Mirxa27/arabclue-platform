-- Fail-closed review metadata for knowledge used by RAG and generated output.
--
-- Existing rows are deliberately not blanket-approved or revoked. They receive
-- UNREVIEWED metadata and become ineligible in application queries until an
-- authorized reviewer records evidence and provenance. Apply this migration
-- only after reviewing the production knowledge inventory and rollback plan.

CREATE TYPE "KnowledgeReviewStatus" AS ENUM (
  'UNREVIEWED',
  'APPROVED',
  'REVOKED'
);

ALTER TABLE "PastProject"
  ALTER COLUMN "approved" SET DEFAULT false,
  ADD COLUMN "reviewStatus" "KnowledgeReviewStatus" NOT NULL DEFAULT 'UNREVIEWED',
  ADD COLUMN "evidenceRef" TEXT,
  ADD COLUMN "provenanceJson" TEXT,
  ADD COLUMN "reviewedById" TEXT,
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "contentHash" TEXT,
  ADD COLUMN "revokedById" TEXT,
  ADD COLUMN "revocationReason" TEXT;

ALTER TABLE "Certificate"
  ALTER COLUMN "approved" SET DEFAULT false,
  ADD COLUMN "reviewStatus" "KnowledgeReviewStatus" NOT NULL DEFAULT 'UNREVIEWED',
  ADD COLUMN "evidenceRef" TEXT,
  ADD COLUMN "provenanceJson" TEXT,
  ADD COLUMN "reviewedById" TEXT,
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "revokedById" TEXT,
  ADD COLUMN "revocationReason" TEXT;

ALTER TABLE "MethodologyAsset"
  ALTER COLUMN "approved" SET DEFAULT false,
  ADD COLUMN "reviewStatus" "KnowledgeReviewStatus" NOT NULL DEFAULT 'UNREVIEWED',
  ADD COLUMN "evidenceRef" TEXT,
  ADD COLUMN "provenanceJson" TEXT,
  ADD COLUMN "reviewedById" TEXT,
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "revokedAt" TIMESTAMP(3),
  ADD COLUMN "revokedById" TEXT,
  ADD COLUMN "revocationReason" TEXT,
  ADD COLUMN "contentHash" TEXT;

ALTER TABLE "ContentLibraryItem"
  ALTER COLUMN "approved" SET DEFAULT false,
  ADD COLUMN "reviewStatus" "KnowledgeReviewStatus" NOT NULL DEFAULT 'UNREVIEWED',
  ADD COLUMN "evidenceRef" TEXT,
  ADD COLUMN "provenanceJson" TEXT,
  ADD COLUMN "reviewedById" TEXT,
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "revokedAt" TIMESTAMP(3),
  ADD COLUMN "revokedById" TEXT,
  ADD COLUMN "revocationReason" TEXT,
  ADD COLUMN "contentHash" TEXT;

ALTER TABLE "PastProject"
  ADD CONSTRAINT "PastProject_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Certificate"
  ADD CONSTRAINT "Certificate_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MethodologyAsset"
  ADD CONSTRAINT "MethodologyAsset_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContentLibraryItem"
  ADD CONSTRAINT "ContentLibraryItem_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PastProject"
  ADD CONSTRAINT "PastProject_revokedById_fkey"
  FOREIGN KEY ("revokedById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Certificate"
  ADD CONSTRAINT "Certificate_revokedById_fkey"
  FOREIGN KEY ("revokedById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MethodologyAsset"
  ADD CONSTRAINT "MethodologyAsset_revokedById_fkey"
  FOREIGN KEY ("revokedById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContentLibraryItem"
  ADD CONSTRAINT "ContentLibraryItem_revokedById_fkey"
  FOREIGN KEY ("revokedById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "PastProject_workspaceId_reviewStatus_approved_idx"
  ON "PastProject"("workspaceId", "reviewStatus", "approved");
CREATE INDEX "Certificate_workspaceId_reviewStatus_approved_idx"
  ON "Certificate"("workspaceId", "reviewStatus", "approved");
CREATE INDEX "MethodologyAsset_workspaceId_reviewStatus_approved_idx"
  ON "MethodologyAsset"("workspaceId", "reviewStatus", "approved");
CREATE INDEX "ContentLibraryItem_workspaceId_reviewStatus_approved_idx"
  ON "ContentLibraryItem"("workspaceId", "reviewStatus", "approved");

-- NOT VALID preserves legacy rows for explicit owner review while enforcing
-- the rule on every new or subsequently updated row.
ALTER TABLE "PastProject" ADD CONSTRAINT "PastProject_approval_evidence_check"
  CHECK (
    (
      "approved" = false
      AND "reviewStatus" = 'UNREVIEWED'
      AND "evidenceRef" IS NULL
      AND "provenanceJson" IS NULL
      AND "reviewedById" IS NULL
      AND "approvedAt" IS NULL
      AND "revokedAt" IS NULL
      AND "revokedById" IS NULL
      AND "revocationReason" IS NULL
      AND "contentHash" IS NOT NULL
    ) OR (
      "approved" = true
      AND
      "reviewStatus" = 'APPROVED'
      AND "evidenceRef" IS NOT NULL
      AND length(btrim("evidenceRef")) > 0
      AND "provenanceJson" IS NOT NULL
      AND "reviewedById" IS NOT NULL
      AND "approvedAt" IS NOT NULL
      AND "revokedAt" IS NULL
      AND "revokedById" IS NULL
      AND "revocationReason" IS NULL
      AND "contentHash" IS NOT NULL
    ) OR (
      "approved" = false
      AND "reviewStatus" = 'REVOKED'
      AND "evidenceRef" IS NOT NULL
      AND "provenanceJson" IS NOT NULL
      AND "reviewedById" IS NOT NULL
      AND "approvedAt" IS NOT NULL
      AND "revokedAt" IS NOT NULL
      AND "revokedById" IS NOT NULL
      AND "revocationReason" IS NOT NULL
      AND length(btrim("revocationReason")) > 0
      AND "contentHash" IS NOT NULL
    )
  ) NOT VALID;
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_approval_evidence_check"
  CHECK (
    (
      "approved" = false
      AND "reviewStatus" = 'UNREVIEWED'
      AND "evidenceRef" IS NULL
      AND "provenanceJson" IS NULL
      AND "reviewedById" IS NULL
      AND "approvedAt" IS NULL
      AND "revokedAt" IS NULL
      AND "revokedById" IS NULL
      AND "revocationReason" IS NULL
      AND "contentHash" IS NOT NULL
    ) OR (
      "approved" = true
      AND
      "reviewStatus" = 'APPROVED'
      AND "evidenceRef" IS NOT NULL
      AND length(btrim("evidenceRef")) > 0
      AND "provenanceJson" IS NOT NULL
      AND "reviewedById" IS NOT NULL
      AND "approvedAt" IS NOT NULL
      AND "revokedAt" IS NULL
      AND "revokedById" IS NULL
      AND "revocationReason" IS NULL
      AND "contentHash" IS NOT NULL
    ) OR (
      "approved" = false
      AND "reviewStatus" = 'REVOKED'
      AND "evidenceRef" IS NOT NULL
      AND "provenanceJson" IS NOT NULL
      AND "reviewedById" IS NOT NULL
      AND "approvedAt" IS NOT NULL
      AND "revokedAt" IS NOT NULL
      AND "revokedById" IS NOT NULL
      AND "revocationReason" IS NOT NULL
      AND length(btrim("revocationReason")) > 0
      AND "contentHash" IS NOT NULL
    )
  ) NOT VALID;
ALTER TABLE "MethodologyAsset" ADD CONSTRAINT "MethodologyAsset_approval_evidence_check"
  CHECK (
    (
      "approved" = false
      AND "reviewStatus" = 'UNREVIEWED'
      AND "evidenceRef" IS NULL
      AND "provenanceJson" IS NULL
      AND "reviewedById" IS NULL
      AND "approvedAt" IS NULL
      AND "revokedAt" IS NULL
      AND "revokedById" IS NULL
      AND "revocationReason" IS NULL
      AND "contentHash" IS NOT NULL
    ) OR (
      "approved" = true
      AND
      "reviewStatus" = 'APPROVED'
      AND "evidenceRef" IS NOT NULL
      AND length(btrim("evidenceRef")) > 0
      AND "provenanceJson" IS NOT NULL
      AND "reviewedById" IS NOT NULL
      AND "approvedAt" IS NOT NULL
      AND "revokedAt" IS NULL
      AND "revokedById" IS NULL
      AND "revocationReason" IS NULL
      AND "contentHash" IS NOT NULL
    ) OR (
      "approved" = false
      AND "reviewStatus" = 'REVOKED'
      AND "evidenceRef" IS NOT NULL
      AND "provenanceJson" IS NOT NULL
      AND "reviewedById" IS NOT NULL
      AND "approvedAt" IS NOT NULL
      AND "revokedAt" IS NOT NULL
      AND "revokedById" IS NOT NULL
      AND "revocationReason" IS NOT NULL
      AND length(btrim("revocationReason")) > 0
      AND "contentHash" IS NOT NULL
    )
  ) NOT VALID;
ALTER TABLE "ContentLibraryItem" ADD CONSTRAINT "ContentLibraryItem_approval_evidence_check"
  CHECK (
    (
      "approved" = false
      AND "reviewStatus" = 'UNREVIEWED'
      AND "evidenceRef" IS NULL
      AND "provenanceJson" IS NULL
      AND "reviewedById" IS NULL
      AND "approvedAt" IS NULL
      AND "revokedAt" IS NULL
      AND "revokedById" IS NULL
      AND "revocationReason" IS NULL
      AND "contentHash" IS NOT NULL
    ) OR (
      "approved" = true
      AND
      "reviewStatus" = 'APPROVED'
      AND "evidenceRef" IS NOT NULL
      AND length(btrim("evidenceRef")) > 0
      AND "provenanceJson" IS NOT NULL
      AND "reviewedById" IS NOT NULL
      AND "approvedAt" IS NOT NULL
      AND "revokedAt" IS NULL
      AND "revokedById" IS NULL
      AND "revocationReason" IS NULL
      AND "contentHash" IS NOT NULL
    ) OR (
      "approved" = false
      AND "reviewStatus" = 'REVOKED'
      AND "evidenceRef" IS NOT NULL
      AND "provenanceJson" IS NOT NULL
      AND "reviewedById" IS NOT NULL
      AND "approvedAt" IS NOT NULL
      AND "revokedAt" IS NOT NULL
      AND "revokedById" IS NOT NULL
      AND "revocationReason" IS NOT NULL
      AND length(btrim("revocationReason")) > 0
      AND "contentHash" IS NOT NULL
    )
  ) NOT VALID;
