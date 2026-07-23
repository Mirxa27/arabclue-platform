-- CreateTable
CREATE TABLE "CopilotMission" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Mission Control',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "activeProjectId" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'ar',
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CopilotMission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CopilotMessage" (
    "id" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "userId" TEXT,
    "role" TEXT NOT NULL,
    "partsJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CopilotMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CopilotAttachment" (
    "id" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "documentId" TEXT,
    "projectId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'upload',
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "storagePath" TEXT,
    "textPreview" TEXT,
    "docCategory" TEXT NOT NULL DEFAULT 'OTHER',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "routeStatus" TEXT NOT NULL DEFAULT 'STAGED',
    "classificationJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CopilotAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CopilotAction" (
    "id" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "inputJson" TEXT,
    "outputJson" TEXT,
    "errorText" TEXT,
    "reversible" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CopilotAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CopilotMission_workspaceId_userId_status_idx" ON "CopilotMission"("workspaceId", "userId", "status");
CREATE INDEX "CopilotMission_userId_lastActivityAt_idx" ON "CopilotMission"("userId", "lastActivityAt");
CREATE INDEX "CopilotMessage_missionId_createdAt_idx" ON "CopilotMessage"("missionId", "createdAt");
CREATE INDEX "CopilotAttachment_missionId_createdAt_idx" ON "CopilotAttachment"("missionId", "createdAt");
CREATE INDEX "CopilotAttachment_workspaceId_idx" ON "CopilotAttachment"("workspaceId");
CREATE INDEX "CopilotAttachment_documentId_idx" ON "CopilotAttachment"("documentId");
CREATE INDEX "CopilotAction_missionId_createdAt_idx" ON "CopilotAction"("missionId", "createdAt");
CREATE INDEX "CopilotAction_workspaceId_idx" ON "CopilotAction"("workspaceId");

-- AddForeignKey
ALTER TABLE "CopilotMission" ADD CONSTRAINT "CopilotMission_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CopilotMission" ADD CONSTRAINT "CopilotMission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CopilotMessage" ADD CONSTRAINT "CopilotMessage_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "CopilotMission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CopilotMessage" ADD CONSTRAINT "CopilotMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CopilotAttachment" ADD CONSTRAINT "CopilotAttachment_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "CopilotMission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CopilotAttachment" ADD CONSTRAINT "CopilotAttachment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CopilotAttachment" ADD CONSTRAINT "CopilotAttachment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CopilotAttachment" ADD CONSTRAINT "CopilotAttachment_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "UploadedDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CopilotAction" ADD CONSTRAINT "CopilotAction_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "CopilotMission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CopilotAction" ADD CONSTRAINT "CopilotAction_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CopilotAction" ADD CONSTRAINT "CopilotAction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
