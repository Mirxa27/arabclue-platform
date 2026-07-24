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
  ADD COLUMN "contentHash" TEXT;

ALTER TABLE "Certificate"
  ALTER COLUMN "approved" SET DEFAULT false,
  ADD COLUMN "reviewStatus" "KnowledgeReviewStatus" NOT NULL DEFAULT 'UNREVIEWED',
  ADD COLUMN "evidenceRef" TEXT,
  ADD COLUMN "provenanceJson" TEXT,
  ADD COLUMN "reviewedById" TEXT,
  ADD COLUMN "approvedAt" TIMESTAMP(3);

ALTER TABLE "MethodologyAsset"
  ALTER COLUMN "approved" SET DEFAULT false,
  ADD COLUMN "reviewStatus" "KnowledgeReviewStatus" NOT NULL DEFAULT 'UNREVIEWED',
  ADD COLUMN "evidenceRef" TEXT,
  ADD COLUMN "provenanceJson" TEXT,
  ADD COLUMN "reviewedById" TEXT,
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "revokedAt" TIMESTAMP(3),
  ADD COLUMN "contentHash" TEXT;

ALTER TABLE "ContentLibraryItem"
  ALTER COLUMN "approved" SET DEFAULT false,
  ADD COLUMN "reviewStatus" "KnowledgeReviewStatus" NOT NULL DEFAULT 'UNREVIEWED',
  ADD COLUMN "evidenceRef" TEXT,
  ADD COLUMN "provenanceJson" TEXT,
  ADD COLUMN "reviewedById" TEXT,
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "revokedAt" TIMESTAMP(3),
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
    "approved" = false OR (
      "reviewStatus" = 'APPROVED'
      AND "evidenceRef" IS NOT NULL
      AND length(btrim("evidenceRef")) > 0
      AND "provenanceJson" IS NOT NULL
      AND "reviewedById" IS NOT NULL
      AND "approvedAt" IS NOT NULL
      AND "revokedAt" IS NULL
      AND "contentHash" IS NOT NULL
    )
  ) NOT VALID;
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_approval_evidence_check"
  CHECK (
    "approved" = false OR (
      "reviewStatus" = 'APPROVED'
      AND "evidenceRef" IS NOT NULL
      AND length(btrim("evidenceRef")) > 0
      AND "provenanceJson" IS NOT NULL
      AND "reviewedById" IS NOT NULL
      AND "approvedAt" IS NOT NULL
      AND "revokedAt" IS NULL
      AND "contentHash" IS NOT NULL
    )
  ) NOT VALID;
ALTER TABLE "MethodologyAsset" ADD CONSTRAINT "MethodologyAsset_approval_evidence_check"
  CHECK (
    "approved" = false OR (
      "reviewStatus" = 'APPROVED'
      AND "evidenceRef" IS NOT NULL
      AND length(btrim("evidenceRef")) > 0
      AND "provenanceJson" IS NOT NULL
      AND "reviewedById" IS NOT NULL
      AND "approvedAt" IS NOT NULL
      AND "revokedAt" IS NULL
      AND "contentHash" IS NOT NULL
    )
  ) NOT VALID;
ALTER TABLE "ContentLibraryItem" ADD CONSTRAINT "ContentLibraryItem_approval_evidence_check"
  CHECK (
    "approved" = false OR (
      "reviewStatus" = 'APPROVED'
      AND "evidenceRef" IS NOT NULL
      AND length(btrim("evidenceRef")) > 0
      AND "provenanceJson" IS NOT NULL
      AND "reviewedById" IS NOT NULL
      AND "approvedAt" IS NOT NULL
      AND "revokedAt" IS NULL
      AND "contentHash" IS NOT NULL
    )
  ) NOT VALID;
