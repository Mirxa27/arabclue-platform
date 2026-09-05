/**
 * Tenant analytics reads for GET /api/analytics/proposals.
 *
 * Two things the route used to get wrong:
 *
 * - It loaded every raw event of the period into memory (twice: current and
 *   preceding period) and counted in JavaScript. Every aggregate here is a
 *   database GROUP BY, so no raw rows are held.
 * - Retention folds events older than ANALYTICS_RETENTION_DAYS into
 *   AnalyticsDailySummary and deletes them, and nothing read the summaries
 *   back, so a 90-day or 1-year period silently truncated at the cutoff. The
 *   per-type counts and the daily series now union the summary rows for the
 *   whole UTC days of the range that retention may already have archived.
 *
 * Summaries carry no payload, so the breakdown charts (export format, template,
 * section type) cover raw events only; that is stated in the response.
 */

import { Prisma, type PrismaClient } from "@prisma/client";
import {
  ANALYTICS_AGENT_TERMINAL_EVENT_TYPES,
  ANALYTICS_EVENT_TYPES,
  isAnalyticsEventType,
  type AnalyticsEventType,
} from "./analytics-collector";
import { ANALYTICS_RETENTION_DAYS } from "./analytics-retention";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The slice of the Prisma client these reads touch; injectable for tests. */
export type AnalyticsReadClient = Pick<
  PrismaClient,
  "analyticsEvent" | "analyticsDailySummary" | "$queryRaw"
>;

export type AnalyticsCountsByType = Record<AnalyticsEventType, number>;

export function emptyCountsByType(): AnalyticsCountsByType {
  const counts = {} as AnalyticsCountsByType;
  for (const eventType of ANALYTICS_EVENT_TYPES) counts[eventType] = 0;
  return counts;
}

/** Sum of two per-type count tables; unknown types are never introduced. */
export function addCountsByType(
  ...tables: readonly Readonly<Partial<AnalyticsCountsByType>>[]
): AnalyticsCountsByType {
  const total = emptyCountsByType();
  for (const table of tables) {
    for (const eventType of ANALYTICS_EVENT_TYPES) {
      total[eventType] += table[eventType] ?? 0;
    }
  }
  return total;
}

export function sumCounts(counts: Readonly<Partial<AnalyticsCountsByType>>): number {
  let total = 0;
  for (const eventType of ANALYTICS_EVENT_TYPES) total += counts[eventType] ?? 0;
  return total;
}

function floorUtcDay(instant: Date): Date {
  return new Date(
    Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth(), instant.getUTCDate())
  );
}

function ceilUtcDay(instant: Date): Date {
  const floored = floorUtcDay(instant);
  return floored.getTime() === instant.getTime()
    ? floored
    : new Date(floored.getTime() + DAY_MS);
}

/**
 * The UTC days of [start, end) that may already live in AnalyticsDailySummary.
 *
 * Only whole days inside the range are taken, so a range that starts mid-day
 * never counts a summarised morning it did not ask for. Days after the
 * retention cutoff's own day cannot have been archived yet and are skipped;
 * the cutoff day itself is included because its early hours may be
 * summarised while its later hours are still raw — the two halves add up.
 * Returns null when no such day exists.
 */
export function summaryDayRange(
  start: Date,
  end: Date,
  retentionCutoff: Date
): { gte: Date; lt: Date } | null {
  const firstDay = ceilUtcDay(start);
  const lastExclusive = new Date(
    Math.min(floorUtcDay(end).getTime(), floorUtcDay(retentionCutoff).getTime() + DAY_MS)
  );
  if (firstDay.getTime() >= lastExclusive.getTime()) return null;
  return { gte: firstDay, lt: lastExclusive };
}

export function retentionCutoff(now: Date): Date {
  return new Date(now.getTime() - ANALYTICS_RETENTION_DAYS * DAY_MS);
}

/** Raw-event counts per vocabulary type in [start, end); one GROUP BY. */
export async function countRawEventsByType(
  client: AnalyticsReadClient,
  workspaceId: string,
  start: Date,
  end: Date
): Promise<AnalyticsCountsByType> {
  const counts = emptyCountsByType();
  const rows = await client.analyticsEvent.groupBy({
    by: ["eventType"],
    where: { workspaceId, createdAt: { gte: start, lt: end } },
    _count: { _all: true },
  });
  for (const row of rows) {
    if (isAnalyticsEventType(row.eventType)) {
      counts[row.eventType] += row._count._all;
    }
  }
  return counts;
}

/** Archived counts per vocabulary type over whole UTC days; one GROUP BY. */
export async function sumSummaryEventsByType(
  client: AnalyticsReadClient,
  workspaceId: string,
  days: { gte: Date; lt: Date } | null
): Promise<AnalyticsCountsByType> {
  const counts = emptyCountsByType();
  if (!days) return counts;
  const rows = await client.analyticsDailySummary.groupBy({
    by: ["eventType"],
    where: { workspaceId, day: { gte: days.gte, lt: days.lt } },
    _sum: { eventCount: true },
  });
  for (const row of rows) {
    if (isAnalyticsEventType(row.eventType)) {
      counts[row.eventType] += row._sum.eventCount ?? 0;
    }
  }
  return counts;
}

