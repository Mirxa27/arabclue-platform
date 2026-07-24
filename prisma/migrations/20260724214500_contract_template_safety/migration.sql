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
