-- Forward-only safety metadata for the Phase 3 contract drafting system.
--
-- The prior persistence shape could not distinguish an unreviewed draft from
-- reviewed legal content. These columns fail closed by default. This migration
-- intentionally seeds no clauses or templates and does not mark any record as
-- approved or executable.

ALTER TABLE "ContractTemplate"
  ADD COLUMN "schemaVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "canonicalHash" TEXT,
  ADD COLUMN "lifecycle" TEXT NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "legalReviewStatus" TEXT NOT NULL DEFAULT 'UNREVIEWED',
  ADD COLUMN "counselReviewRequired" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "sourceStatus" TEXT NOT NULL DEFAULT 'PENDING_OFFICIAL_SOURCE_REVIEW',
  ADD COLUMN "provenanceJson" TEXT;

ALTER TABLE "ContractTemplate"
  ALTER COLUMN "status" SET DEFAULT 'draft';

CREATE INDEX "ContractTemplate_workspaceId_lifecycle_legalReviewStatus_idx"
  ON "ContractTemplate"("workspaceId", "lifecycle", "legalReviewStatus");

ALTER TABLE "ContractTemplateVersion"
  ADD COLUMN "schemaVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "canonicalHash" TEXT,
  ADD COLUMN "lifecycle" TEXT NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "legalReviewStatus" TEXT NOT NULL DEFAULT 'UNREVIEWED',
  ADD COLUMN "counselReviewRequired" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "sourceStatus" TEXT NOT NULL DEFAULT 'PENDING_OFFICIAL_SOURCE_REVIEW',
  ADD COLUMN "provenanceJson" TEXT;

CREATE INDEX "ContractTemplateVersion_templateId_lifecycle_legalReviewStatus_idx"
  ON "ContractTemplateVersion"("templateId", "lifecycle", "legalReviewStatus");
CREATE UNIQUE INDEX "ContractTemplateVersion_templateId_version_key"
  ON "ContractTemplateVersion"("templateId", "version");
CREATE UNIQUE INDEX "ContractTemplateVersion_id_templateId_key"
  ON "ContractTemplateVersion"("id", "templateId");

ALTER TABLE "StandardClause"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "canonicalHash" TEXT,
  ADD COLUMN "lifecycle" TEXT NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "legalReviewStatus" TEXT NOT NULL DEFAULT 'UNREVIEWED',
  ADD COLUMN "counselReviewRequired" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "sourceStatus" TEXT NOT NULL DEFAULT 'PENDING_OFFICIAL_SOURCE_REVIEW',
  ADD COLUMN "provenanceJson" TEXT,
  ADD COLUMN "translationStatus" TEXT NOT NULL DEFAULT 'DRAFT';

ALTER TABLE "StandardClause"
  ALTER COLUMN "isActive" SET DEFAULT false;

CREATE INDEX "StandardClause_lifecycle_legalReviewStatus_idx"
  ON "StandardClause"("lifecycle", "legalReviewStatus");

ALTER TABLE "GeneratedContract"
  ADD COLUMN "documentSpecJson" TEXT,
  ADD COLUMN "templateVersionId" TEXT,
  ADD COLUMN "canonicalHash" TEXT,
  ADD COLUMN "legalReviewStatus" TEXT NOT NULL DEFAULT 'UNREVIEWED',
  ADD COLUMN "counselReviewRequired" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "isExecutable" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "GeneratedContract_workspaceId_legalReviewStatus_isExecutable_idx"
  ON "GeneratedContract"("workspaceId", "legalReviewStatus", "isExecutable");

ALTER TABLE "GeneratedContract"
  ADD CONSTRAINT "GeneratedContract_templateVersionId_templateId_fkey"
  FOREIGN KEY ("templateVersionId", "templateId")
  REFERENCES "ContractTemplateVersion"("id", "templateId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ContractTemplate" ADD CONSTRAINT "ContractTemplate_review_state_check"
  CHECK (
    "lifecycle" IN ('DRAFT', 'PUBLISHED', 'RETIRED')
    AND "legalReviewStatus" IN ('UNREVIEWED', 'IN_REVIEW', 'APPROVED', 'REJECTED')
    AND (
      "lifecycle" <> 'PUBLISHED'
      OR (
        "legalReviewStatus" = 'APPROVED'
        AND "canonicalHash" IS NOT NULL
        AND "provenanceJson" IS NOT NULL
        AND "approvedBy" IS NOT NULL
        AND "approvedAt" IS NOT NULL
      )
    )
  ) NOT VALID;

ALTER TABLE "ContractTemplateVersion" ADD CONSTRAINT "ContractTemplateVersion_review_state_check"
  CHECK (
    "lifecycle" IN ('DRAFT', 'PUBLISHED', 'RETIRED')
    AND "legalReviewStatus" IN ('UNREVIEWED', 'IN_REVIEW', 'APPROVED', 'REJECTED')
    AND (
      "lifecycle" <> 'PUBLISHED'
      OR (
        "legalReviewStatus" = 'APPROVED'
        AND "canonicalHash" IS NOT NULL
        AND "provenanceJson" IS NOT NULL
      )
    )
  ) NOT VALID;

ALTER TABLE "StandardClause" ADD CONSTRAINT "StandardClause_review_state_check"
  CHECK (
    "lifecycle" IN ('DRAFT', 'PUBLISHED', 'RETIRED')
    AND "legalReviewStatus" IN ('UNREVIEWED', 'IN_REVIEW', 'APPROVED', 'REJECTED')
    AND "translationStatus" IN ('DRAFT', 'REVIEWED', 'APPROVED', 'REJECTED')
    AND (
      "isActive" = false
      OR (
        "lifecycle" = 'PUBLISHED'
        AND "legalReviewStatus" = 'APPROVED'
        AND "translationStatus" = 'APPROVED'
        AND "canonicalHash" IS NOT NULL
        AND "provenanceJson" IS NOT NULL
      )
    )
  ) NOT VALID;

ALTER TABLE "GeneratedContract" ADD CONSTRAINT "GeneratedContract_execution_state_check"
  CHECK (
    "legalReviewStatus" IN ('UNREVIEWED', 'IN_REVIEW', 'APPROVED', 'REJECTED')
    AND (
      "isExecutable" = false
      OR (
        "legalReviewStatus" = 'APPROVED'
        AND "counselReviewRequired" = false
        AND "templateVersionId" IS NOT NULL
        AND "canonicalHash" IS NOT NULL
      )
    )
  ) NOT VALID;
