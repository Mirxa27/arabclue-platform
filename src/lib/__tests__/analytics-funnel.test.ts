/**
 * The funnel started at "proposal created": nothing recorded that an account
 * was registered, verified, or opened its first project, and nothing read the
 * retention summaries back, so a 90-day or 1-year period silently stopped at
 * the retention cutoff.
 *
 * Asserted here: the activation vocabulary is closed and labelled like every
 * other family, the constructor keeps payloads minimal, the funnel block is
 * derived from the per-type counts, and the read side unions raw GROUP BY
 * counts with archived daily summaries — against an in-memory client.
 */

import { describe, expect, test } from "bun:test";
import {
  ANALYTICS_ACTIVATION_EVENT_TYPES,
  ANALYTICS_ACTIVATION_FUNNEL,
  ANALYTICS_EVENT_TYPES,
  activationFunnelFromCounts,
  analyticsEntityTypeFor,
  analyticsEventLabelKey,
  analyticsRequestOrigin,
  buildActivationAnalyticsEvent,
  isAnalyticsEventType,
} from "../analytics-collector";
import {
  addCountsByType,
  countEventsByType,
  emptyCountsByType,
  retentionCutoff,
  summaryDayRange,
  type AnalyticsReadClient,
} from "../analytics-read";
import { ANALYTICS_RETENTION_DAYS } from "../analytics-retention";
import { localizationRegistry } from "../i18n";

const DAY_MS = 24 * 60 * 60 * 1000;
const ORIGIN = analyticsRequestOrigin({ tenantWorkspaceId: "ws-1", actorUserId: "u-1" });

describe("activation vocabulary", () => {
  test("the five top-of-funnel transitions are closed vocabulary values", () => {
    expect([...ANALYTICS_ACTIVATION_EVENT_TYPES]).toEqual([
      "account_registered",
      "email_verified",
      "project_created",
      "checkout_started",
      "checkout_completed",
    ]);
    for (const eventType of ANALYTICS_ACTIVATION_EVENT_TYPES) {
      expect(isAnalyticsEventType(eventType)).toBe(true);
      expect(ANALYTICS_EVENT_TYPES).toContain(eventType);
    }
  });

  test("each derives one entity type and one bilingual label", () => {
    expect(analyticsEntityTypeFor("account_registered")).toBe("account");
    expect(analyticsEntityTypeFor("email_verified")).toBe("account");
    expect(analyticsEntityTypeFor("project_created")).toBe("project");
    expect(analyticsEntityTypeFor("checkout_started")).toBe("checkout");
    expect(analyticsEntityTypeFor("checkout_completed")).toBe("checkout");
    for (const eventType of ANALYTICS_ACTIVATION_EVENT_TYPES) {
      const pair = localizationRegistry[analyticsEventLabelKey(eventType)];
      expect(pair.ar.trim().length).toBeGreaterThan(0);
      expect(pair.en.trim().length).toBeGreaterThan(0);
    }
  });

  test("the constructor accepts closed values and rejects a monetary payload", () => {
    const accepted = buildActivationAnalyticsEvent({
      eventType: "checkout_started",
      entityId: "chk-1",
      mutationRef: "chk-1",
      origin: ORIGIN,
      metadata: { planId: "plan-pro", billingCycle: "YEARLY" },
    });
    expect(accepted.ok).toBe(true);
    if (accepted.ok) {
      expect(accepted.draft.entityType).toBe("checkout");
      expect(accepted.draft.durationMs).toBeNull();
      expect(accepted.draft.metadata).toEqual({ billingCycle: "YEARLY", planId: "plan-pro" });
    }

    const rejected = buildActivationAnalyticsEvent({
      eventType: "checkout_completed",
      entityId: "chk-1",
      mutationRef: "pay-1",
      origin: ORIGIN,
      metadata: { amount: 499 } as never,
    });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.reason).toBe("metadata_invalid");
  });

  test("the same committed mutation derives the same key", () => {
    const build = () =>
      buildActivationAnalyticsEvent({
        eventType: "account_registered",
        entityId: "u-1",
        mutationRef: "u-1",
        origin: ORIGIN,
        metadata: { locale: "ar" },
      });
    const first = build();
    const second = build();
    expect(first.ok && second.ok && first.draft.eventKey === second.draft.eventKey).toBe(true);
  });
});

