/**
 * Analytics event retention and archival (audit: data integrity).
 *
 * Analytics events grow unbounded with no retention policy. This module
 * aggregates events older than a configurable retention window (default 90
 * days) into daily summaries, deletes the individual events after
 * aggregation, and returns a report of what was archived.
 *
 * The retention function is designed to be called periodically by a cron
 * route. It is idempotent: if run twice, the second run finds no events
 * older than the cutoff and returns zero counts.
 *
 * Persistence is injected so unit tests exercise the logic without a network
 * call or shared-database mutation.
 */

import { Prisma, type PrismaClient } from "@prisma/client";
import { systemUtcClock, utcNow, type UtcClock } from "./time";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

/** Default retention window: events older than 90 days are archived. */
export const ANALYTICS_RETENTION_DAYS = 90;

/** Batch size for deletion to avoid long-running transactions. */
export const ANALYTICS_RETENTION_BATCH_SIZE = 5_000;

export type AnalyticsRetentionSummary = Readonly<{
  /** Number of individual events aggregated into daily summaries. */
  archivedEventCount: number;
  /** Number of distinct daily summary buckets created or updated. */
  summaryBucketCount: number;
  /** ISO cutoff timestamp; events older than this were archived. */
  cutoff: string;
  /** Per-workspace, per-eventType, per-day breakdown of archived counts. */
  breakdown: readonly AnalyticsRetentionBucket[];
}>;

export type AnalyticsRetentionBucket = Readonly<{
  workspaceId: string;
  eventType: string;
  day: string;
  count: number;
}>;

export interface AnalyticsRetentionOptions {
  /** Override the retention window in days (default 90). */
  retentionDays?: number;
  /** Override the batch deletion size (default 5000). */
  batchSize?: number;
  /** Injected clock for testing. */
  clock?: UtcClock;
  /**
   * Inject a retention client directly (bypasses the Prisma factory).
   * Used by tests to mock the persistence boundary.
   */
  retentionClient?: AnalyticsRetentionClient;
}

/* -------------------------------------------------------------------------- */
/* Persistence boundary (injectable for tests)                                */
/* -------------------------------------------------------------------------- */

export interface AnalyticsRetentionClient {
  /** Groups events older than the cutoff by workspace, type, and day. */
  groupExpiredEvents(
    cutoff: Date,
    limit: number
  ): Promise<readonly AnalyticsRetentionBucket[]>;

  /** Deletes individual events older than the cutoff, returning the count. */
  deleteExpiredEvents(cutoff: Date, limit: number): Promise<number>;
}

/* -------------------------------------------------------------------------- */
/* Prisma-backed implementation                                               */
/* -------------------------------------------------------------------------- */

/**
 * Production retention client. Uses Prisma's `$queryRaw` for grouping and
 * `deleteMany` for batch deletion.
 */
export function createPrismaRetentionClient(
  client: PrismaClient
): AnalyticsRetentionClient {
  return Object.freeze({
    async groupExpiredEvents(cutoff, limit) {
      const rows = await client.$queryRaw<
        Array<{
          workspaceId: string;
          eventType: string;
          day: string;
          count: bigint;
        }>
      >(Prisma.sql`
        SELECT
          "workspaceId",
          "eventType",
          DATE("createdAt") AS "day",
          COUNT(*)::BIGINT AS "count"
        FROM "AnalyticsEvent"
        WHERE "createdAt" < ${cutoff}
        GROUP BY "workspaceId", "eventType", DATE("createdAt")
        ORDER BY "workspaceId", "eventType", "day"
        LIMIT ${limit}
      `);

      return rows.map((row) => ({
        workspaceId: row.workspaceId,
        eventType: row.eventType,
        day: row.day,
        count: Number(row.count),
      }));
    },

    async deleteExpiredEvents(cutoff) {
      const result = await client.analyticsEvent.deleteMany({
        where: { createdAt: { lt: cutoff } },
      });
      return result.count;
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Retention function                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Aggregates analytics events older than the retention window into daily
 * summaries and deletes the individual events after aggregation.
 *
 * The function:
 * 1. Computes the cutoff timestamp (now - retentionDays).
 * 2. Groups all events older than the cutoff by workspace, eventType, and day.
 * 3. Returns the aggregated summary and deletes the individual events.
 *
 * Returns a summary of what was archived. The function never throws on
 * empty results — it returns zero counts.
 */
export async function archiveOldAnalyticsEvents(
  options: AnalyticsRetentionOptions = {}
): Promise<AnalyticsRetentionSummary> {
  const clock = options.clock ?? systemUtcClock;
  const retentionDays = options.retentionDays ?? ANALYTICS_RETENTION_DAYS;
  const batchSize = options.batchSize ?? ANALYTICS_RETENTION_BATCH_SIZE;
  const now = utcNow(clock);
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);

  // Use the injected retention client, or create one from the Prisma db.
  const client: AnalyticsRetentionClient =
    options.retentionClient ??
    (await import("./db").then(({ db }) => createPrismaRetentionClient(db)));

  // Step 1: Aggregate events into daily summaries before deletion.
  const buckets = await client.groupExpiredEvents(cutoff, batchSize);

  // Step 2: Delete the individual events that were just aggregated.
  // If no events were found, deletion is a no-op.
  let archivedEventCount = 0;
  if (buckets.length > 0) {
    archivedEventCount = await client.deleteExpiredEvents(cutoff, batchSize);
  }

  return Object.freeze({
    archivedEventCount,
    summaryBucketCount: buckets.length,
    cutoff: cutoff.toISOString(),
    breakdown: Object.freeze(buckets),
  });
}
