-- Tender Clarification Intelligence.
--
-- Every Etimad tender has an inquiries window. The platform now interrogates
-- the uploaded tender text for contradictions, ambiguities, missing items,
-- placeholders and risk clauses, drafts the formal bilingual question for each,
-- and lets the bid team triage them into a clarification letter; the buyer's
-- answers are recorded on the same row and flow into the proposal's
-- "Assumptions, Exclusions & Clarifications" section.
--
-- One row per question. (projectId, fingerprint) is unique so a re-run upserts
-- by content and never duplicates or overwrites the team's triage.
--
-- Safety: strictly additive — one new table, its indexes and foreign keys; no
-- existing column touched; applies cleanly to a populated database.
-- Reverse: DROP TABLE "TenderClarification";

CREATE TABLE IF NOT EXISTS "TenderClarification" (
  "id"             TEXT NOT NULL,
  "workspaceId"    TEXT NOT NULL,
  "projectId"      TEXT NOT NULL,
  "createdById"    TEXT NOT NULL,
  "kind"           TEXT NOT NULL,
  "severity"       TEXT NOT NULL,
  "status"         TEXT NOT NULL DEFAULT 'PROPOSED',
  "titleEn"        TEXT NOT NULL,
  "titleAr"        TEXT NOT NULL,
  "rationaleEn"    TEXT NOT NULL,
  "rationaleAr"    TEXT NOT NULL,
  "questionEn"     TEXT NOT NULL,
  "questionAr"     TEXT NOT NULL,
  "quotesJson"     TEXT NOT NULL,
  "answerMd"       TEXT,
  "answeredAt"     TIMESTAMP(3),
  "submittedAt"    TIMESTAMP(3),
  "provenance"     TEXT NOT NULL,
  "provenanceJson" TEXT,
  "fingerprint"    TEXT NOT NULL,
  "editedAt"       TIMESTAMP(3),
  "sortOrder"      INTEGER NOT NULL DEFAULT 0,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TenderClarification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TenderClarification_projectId_fingerprint_key"
  ON "TenderClarification"("projectId", "fingerprint");

CREATE INDEX IF NOT EXISTS "TenderClarification_projectId_status_idx"
  ON "TenderClarification"("projectId", "status");

CREATE INDEX IF NOT EXISTS "TenderClarification_workspaceId_idx"
  ON "TenderClarification"("workspaceId");

ALTER TABLE "TenderClarification"
  ADD CONSTRAINT "TenderClarification_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TenderClarification"
  ADD CONSTRAINT "TenderClarification_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "TenderProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TenderClarification"
  ADD CONSTRAINT "TenderClarification_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
