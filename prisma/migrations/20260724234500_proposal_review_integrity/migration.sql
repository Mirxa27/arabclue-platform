-- Bind every approval decision to one immutable rendered proposal state.
--
-- Existing review rows remain nullable legacy data and are deliberately
-- rejected by application code. They must be cancelled and resubmitted before
-- another decision. The NOT VALID check enforces complete bindings for every
-- new or subsequently updated review without silently trusting legacy rows.

ALTER TABLE "ProposalReview"
  ADD COLUMN "submissionHash" TEXT,
  ADD COLUMN "submittedProposalVersion" INTEGER,
  ADD COLUMN "submittedSnapshotHash" TEXT,
  ADD COLUMN "submittedSnapshotRevision" INTEGER;

CREATE INDEX "ProposalReview_proposalId_submissionHash_idx"
  ON "ProposalReview"("proposalId", "submissionHash");

ALTER TABLE "ProposalReview"
  ADD CONSTRAINT "ProposalReview_submission_binding_check"
  CHECK (
    "submissionHash" IS NOT NULL
    AND length(btrim("submissionHash")) > 0
    AND "submittedProposalVersion" IS NOT NULL
    AND "submittedProposalVersion" > 0
    AND "submittedSnapshotRevision" IS NOT NULL
    AND (
      (
        "submittedSnapshotRevision" = 0
        AND "submittedSnapshotHash" IS NULL
      ) OR (
        "submittedSnapshotRevision" > 0
        AND "submittedSnapshotHash" IS NOT NULL
        AND length(btrim("submittedSnapshotHash")) > 0
      )
    )
  ) NOT VALID;
