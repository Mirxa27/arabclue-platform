-- Phase 3 catalog-draft persistence.
--
-- Existing contract rows remain legacy generationSchemaVersion=0 records.
-- Catalog-backed version-1 rows are immutable unreviewed drafts: they can
-- never become published, approved, executable, or PDF-path-bearing through
-- this persistence path.

ALTER TABLE "ContractTemplate"
  ADD COLUMN "catalogKey" TEXT;

CREATE UNIQUE INDEX "ContractTemplate_workspaceId_catalogKey_key"
  ON "ContractTemplate"("workspaceId", "catalogKey");

ALTER TABLE "ContractTemplate"
  ADD CONSTRAINT "ContractTemplate_catalog_draft_state_check"
  CHECK (
    "catalogKey" IS NULL
    OR (
      "catalogKey" = "type"
      AND "lifecycle" = 'DRAFT'
      AND "legalReviewStatus" = 'UNREVIEWED'
      AND "counselReviewRequired" = true
      AND "sourceStatus" = 'PENDING_OFFICIAL_SOURCE_REVIEW'
      AND "canonicalHash" ~ '^sha256:[a-f0-9]{64}$'
      AND "provenanceJson" IS NOT NULL
      AND "status" = 'draft'
      AND "isSystem" = true
      AND "isApproved" = false
      AND "approvedBy" IS NULL
      AND "approvedAt" IS NULL
    )
  ) NOT VALID;

ALTER TABLE "GeneratedContract"
  ADD COLUMN "clientRequestId" TEXT,
  ADD COLUMN "generationSchemaVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "generationMode" TEXT,
  ADD COLUMN "diagnosticCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "storageBytes" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "GeneratedContract_workspaceId_clientRequestId_key"
  ON "GeneratedContract"("workspaceId", "clientRequestId");

CREATE INDEX "GeneratedContract_workspaceId_generationSchemaVersion_status_createdAt_id_idx"
  ON "GeneratedContract"(
    "workspaceId",
    "generationSchemaVersion",
    "status",
    "createdAt",
    "id"
  );

ALTER TABLE "GeneratedContract"
  ADD CONSTRAINT "GeneratedContract_catalog_draft_integrity_check"
  CHECK (
    "generationSchemaVersion" IN (0, 1)
    AND (
      "generationSchemaVersion" = 0
      OR (
        "clientRequestId" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        AND "templateVersionId" IS NOT NULL
        AND "canonicalHash" ~ '^sha256:[a-f0-9]{64}$'
        AND "documentSpecJson" IS NOT NULL
        AND "generationMode" IN ('PREVIEW', 'FINAL')
        AND "diagnosticCount" >= 0
        AND "storageBytes" BETWEEN 1 AND 4194304
        AND "legalReviewStatus" = 'UNREVIEWED'
        AND "counselReviewRequired" = true
        AND "isExecutable" = false
        AND "contentPdfPath" IS NULL
        AND "status" = 'draft'
      )
    )
  ) NOT VALID;
