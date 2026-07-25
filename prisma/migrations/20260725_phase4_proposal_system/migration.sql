-- Phase 4: Enhanced Proposal System tables
-- File-only migration — do not apply to shared Neon without explicit authorization.

CREATE TABLE IF NOT EXISTS "ProposalBuilderSection" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "sectionKey" TEXT NOT NULL,
    "sectionType" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "titleJson" JSONB NOT NULL,
    "contentJson" JSONB NOT NULL,
    "metadataJson" JSONB,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "validationJson" JSONB,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProposalBuilderSection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProposalBuilderSection_proposalId_sectionKey_key"
  ON "ProposalBuilderSection"("proposalId", "sectionKey");
CREATE INDEX IF NOT EXISTS "ProposalBuilderSection_proposalId_sortOrder_idx"
  ON "ProposalBuilderSection"("proposalId", "sortOrder");
CREATE INDEX IF NOT EXISTS "ProposalBuilderSection_sectionType_idx"
  ON "ProposalBuilderSection"("sectionType");

ALTER TABLE "ProposalBuilderSection"
  DROP CONSTRAINT IF EXISTS "ProposalBuilderSection_proposalId_fkey";
ALTER TABLE "ProposalBuilderSection"
  ADD CONSTRAINT "ProposalBuilderSection_proposalId_fkey"
  FOREIGN KEY ("proposalId") REFERENCES "GeneratedProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProposalBuilderSection"
  DROP CONSTRAINT IF EXISTS "ProposalBuilderSection_createdBy_fkey";
ALTER TABLE "ProposalBuilderSection"
  ADD CONSTRAINT "ProposalBuilderSection_createdBy_fkey"
  FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "TemplateMarketplaceEntry" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "templateKey" TEXT NOT NULL,
    "nameJson" JSONB NOT NULL,
    "descriptionJson" JSONB NOT NULL,
    "category" TEXT NOT NULL,
    "industry" TEXT,
    "sectionTypes" JSONB NOT NULL,
    "previewJson" JSONB,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "tags" JSONB,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TemplateMarketplaceEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TemplateMarketplaceEntry_workspaceId_templateKey_key"
  ON "TemplateMarketplaceEntry"("workspaceId", "templateKey");
CREATE INDEX IF NOT EXISTS "TemplateMarketplaceEntry_category_isPublic_idx"
  ON "TemplateMarketplaceEntry"("category", "isPublic");
CREATE INDEX IF NOT EXISTS "TemplateMarketplaceEntry_rating_downloadCount_idx"
  ON "TemplateMarketplaceEntry"("rating", "downloadCount");
CREATE INDEX IF NOT EXISTS "TemplateMarketplaceEntry_isFeatured_isPublic_idx"
  ON "TemplateMarketplaceEntry"("isFeatured", "isPublic");

ALTER TABLE "TemplateMarketplaceEntry"
  DROP CONSTRAINT IF EXISTS "TemplateMarketplaceEntry_workspaceId_fkey";
ALTER TABLE "TemplateMarketplaceEntry"
  ADD CONSTRAINT "TemplateMarketplaceEntry_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TemplateMarketplaceEntry"
  DROP CONSTRAINT IF EXISTS "TemplateMarketplaceEntry_createdBy_fkey";
ALTER TABLE "TemplateMarketplaceEntry"
  ADD CONSTRAINT "TemplateMarketplaceEntry_createdBy_fkey"
  FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "CollaborationComment" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "sectionKey" TEXT,
    "content" TEXT NOT NULL,
    "mentions" JSONB,
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "parentId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CollaborationComment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CollaborationComment_proposalId_sectionKey_idx"
  ON "CollaborationComment"("proposalId", "sectionKey");
CREATE INDEX IF NOT EXISTS "CollaborationComment_proposalId_createdAt_idx"
  ON "CollaborationComment"("proposalId", "createdAt");
CREATE INDEX IF NOT EXISTS "CollaborationComment_createdBy_idx"
  ON "CollaborationComment"("createdBy");

ALTER TABLE "CollaborationComment"
  DROP CONSTRAINT IF EXISTS "CollaborationComment_proposalId_fkey";
ALTER TABLE "CollaborationComment"
  ADD CONSTRAINT "CollaborationComment_proposalId_fkey"
  FOREIGN KEY ("proposalId") REFERENCES "GeneratedProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CollaborationComment"
  DROP CONSTRAINT IF EXISTS "CollaborationComment_createdBy_fkey";
ALTER TABLE "CollaborationComment"
  ADD CONSTRAINT "CollaborationComment_createdBy_fkey"
  FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CollaborationComment"
  DROP CONSTRAINT IF EXISTS "CollaborationComment_parentId_fkey";
ALTER TABLE "CollaborationComment"
  ADD CONSTRAINT "CollaborationComment_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "CollaborationComment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "AnalyticsEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "metadataJson" JSONB,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AnalyticsEvent_workspaceId_eventType_createdAt_idx"
  ON "AnalyticsEvent"("workspaceId", "eventType", "createdAt");
CREATE INDEX IF NOT EXISTS "AnalyticsEvent_entityType_entityId_idx"
  ON "AnalyticsEvent"("entityType", "entityId");
CREATE INDEX IF NOT EXISTS "AnalyticsEvent_userId_createdAt_idx"
  ON "AnalyticsEvent"("userId", "createdAt");

ALTER TABLE "AnalyticsEvent"
  DROP CONSTRAINT IF EXISTS "AnalyticsEvent_workspaceId_fkey";
ALTER TABLE "AnalyticsEvent"
  ADD CONSTRAINT "AnalyticsEvent_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AnalyticsEvent"
  DROP CONSTRAINT IF EXISTS "AnalyticsEvent_userId_fkey";
ALTER TABLE "AnalyticsEvent"
  ADD CONSTRAINT "AnalyticsEvent_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
