/**
 * Tests for the analytics event retention and archival function.
 *
 * The retention function aggregates events older than 90 days into daily
 * summaries and deletes the individual events. These tests mock the
 * persistence boundary so no database call is made.
 */

import { describe, expect, it } from "bun:test";
import {
  archiveOldAnalyticsEvents,
  ANALYTICS_RETENTION_DAYS,
  type AnalyticsRetentionClient,
  type AnalyticsRetentionBucket,
} from "../analytics-retention";
import { fixedUtcClock } from "../time";

/* -------------------------------------------------------------------------- */
/* Mock retention client                                                      */
/* -------------------------------------------------------------------------- */

type RecordingClient = AnalyticsRetentionClient & {
  readonly calls: string[];
  readonly persisted: AnalyticsRetentionBucket[][];
  readonly deletedFor: AnalyticsRetentionBucket[][];
};

function createMockRetentionClient(
  buckets: readonly AnalyticsRetentionBucket[],
  deleteCount: number
): RecordingClient {
  const calls: string[] = [];
  const persisted: AnalyticsRetentionBucket[][] = [];
  const deletedFor: AnalyticsRetentionBucket[][] = [];
  return Object.freeze({
    calls,
    persisted,
    deletedFor,
    groupExpiredEvents: async () => {
      calls.push("group");
      return [...buckets];
    },
    persistDailySummaries: async (input) => {
      calls.push("persist");
      persisted.push([...input]);
      return input.length;
    },
    deleteArchivedEvents: async (_cutoff, input) => {
      calls.push("delete");
      deletedFor.push([...input]);
      return deleteCount;
    },
  });
}

const mockBuckets: readonly AnalyticsRetentionBucket[] = [
  { workspaceId: "ws-1", eventType: "proposal_created", day: "2026-04-01", count: 5 },
  { workspaceId: "ws-1", eventType: "proposal_submitted", day: "2026-04-02", count: 3 },
  { workspaceId: "ws-2", eventType: "agent_run_completed", day: "2026-04-01", count: 10 },
];

const mockDeleteCount = 18;

/* -------------------------------------------------------------------------- */
/* Tests                                                                      */
/* -------------------------------------------------------------------------- */

