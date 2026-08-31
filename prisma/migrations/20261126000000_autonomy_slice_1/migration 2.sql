-- Autonomy shell rebuild — Slice 1.
--
-- Strictly additive: nullable columns on Workspace, TenderProject, and AgentRun,
-- plus three new tables (InboxItem, ProposalReviewToken, SavedTenderFilter) that
-- back the three-layer autonomy surface (composer, one-shot fast path, inbox).
-- Every added column is nullable, every new table stands alone. Nothing is
-- dropped, renamed, retyped, or backfilled. Applies cleanly to a populated DB.

-- ─── Workspace: company profile + residency preference ────────────────────────

ALTER TABLE "Workspace"
  ADD COLUMN IF NOT EXISTS "companyProfileMd"   TEXT,
  ADD COLUMN IF NOT EXISTS "residencyPreference" TEXT;
  -- residencyPreference values (validated in application layer): KSA | GLOBAL | null

-- ─── TenderProject: public artifact review link token ─────────────────────────

ALTER TABLE "TenderProject"
  ADD COLUMN IF NOT EXISTS "artifactUrlToken" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "TenderProject_artifactUrlToken_key"
  ON "TenderProject"("artifactUrlToken");

-- ─── AgentRun: plan panel + interrupt + failure taxonomy ──────────────────────

ALTER TABLE "AgentRun"
  ADD COLUMN IF NOT EXISTS "planStepsJson"    TEXT,
  ADD COLUMN IF NOT EXISTS "currentStepName"  TEXT,
  ADD COLUMN IF NOT EXISTS "failureKind"      TEXT;
  -- failureKind values: PROVIDER_UNAVAILABLE | RATE_LIMIT | INVALID_INPUT
  --                    | INTERNAL | USER_CANCELLED | null

-- ─── InboxItem: retention loop across agent questions, matches, amendments ────

CREATE TABLE IF NOT EXISTS "InboxItem" (
  "id"          TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "userId"      TEXT,
  "kind"        TEXT NOT NULL,
  -- kind values: AGENT_QUESTION | TENDER_MATCH | TENDER_AMENDMENT
  --            | DEADLINE_REMINDER | REVIEW_REQUEST | RUN_FAILED
  "title"       TEXT NOT NULL,
  "titleAr"     TEXT,
  "bodyMd"      TEXT,
  "bodyMdAr"    TEXT,
  "linkPath"    TEXT,
  "agentRunId"  TEXT,
  "projectId"   TEXT,
  "priority"    TEXT NOT NULL DEFAULT 'NORMAL',
  -- priority values: URGENT | HIGH | NORMAL | LOW
  "status"      TEXT NOT NULL DEFAULT 'UNREAD',
  -- status values: UNREAD | READ | ARCHIVED | ACTED
  "dueAt"       TIMESTAMP(3),
  "readAt"      TIMESTAMP(3),
  "actedAt"     TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InboxItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "InboxItem_workspaceId_status_idx"
  ON "InboxItem"("workspaceId", "status");

CREATE INDEX IF NOT EXISTS "InboxItem_workspaceId_kind_idx"
  ON "InboxItem"("workspaceId", "kind");

CREATE INDEX IF NOT EXISTS "InboxItem_userId_status_idx"
  ON "InboxItem"("userId", "status");

CREATE INDEX IF NOT EXISTS "InboxItem_agentRunId_idx"
  ON "InboxItem"("agentRunId");

CREATE INDEX IF NOT EXISTS "InboxItem_projectId_idx"
  ON "InboxItem"("projectId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InboxItem_workspaceId_fkey') THEN
    ALTER TABLE "InboxItem"
      ADD CONSTRAINT "InboxItem_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InboxItem_userId_fkey') THEN
    ALTER TABLE "InboxItem"
      ADD CONSTRAINT "InboxItem_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InboxItem_agentRunId_fkey') THEN
    ALTER TABLE "InboxItem"
      ADD CONSTRAINT "InboxItem_agentRunId_fkey"
      FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'InboxItem_projectId_fkey') THEN
    ALTER TABLE "InboxItem"
      ADD CONSTRAINT "InboxItem_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "TenderProject"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- ─── ProposalReviewToken: public /review/{token} signed URL ───────────────────

CREATE TABLE IF NOT EXISTS "ProposalReviewToken" (
  "id"          TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "proposalId"  TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "token"       TEXT NOT NULL,
  "expiresAt"   TIMESTAMP(3) NOT NULL,
  "revokedAt"   TIMESTAMP(3),
  "lastViewedAt" TIMESTAMP(3),
  "viewCount"   INTEGER NOT NULL DEFAULT 0,
  "scope"       TEXT NOT NULL DEFAULT 'READ_ONLY',
  -- scope values: READ_ONLY | COMMENT (comment support is future work)
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProposalReviewToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProposalReviewToken_token_key"
  ON "ProposalReviewToken"("token");

CREATE INDEX IF NOT EXISTS "ProposalReviewToken_workspaceId_idx"
  ON "ProposalReviewToken"("workspaceId");

CREATE INDEX IF NOT EXISTS "ProposalReviewToken_proposalId_idx"
  ON "ProposalReviewToken"("proposalId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProposalReviewToken_workspaceId_fkey') THEN
    ALTER TABLE "ProposalReviewToken"
      ADD CONSTRAINT "ProposalReviewToken_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProposalReviewToken_proposalId_fkey') THEN
    ALTER TABLE "ProposalReviewToken"
      ADD CONSTRAINT "ProposalReviewToken_proposalId_fkey"
      FOREIGN KEY ("proposalId") REFERENCES "GeneratedProposal"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProposalReviewToken_createdById_fkey') THEN
    ALTER TABLE "ProposalReviewToken"
      ADD CONSTRAINT "ProposalReviewToken_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- ─── SavedTenderFilter: user-defined tender feed queries ──────────────────────

CREATE TABLE IF NOT EXISTS "SavedTenderFilter" (
  "id"          TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "nameAr"      TEXT,
  "queryJson"   TEXT NOT NULL,
  -- queryJson holds { keywords, sectors, budgetMin, budgetMax, saudizationMin, deadlineWithinDays, ... }
  "notifyOnMatch" BOOLEAN NOT NULL DEFAULT false,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SavedTenderFilter_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SavedTenderFilter_workspaceId_idx"
  ON "SavedTenderFilter"("workspaceId");

CREATE INDEX IF NOT EXISTS "SavedTenderFilter_userId_idx"
  ON "SavedTenderFilter"("userId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SavedTenderFilter_workspaceId_fkey') THEN
    ALTER TABLE "SavedTenderFilter"
      ADD CONSTRAINT "SavedTenderFilter_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SavedTenderFilter_userId_fkey') THEN
    ALTER TABLE "SavedTenderFilter"
      ADD CONSTRAINT "SavedTenderFilter_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
