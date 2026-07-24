-- Contract Template System Migration
-- Phase 3: Production-ready contract template catalog with versioning, clause library, and document generation

-- Contract template families (system and workspace-owned)
CREATE TABLE "ContractTemplate" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "descriptionEn" TEXT,
    "descriptionAr" TEXT,
    "version" TEXT NOT NULL DEFAULT '1.0',
    "status" TEXT NOT NULL DEFAULT 'active',
    "sectionsJson" TEXT NOT NULL,
    "variablesJson" TEXT NOT NULL,
    "clausesJson" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractTemplate_pkey" PRIMARY KEY ("id")
);

-- Template version history for audit and rollback
CREATE TABLE "ContractTemplateVersion" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "sectionsJson" TEXT NOT NULL,
    "variablesJson" TEXT NOT NULL,
    "clausesJson" TEXT NOT NULL,
    "changeNote" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractTemplateVersion_pkey" PRIMARY KEY ("id")
);

-- Reusable contract clause library (payment, delivery, termination, liability, etc.)
CREATE TABLE "StandardClause" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "contentEn" TEXT NOT NULL,
    "contentAr" TEXT NOT NULL,
    "mandatory" BOOLEAN NOT NULL DEFAULT false,
    "customizable" BOOLEAN NOT NULL DEFAULT true,
    "saudiLawReference" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isSystem" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StandardClause_pkey" PRIMARY KEY ("id")
);

-- Generated contracts from templates with filled variables
CREATE TABLE "GeneratedContract" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "projectId" TEXT,
    "title" TEXT NOT NULL,
    "titleAr" TEXT NOT NULL,
    "dataJson" TEXT NOT NULL,
    "clausesJson" TEXT NOT NULL,
    "contentHtml" TEXT NOT NULL,
    "contentPdfPath" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GeneratedContract_pkey" PRIMARY KEY ("id")
);

-- Indexes for performance
CREATE INDEX "ContractTemplate_workspaceId_type_status_idx" ON "ContractTemplate"("workspaceId", "type", "status");
CREATE INDEX "ContractTemplate_workspaceId_isSystem_idx" ON "ContractTemplate"("workspaceId", "isSystem");
CREATE INDEX "ContractTemplateVersion_templateId_version_idx" ON "ContractTemplateVersion"("templateId", "version");
CREATE INDEX "StandardClause_category_isActive_idx" ON "StandardClause"("category", "isActive");
CREATE INDEX "GeneratedContract_workspaceId_status_idx" ON "GeneratedContract"("workspaceId", "status");
CREATE INDEX "GeneratedContract_templateId_idx" ON "GeneratedContract"("templateId");
CREATE INDEX "GeneratedContract_projectId_idx" ON "GeneratedContract"("projectId");

-- Foreign keys
ALTER TABLE "ContractTemplate" ADD CONSTRAINT "ContractTemplate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContractTemplate" ADD CONSTRAINT "ContractTemplate_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContractTemplate" ADD CONSTRAINT "ContractTemplate_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ContractTemplateVersion" ADD CONSTRAINT "ContractTemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ContractTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContractTemplateVersion" ADD CONSTRAINT "ContractTemplateVersion_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "GeneratedContract" ADD CONSTRAINT "GeneratedContract_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GeneratedContract" ADD CONSTRAINT "GeneratedContract_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ContractTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GeneratedContract" ADD CONSTRAINT "GeneratedContract_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "TenderProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GeneratedContract" ADD CONSTRAINT "GeneratedContract_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