describe("activation funnel block", () => {
  test("stages are in funnel order and read from the per-type counts", () => {
    const counts = {
      ...emptyCountsByType(),
      account_registered: 4,
      email_verified: 3,
      project_created: 2,
      document_uploaded: 2,
      agent_run_started: 1,
      proposal_exported: 0,
    };

    const stages = activationFunnelFromCounts(counts);

    expect(stages.map((s) => s.key)).toEqual([
      "registered",
      "verified",
      "first_project",
      "first_document",
      "first_run",
      "first_export",
    ]);
    expect(stages.map((s) => s.count)).toEqual([4, 3, 2, 2, 1, 0]);
    expect(stages.map((s) => s.conversion)).toEqual([1, 0.75, 0.5, 0.5, 0.25, 0]);
    expect(ANALYTICS_ACTIVATION_FUNNEL.every((s) => isAnalyticsEventType(s.eventType))).toBe(true);
  });

  test("with nothing registered every conversion is unavailable, not zero", () => {
    const stages = activationFunnelFromCounts({ ...emptyCountsByType(), project_created: 2 });
    expect(stages.every((s) => s.conversion === null)).toBe(true);
    expect(stages.find((s) => s.key === "first_project")?.count).toBe(2);
  });
});

describe("archived days are read back into the counts", () => {
  const now = new Date("2026-09-01T12:00:00.000Z");
  const cutoff = retentionCutoff(now);

  test("only whole days inside the range and not past the cutoff day", () => {
    const start = new Date(cutoff.getTime() - 10 * DAY_MS - 6 * 60 * 60 * 1000);
    const range = summaryDayRange(start, now, cutoff);

    expect(range).not.toBeNull();
    // A range starting mid-day begins with the next whole day…
    expect(range!.gte.toISOString()).toBe(
      new Date(Math.ceil(start.getTime() / DAY_MS) * DAY_MS).toISOString()
    );
    // …and stops after the cutoff's own day: later days were never archived.
    const cutoffDay = new Date(Math.floor(cutoff.getTime() / DAY_MS) * DAY_MS);
    expect(range!.lt.getTime()).toBe(cutoffDay.getTime() + DAY_MS);
  });

  test("a range entirely inside the retention window reads no summaries", () => {
    const start = new Date(now.getTime() - 7 * DAY_MS);
    expect(summaryDayRange(start, now, cutoff)).toBeNull();
    expect(ANALYTICS_RETENTION_DAYS).toBe(90);
  });

  test("raw GROUP BY counts and summary sums add up per type", async () => {
    // Arrange: 2 raw proposal_created inside the window, 5 archived ones and
    // 1 archived account_registered on days before the cutoff.
    const groupByCalls: string[] = [];
    const client = {
      analyticsEvent: {
        async groupBy(args: { where: { workspaceId: string } }) {
          groupByCalls.push(`raw:${args.where.workspaceId}`);
          return [
            { eventType: "proposal_created", _count: { _all: 2 } },
            { eventType: "not_in_vocabulary", _count: { _all: 9 } },
          ];
        },
      },
      analyticsDailySummary: {
        async groupBy(args: { where: { workspaceId: string; day: { gte: Date; lt: Date } } }) {
          groupByCalls.push(`summary:${args.where.workspaceId}`);
          expect(args.where.day.gte.getTime()).toBeLessThan(args.where.day.lt.getTime());
          return [
            { eventType: "proposal_created", _sum: { eventCount: 5 } },
            { eventType: "account_registered", _sum: { eventCount: 1 } },
          ];
        },
      },
      $queryRaw: async () => [],
    } as unknown as AnalyticsReadClient;
    const start = new Date(now.getTime() - 365 * DAY_MS);

    // Act
    const counts = await countEventsByType(client, "ws-1", start, now, now);

    // Assert
    expect(groupByCalls.sort()).toEqual(["raw:ws-1", "summary:ws-1"]);
    expect(counts.proposal_created).toBe(7);
    expect(counts.account_registered).toBe(1);
    expect(counts.proposal_exported).toBe(0);
    expect(Object.keys(counts).sort()).toEqual([...ANALYTICS_EVENT_TYPES].sort());
  });

  test("adding count tables never introduces a type outside the vocabulary", () => {
    const total = addCountsByType(
      { proposal_created: 1 },
      { proposal_created: 2, email_verified: 3 },
      { unknown_type: 99 } as never
    );
    expect(total.proposal_created).toBe(3);
    expect(total.email_verified).toBe(3);
    expect("unknown_type" in total).toBe(false);
  });
});
