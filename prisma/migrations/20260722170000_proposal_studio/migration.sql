-- AlterTable
ALTER TABLE "AgentRun" ADD COLUMN "configJson" TEXT;

-- AlterTable
ALTER TABLE "GeneratedProposal" ADD COLUMN "parentProposalId" TEXT;

-- CreateIndex
CREATE INDEX "GeneratedProposal_parentProposalId_idx" ON "GeneratedProposal"("parentProposalId");

-- AddForeignKey
ALTER TABLE "GeneratedProposal" ADD CONSTRAINT "GeneratedProposal_parentProposalId_fkey" FOREIGN KEY ("parentProposalId") REFERENCES "GeneratedProposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
