-- Analytics daily summary table (audit: data integrity).
--
-- The retention job is named "archiveOldAnalyticsEvents" and its own comments
-- describe aggregating events into daily summaries before deletion. It computed
-- those summaries, returned them to the caller, and never wrote them anywhere:
-- no summary table existed. The job was therefore a deletion function, and the
-- only reason 90-day-old analytics still exist is that the cron entry was never
-- registered in vercel.json.
--
-- This table gives the aggregate somewhere durable to live. `eventCount`
-- accumulates via upsert so a day archived across several batched runs
-- converges on the true total.
--
-- Strictly additive: creates one new table and its indexes, touches no existing
-- column, and applies cleanly to a populated database.

CREATE TABLE IF NOT EXISTS "AnalyticsDailySummary" (
  "id"          TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "eventType"   TEXT NOT NULL,
  "day"         DATE NOT NULL,
  "eventCount"  INTEGER NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AnalyticsDailySummary_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AnalyticsDailySummary_workspaceId_eventType_day_key"
  ON "AnalyticsDailySummary"("workspaceId", "eventType", "day");

CREATE INDEX IF NOT EXISTS "AnalyticsDailySummary_workspaceId_day_idx"
  ON "AnalyticsDailySummary"("workspaceId", "day");

CREATE INDEX IF NOT EXISTS "AnalyticsDailySummary_day_idx"
  ON "AnalyticsDailySummary"("day");
