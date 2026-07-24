-- Immutable v1 render state for reviewed contract artifacts.
--
-- Contract snapshot revision is monotonic. Content mutations clear the JSON
-- and hash but retain the revision so a later submission cannot reuse an old
-- approval binding.

ALTER TABLE "GeneratedProposal"
  ADD COLUMN "contractRenderSnapshot" JSONB,
  ADD COLUMN "contractRenderSnapshotHash" TEXT,
  ADD COLUMN "contractRenderSnapshotRevision" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "GeneratedProposal_workspaceId_contractRenderSnapshotHash_idx"
  ON "GeneratedProposal"("workspaceId", "contractRenderSnapshotHash");

ALTER TABLE "GeneratedProposal"
  ADD CONSTRAINT "GeneratedProposal_contract_render_snapshot_integrity_check"
  CHECK (
    "contractRenderSnapshotRevision" >= 0
    AND (
      (
        "contractRenderSnapshot" IS NULL
        AND "contractRenderSnapshotHash" IS NULL
      )
      OR (
        "contractRenderSnapshot" IS NOT NULL
        AND "contractRenderSnapshotHash" ~ '^sha256:[a-f0-9]{64}$'
        AND "contractRenderSnapshotRevision" > 0
      )
    )
  ) NOT VALID;
