-- Account onboarding corpus, tender requirements, proposal reviews

-- AlterTable GeneratedProposal
ALTER TABLE "GeneratedProposal" ADD COLUMN "financialFormsJson" TEXT;
ALTER TABLE "GeneratedProposal" ADD COLUMN "submittedAt" DATETIME;
ALTER TABLE "GeneratedProposal" ADD COLUMN "approvedAt" DATETIME;

-- CreateTable
CREATE TABLE "Certificate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "certType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "number" TEXT,
    "issuer" TEXT,
    "issuedAt" DATETIME,
    "expiresAt" DATETIME,
    "filePath" TEXT,
    "alertDays" INTEGER NOT NULL DEFAULT 30,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Certificate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "StaffMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "roleTitle" TEXT NOT NULL,
    "roleTitleAr" TEXT,
    "certifications" TEXT,
    "cvSummary" TEXT,
    "requirementTags" TEXT,
    "embeddingJson" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StaffMember_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "MethodologyAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "titleAr" TEXT,
    "bodyMd" TEXT NOT NULL,
    "approved" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MethodologyAsset_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ContentLibraryItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "titleAr" TEXT,
    "category" TEXT NOT NULL DEFAULT 'BOILERPLATE',
    "bodyMd" TEXT NOT NULL,
    "tags" TEXT,
    "restricted" BOOLEAN NOT NULL DEFAULT false,
    "embeddingJson" TEXT,
    "approved" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ContentLibraryItem_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Partnership" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "partnerType" TEXT NOT NULL,
    "scope" TEXT,
    "docsNote" TEXT,
    "filePath" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Partnership_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "TargetSector" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "sector" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TargetSector_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "BidHistoryNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "entityName" TEXT NOT NULL,
    "sector" TEXT,
    "outcome" TEXT NOT NULL,
    "notes" TEXT,
    "bidDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BidHistoryNote_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ApprovalPolicy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ApprovalPolicy_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ApprovalStep" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "policyId" TEXT NOT NULL,
    "stepIndex" INTEGER NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "stepRole" TEXT NOT NULL DEFAULT 'TECHNICAL',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApprovalStep_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "ApprovalPolicy" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ApprovalStep_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "Restriction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "restrictionType" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Restriction_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "OnboardingProgress" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "completedSteps" TEXT NOT NULL DEFAULT '{}',
    "restrictionsReviewed" BOOLEAN NOT NULL DEFAULT false,
    "readyForProposals" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OnboardingProgress_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "TenderRequirement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "sectionRef" TEXT,
    "pageRef" TEXT,
    "status" TEXT NOT NULL DEFAULT 'MISSING',
    "linkedResourceType" TEXT,
    "linkedResourceId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TenderRequirement_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "TenderProject" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ProposalReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "proposalId" TEXT NOT NULL,
    "stepIndex" INTEGER NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "stepRole" TEXT NOT NULL DEFAULT 'TECHNICAL',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "comment" TEXT,
    "decidedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProposalReview_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "GeneratedProposal" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProposalReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ApprovalPolicy_workspaceId_key" ON "ApprovalPolicy"("workspaceId");
CREATE UNIQUE INDEX "ApprovalStep_policyId_stepIndex_key" ON "ApprovalStep"("policyId", "stepIndex");
CREATE UNIQUE INDEX "OnboardingProgress_workspaceId_key" ON "OnboardingProgress"("workspaceId");
CREATE UNIQUE INDEX "TargetSector_workspaceId_sector_key" ON "TargetSector"("workspaceId", "sector");
CREATE UNIQUE INDEX "ProposalReview_proposalId_stepIndex_key" ON "ProposalReview"("proposalId", "stepIndex");

CREATE INDEX "Certificate_workspaceId_idx" ON "Certificate"("workspaceId");
CREATE INDEX "Certificate_expiresAt_idx" ON "Certificate"("expiresAt");
CREATE INDEX "StaffMember_workspaceId_idx" ON "StaffMember"("workspaceId");
CREATE INDEX "MethodologyAsset_workspaceId_idx" ON "MethodologyAsset"("workspaceId");
CREATE INDEX "MethodologyAsset_category_idx" ON "MethodologyAsset"("category");
CREATE INDEX "ContentLibraryItem_workspaceId_idx" ON "ContentLibraryItem"("workspaceId");
CREATE INDEX "ContentLibraryItem_category_idx" ON "ContentLibraryItem"("category");
CREATE INDEX "Partnership_workspaceId_idx" ON "Partnership"("workspaceId");
CREATE INDEX "TargetSector_workspaceId_idx" ON "TargetSector"("workspaceId");
CREATE INDEX "BidHistoryNote_workspaceId_idx" ON "BidHistoryNote"("workspaceId");
CREATE INDEX "ApprovalStep_reviewerId_idx" ON "ApprovalStep"("reviewerId");
CREATE INDEX "Restriction_workspaceId_idx" ON "Restriction"("workspaceId");
CREATE INDEX "TenderRequirement_projectId_idx" ON "TenderRequirement"("projectId");
CREATE INDEX "TenderRequirement_status_idx" ON "TenderRequirement"("status");
CREATE INDEX "ProposalReview_reviewerId_idx" ON "ProposalReview"("reviewerId");
CREATE INDEX "ProposalReview_status_idx" ON "ProposalReview"("status");
