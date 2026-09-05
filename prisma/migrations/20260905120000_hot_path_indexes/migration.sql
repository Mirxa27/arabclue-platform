-- Hot-path composite indexes (deployment audit, 2026-09-05).
--
-- Every tenant-scoped list and KPI query filters on workspaceId and then sorts
-- or filters on a second column. The single-column indexes that exist today
-- make Postgres read every row of the workspace and sort/filter in memory:
--
--   /api/projects        TenderProject      WHERE workspaceId ORDER BY updatedAt DESC LIMIT 100
--   /api/stats           TenderProject      WHERE workspaceId AND status IN (...)
--   /api/documents       UploadedDocument   WHERE workspaceId ORDER BY createdAt DESC LIMIT 200
--   /api/stats trends    UploadedDocument   WHERE workspaceId AND createdAt BETWEEN ...
--   /api/stats trends    GeneratedProposal  WHERE workspaceId AND createdAt BETWEEN ...
--   proposal lifecycle   GeneratedProposal  WHERE workspaceId AND status = ...
--   /api/agents/runs     AgentRun           WHERE projectId ORDER BY createdAt DESC LIMIT n
--
-- Names follow Prisma's convention ("Table_col1_col2_idx") so `prisma migrate
-- diff` against the schema reports no drift after this applies.
--
-- Safety: additive only. Plain CREATE INDEX takes a SHARE lock on the table
-- for the duration of the build (writes wait, reads continue); these tables
-- are small enough that the build completes in seconds. IF NOT EXISTS keeps
-- the migration idempotent. Reverse: DROP INDEX for each name below.

CREATE INDEX IF NOT EXISTS "TenderProject_workspaceId_updatedAt_idx"
  ON "TenderProject"("workspaceId", "updatedAt");

CREATE INDEX IF NOT EXISTS "TenderProject_workspaceId_status_idx"
  ON "TenderProject"("workspaceId", "status");

CREATE INDEX IF NOT EXISTS "UploadedDocument_workspaceId_createdAt_idx"
  ON "UploadedDocument"("workspaceId", "createdAt");

CREATE INDEX IF NOT EXISTS "GeneratedProposal_workspaceId_createdAt_idx"
  ON "GeneratedProposal"("workspaceId", "createdAt");

CREATE INDEX IF NOT EXISTS "GeneratedProposal_workspaceId_status_idx"
  ON "GeneratedProposal"("workspaceId", "status");

CREATE INDEX IF NOT EXISTS "AgentRun_projectId_createdAt_idx"
  ON "AgentRun"("projectId", "createdAt");