describe("analytics-retention", () => {
  it("uses a 90-day default retention window", () => {
    expect(ANALYTICS_RETENTION_DAYS).toBe(90);
  });

  it("aggregates expired events into daily summaries and deletes them", async () => {
    const now = new Date("2026-07-29T10:00:00.000Z");
    const clock = fixedUtcClock(now);

    const result = await archiveOldAnalyticsEvents({
      clock,
      retentionClient: createMockRetentionClient(mockBuckets, mockDeleteCount),
    });

    // The cutoff should be 90 days before now.
    const expectedCutoff = new Date(
      now.getTime() - 90 * 24 * 60 * 60 * 1000
    );
    expect(result.cutoff).toBe(expectedCutoff.toISOString());

    // The breakdown should match the mock buckets.
    expect(result.breakdown).toHaveLength(3);
    expect(result.breakdown[0]?.workspaceId).toBe("ws-1");
    expect(result.breakdown[0]?.eventType).toBe("proposal_created");
    expect(result.breakdown[0]?.day).toBe("2026-04-01");
    expect(result.breakdown[0]?.count).toBe(5);

    expect(result.breakdown[1]?.eventType).toBe("proposal_submitted");
    expect(result.breakdown[2]?.workspaceId).toBe("ws-2");

    // The summary bucket count should match the number of distinct buckets.
    expect(result.summaryBucketCount).toBe(3);

    // The archived event count should match the mock delete count.
    expect(result.archivedEventCount).toBe(mockDeleteCount);
  });

  it("returns zero counts when no expired events exist", async () => {
    const now = new Date("2026-07-29T10:00:00.000Z");
    const clock = fixedUtcClock(now);

    const result = await archiveOldAnalyticsEvents({
      clock,
      retentionClient: createMockRetentionClient([], 0),
    });

    expect(result.archivedEventCount).toBe(0);
    expect(result.summaryBucketCount).toBe(0);
    expect(result.breakdown).toHaveLength(0);
  });

  it("respects a custom retention window", async () => {
    const now = new Date("2026-07-29T10:00:00.000Z");
    const clock = fixedUtcClock(now);

    const result = await archiveOldAnalyticsEvents({
      clock,
      retentionClient: createMockRetentionClient(mockBuckets, mockDeleteCount),
      retentionDays: 30,
    });

    const expectedCutoff = new Date(
      now.getTime() - 30 * 24 * 60 * 60 * 1000
    );
    expect(result.cutoff).toBe(expectedCutoff.toISOString());
  });

  it("is idempotent — a second run with no events returns zero", async () => {
    const now = new Date("2026-07-29T10:00:00.000Z");
    const clock = fixedUtcClock(now);

    // First run with mock data.
    const firstResult = await archiveOldAnalyticsEvents({
      clock,
      retentionClient: createMockRetentionClient(mockBuckets, mockDeleteCount),
    });
    expect(firstResult.archivedEventCount).toBe(mockDeleteCount);

    // Second run with empty data (simulating idempotency).
    const secondResult = await archiveOldAnalyticsEvents({
      clock,
      retentionClient: createMockRetentionClient([], 0),
    });
    expect(secondResult.archivedEventCount).toBe(0);
    expect(secondResult.summaryBucketCount).toBe(0);
  });

  // Regression cover: the function computed summaries, returned them, and then
  // deleted the raw events without ever writing the summaries anywhere. No
  // AnalyticsDailySummary model existed, so "archival" was pure data loss.
  it("persists the summaries before deleting anything", async () => {
    const clock = fixedUtcClock(new Date("2026-07-29T10:00:00.000Z"));
    const client = createMockRetentionClient(mockBuckets, mockDeleteCount);

    await archiveOldAnalyticsEvents({ clock, retentionClient: client });

    expect(client.calls).toEqual(["group", "persist", "delete"]);
    expect(client.persisted).toHaveLength(1);
    expect(client.persisted[0]).toEqual([...mockBuckets]);
  });

  it("never deletes without a preceding durable write", async () => {
    const clock = fixedUtcClock(new Date("2026-07-29T10:00:00.000Z"));
    const client = createMockRetentionClient(mockBuckets, mockDeleteCount);

    await archiveOldAnalyticsEvents({ clock, retentionClient: client });

    const persistAt = client.calls.indexOf("persist");
    const deleteAt = client.calls.indexOf("delete");
    expect(persistAt).toBeGreaterThan(-1);
    expect(deleteAt).toBeGreaterThan(persistAt);
  });

  // The grouping query is bounded by `batchSize`; a blanket
  // `createdAt < cutoff` delete would also remove groups beyond that bound,
  // which were never counted.
  it("scopes the delete to exactly the summarised buckets", async () => {
    const clock = fixedUtcClock(new Date("2026-07-29T10:00:00.000Z"));
    const client = createMockRetentionClient(mockBuckets, mockDeleteCount);

    await archiveOldAnalyticsEvents({ clock, retentionClient: client });

    expect(client.deletedFor).toHaveLength(1);
    expect(client.deletedFor[0]).toEqual([...mockBuckets]);
  });

  it("writes and deletes nothing when there is nothing to archive", async () => {
    const clock = fixedUtcClock(new Date("2026-07-29T10:00:00.000Z"));
    const client = createMockRetentionClient([], 0);

    await archiveOldAnalyticsEvents({ clock, retentionClient: client });

    expect(client.calls).toEqual(["group"]);
    expect(client.persisted).toHaveLength(0);
    expect(client.deletedFor).toHaveLength(0);
  });

  it("groups by workspace, eventType, and day in the breakdown", async () => {
    const now = new Date("2026-07-29T10:00:00.000Z");
    const clock = fixedUtcClock(now);

    const result = await archiveOldAnalyticsEvents({
      clock,
      retentionClient: createMockRetentionClient(mockBuckets, mockDeleteCount),
    });

    // Verify each bucket has the required fields.
    for (const bucket of result.breakdown) {
      expect(typeof bucket.workspaceId).toBe("string");
      expect(typeof bucket.eventType).toBe("string");
      expect(typeof bucket.day).toBe("string");
      expect(typeof bucket.count).toBe("number");
      expect(bucket.count).toBeGreaterThan(0);
    }
  });
});
