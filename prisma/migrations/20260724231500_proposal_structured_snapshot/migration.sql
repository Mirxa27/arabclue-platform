-- Phase 4 structured proposal snapshots.
--
-- This migration is intentionally pending. Apply only after deployment
-- environment review; application code fails closed until these columns exist.

ALTER TABLE "GeneratedProposal"
  ADD COLUMN "structuredSnapshot" JSONB,
  ADD COLUMN "structuredSnapshotHash" TEXT,
  ADD COLUMN "structuredSnapshotRevision" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "structuredSnapshotPreset" TEXT,
  ADD COLUMN "structuredSnapshotUpdatedAt" TIMESTAMP(3),
  ADD COLUMN "structuredSnapshotUpdatedById" TEXT;

ALTER TABLE "GeneratedProposal"
  ADD CONSTRAINT "GeneratedProposal_structuredSnapshotUpdatedById_fkey"
  FOREIGN KEY ("structuredSnapshotUpdatedById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "GeneratedProposal_workspaceId_structuredSnapshotHash_idx"
  ON "GeneratedProposal"("workspaceId", "structuredSnapshotHash");

ALTER TABLE "GeneratedProposal"
  ADD CONSTRAINT "GeneratedProposal_structured_snapshot_revision_check"
  CHECK ("structuredSnapshotRevision" >= 0),
  ADD CONSTRAINT "GeneratedProposal_structured_snapshot_hash_check"
  CHECK (
    "structuredSnapshotHash" IS NULL
    OR "structuredSnapshotHash" ~ '^sha256:[0-9a-f]{64}$'
  ),
  ADD CONSTRAINT "GeneratedProposal_structured_snapshot_preset_check"
  CHECK (
    "structuredSnapshotPreset" IS NULL
    OR "structuredSnapshotPreset" IN (
      'government-formal',
      'executive-impact',
      'technical-deep-dive',
      'compliance-evidence',
      'bilingual-parallel',
      'compact-addendum'
    )
  ),
  ADD CONSTRAINT "GeneratedProposal_structured_snapshot_metadata_check"
  CHECK (
    (
      "structuredSnapshot" IS NULL
      AND "structuredSnapshotHash" IS NULL
      AND "structuredSnapshotPreset" IS NULL
      AND "structuredSnapshotUpdatedAt" IS NULL
      AND "structuredSnapshotUpdatedById" IS NULL
    )
    OR
    (
      "structuredSnapshot" IS NOT NULL
      AND jsonb_typeof("structuredSnapshot") = 'object'
      AND "structuredSnapshotHash" IS NOT NULL
      AND "structuredSnapshotPreset" IS NOT NULL
      AND "structuredSnapshotUpdatedAt" IS NOT NULL
      AND "structuredSnapshotUpdatedById" IS NOT NULL
    )
  );