/** Raw plus archived counts for [start, end) as of `now`. */
export async function countEventsByType(
  client: AnalyticsReadClient,
  workspaceId: string,
  start: Date,
  end: Date,
  now: Date
): Promise<AnalyticsCountsByType> {
  const [raw, archived] = await Promise.all([
    countRawEventsByType(client, workspaceId, start, end),
    sumSummaryEventsByType(
      client,
      workspaceId,
      summaryDayRange(start, end, retentionCutoff(now))
    ),
  ]);
  return addCountsByType(raw, archived);
}

/**
 * Median elapsed time of terminal agent runs in [start, end), from the
 * duration each terminal row carries (criterion 4.2). Computed in the
 * database; null when the sample is empty (criterion 4.8).
 */
export async function medianAgentRunDurationMs(
  client: AnalyticsReadClient,
  workspaceId: string,
  start: Date,
  end: Date
): Promise<{ medianMs: number | null; sampleSize: number }> {
  const rows = await client.$queryRaw<
    Array<{ median: number | string | null; sample: bigint | number }>
  >(Prisma.sql`
    SELECT
      percentile_cont(0.5) WITHIN GROUP (ORDER BY "durationMs") AS "median",
      COUNT(*)::BIGINT AS "sample"
    FROM "AnalyticsEvent"
    WHERE "workspaceId" = ${workspaceId}
      AND "eventType" IN (${Prisma.join([...ANALYTICS_AGENT_TERMINAL_EVENT_TYPES])})
      AND "durationMs" IS NOT NULL
      AND "createdAt" >= ${start}
      AND "createdAt" < ${end}
  `);
  const row = rows[0];
  const sampleSize = row ? Number(row.sample) : 0;
  const median = row?.median === null || row?.median === undefined ? null : Number(row.median);
  return {
    medianMs: sampleSize > 0 && median !== null && Number.isFinite(median) ? Math.round(median) : null,
    sampleSize,
  };
}

/**
 * Per-UTC-day counts of one event type over [start, end): raw days grouped
 * in the database, archived days from the summary table.
 */
export async function dailyCountsForType(
  client: AnalyticsReadClient,
  workspaceId: string,
  eventType: AnalyticsEventType,
  start: Date,
  end: Date,
  now: Date
): Promise<Map<string, number>> {
  const byDay = new Map<string, number>();
  const raw = await client.$queryRaw<Array<{ day: Date | string; count: bigint | number }>>(
    Prisma.sql`
      SELECT DATE_TRUNC('day', "createdAt" AT TIME ZONE 'UTC') AS "day",
             COUNT(*)::BIGINT AS "count"
      FROM "AnalyticsEvent"
      WHERE "workspaceId" = ${workspaceId}
        AND "eventType" = ${eventType}
        AND "createdAt" >= ${start}
        AND "createdAt" < ${end}
      GROUP BY 1
    `
  );
  for (const row of raw) {
    const key = dayKey(row.day);
    byDay.set(key, (byDay.get(key) ?? 0) + Number(row.count));
  }

  const days = summaryDayRange(start, end, retentionCutoff(now));
  if (days) {
    const archived = await client.analyticsDailySummary.findMany({
      where: { workspaceId, eventType, day: { gte: days.gte, lt: days.lt } },
      select: { day: true, eventCount: true },
    });
    for (const row of archived) {
      const key = dayKey(row.day);
      byDay.set(key, (byDay.get(key) ?? 0) + row.eventCount);
    }
  }
  return byDay;
}

function dayKey(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toISOString().slice(0, 10)
    : String(value).slice(0, 10);
}

export type CategoryCount = { category: string; count: number };

/** Counts of one event type by a payload field; raw events only, bounded. */
export async function countByMetadataField(
  client: AnalyticsReadClient,
  workspaceId: string,
  eventType: AnalyticsEventType,
  field: "exportFormat" | "sectionType",
  start: Date,
  end: Date,
  limit = 100
): Promise<CategoryCount[]> {
  const rows = await client.$queryRaw<Array<{ category: string | null; count: bigint | number }>>(
    Prisma.sql`
      SELECT "metadataJson"->>${field} AS "category", COUNT(*)::BIGINT AS "count"
      FROM "AnalyticsEvent"
      WHERE "workspaceId" = ${workspaceId}
        AND "eventType" = ${eventType}
        AND "createdAt" >= ${start}
        AND "createdAt" < ${end}
      GROUP BY 1
      ORDER BY 2 DESC
      LIMIT ${limit}
    `
  );
  return rows.map((row) => ({
    category: row.category ?? "unknown",
    count: Number(row.count),
  }));
}

/** The most-used subjects of one event type; raw events only, bounded. */
export async function topEntitiesForType(
  client: AnalyticsReadClient,
  workspaceId: string,
  eventType: AnalyticsEventType,
  start: Date,
  end: Date,
  limit = 10
): Promise<CategoryCount[]> {
  const rows = await client.analyticsEvent.groupBy({
    by: ["entityId"],
    where: { workspaceId, eventType, createdAt: { gte: start, lt: end } },
    _count: { _all: true },
    orderBy: { _count: { entityId: "desc" } },
    take: limit,
  });
  return rows.map((row) => ({ category: row.entityId, count: row._count._all }));
}
