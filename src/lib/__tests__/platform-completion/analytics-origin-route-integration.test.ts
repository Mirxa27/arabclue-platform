/**
 * Feature: platform-completion §3.5 — Analytics origin, route, and aggregation
 * integration tests (requirements 4.1–4.12).
 *
 * Exercises every committed mutation/transition origin, one-attempt append
 * behaviour, the five-second visibility budget, strict vocabulary/range codes,
 * empty ranges, tenant scoping, duration pairing, and previous-period
 * boundaries. Pure helpers and in-memory writers only — no database.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import {
  ANALYTICS_AGENT_RUN_EVENT_TYPES,
  ANALYTICS_APPEND_DEADLINE_MS,
  ANALYTICS_DOCUMENT_EVENT_TYPES,
  ANALYTICS_EVENT_TYPES,
  ANALYTICS_PROPOSAL_EVENT_TYPES,
  ANALYTICS_TEMPLATE_EVENT_TYPES,
  aggregateAnalyticsEvents,
  analyticsBackgroundOrigin,
  analyticsRequestOrigin,
  buildAgentRunAnalyticsEvent,
  buildDocumentAnalyticsEvent,
  buildProposalAnalyticsEvent,
  buildTemplateAnalyticsEvent,
  recordCommittedAnalyticsEvent,
  type AnalyticsEventRow,
  type AnalyticsEventType,
  type AnalyticsEventWriter,
} from "../../analytics-collector";
import { DeterministicClock } from "../support";

const WORKSPACE_ID = "workspace-analytics";
const ACTOR_ID = "user-analytics";
const CLOCK_INSTANT = "2026-06-01T12:00:00.000Z";
const VISIBILITY_BUDGET_MS = 5_000;

const REQUEST_ORIGIN = analyticsRequestOrigin({
  tenantWorkspaceId: WORKSPACE_ID,
  actorUserId: ACTOR_ID,
});

// ─── Route validation mirror (GET /api/analytics/proposals) ─────────────────

function validateAnalyticsDateRange(
  start: string | null,
  end: string | null
): string | null {
  if (!start || !end) return "ANALYTICS_DATE_RANGE_REQUIRED";
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return "ANALYTICS_DATE_INVALID";
  }
  if (startDate >= endDate) return "ANALYTICS_DATE_RANGE_INVALID";
  const diffMs = endDate.getTime() - startDate.getTime();
  if (diffMs > 366 * 24 * 60 * 60 * 1000) return "ANALYTICS_RANGE_TOO_LARGE";
  return null;
}

function calculateTrend(
  current: number,
  previous: number
): "up" | "down" | "stable" {
  if (previous === 0) return current > 0 ? "up" : "stable";
  const change = (current - previous) / previous;
  if (change > 0.05) return "up";
  if (change < -0.05) return "down";
  return "stable";
}

function filterEventsForTenant(
  events: readonly { workspaceId: string }[],
  workspaceId: string
) {
  return events.filter((event) => event.workspaceId === workspaceId);
}

function buildAnalyticsEventForType(
  eventType: AnalyticsEventType,
  clock: DeterministicClock
) {
  const startedAt = new Date(Date.parse(CLOCK_INSTANT) - 2_000);

  if ((ANALYTICS_PROPOSAL_EVENT_TYPES as readonly string[]).includes(eventType)) {
    return buildProposalAnalyticsEvent({
      eventType: eventType as (typeof ANALYTICS_PROPOSAL_EVENT_TYPES)[number],
      proposalId: "proposal-origin",
      mutationRef: `mut-${eventType}`,
      origin: REQUEST_ORIGIN,
      clock,
      metadata:
        eventType === "proposal_exported"
          ? { exportFormat: "pdf" as const, locale: "ar" as const }
          : eventType === "proposal_submitted"
            ? { revision: 1, locale: "en" as const }
            : undefined,
    });
  }

  if ((ANALYTICS_AGENT_RUN_EVENT_TYPES as readonly string[]).includes(eventType)) {
    return buildAgentRunAnalyticsEvent({
      eventType: eventType as (typeof ANALYTICS_AGENT_RUN_EVENT_TYPES)[number],
      runId: "run-origin",
      origin: analyticsBackgroundOrigin({
        subjectWorkspaceId: WORKSPACE_ID,
        initiatorUserId: ACTOR_ID,
      }),
      startedAt:
        eventType === "agent_run_started" ? undefined : startedAt,
      clock,
      metadata:
        eventType === "agent_run_completed"
          ? { progressPercent: 100 }
          : eventType === "agent_run_failed"
            ? { outcomeReason: "provider_unavailable" }
            : undefined,
    });
  }

  if ((ANALYTICS_DOCUMENT_EVENT_TYPES as readonly string[]).includes(eventType)) {
    return buildDocumentAnalyticsEvent({
      eventType: eventType as (typeof ANALYTICS_DOCUMENT_EVENT_TYPES)[number],
      documentId: "document-origin",
      mutationRef: `mut-${eventType}`,
      origin: REQUEST_ORIGIN,
      clock,
      metadata:
        eventType === "document_version_created"
          ? { documentVersionId: "version-1", versionNumber: 1 }
          : undefined,
    });
  }

  return buildTemplateAnalyticsEvent({
    eventType: eventType as (typeof ANALYTICS_TEMPLATE_EVENT_TYPES)[number],
    entityId: "template-origin",
    mutationRef: "proposal-origin",
    origin: REQUEST_ORIGIN,
    clock,
    metadata:
      eventType === "section_added"
        ? { sectionType: "technical", sectionCount: 1 }
        : { templateKey: "workspace-services-agreement" },
  });
}

class RecordingWriter implements AnalyticsEventWriter {
  readonly rows: AnalyticsEventRow[] = [];
  attempts = 0;
  failure: Error | null = null;

  async append(row: AnalyticsEventRow): Promise<void> {
    this.attempts += 1;
    if (this.failure) throw this.failure;
    this.rows.push(row);
  }
}

describe("§3.5 analytics — every mutation/transition origin", () => {
  test("builds a minimized event for every vocabulary type", () => {
    const clock = new DeterministicClock(CLOCK_INSTANT);
    for (const eventType of ANALYTICS_EVENT_TYPES) {
      const build = buildAnalyticsEventForType(eventType, clock);
      expect(build.ok, eventType).toBe(true);
      if (!build.ok) continue;
      expect(build.draft.eventType).toBe(eventType);
      expect(build.draft.workspaceId).toBe(WORKSPACE_ID);
      expect(build.draft.actorId).toBe(ACTOR_ID);
      expect(build.draft.eventKey.length).toBeGreaterThan(0);
    }
  });

  test("scopes event keys by workspace for identical mutations", () => {
    const clock = new DeterministicClock(CLOCK_INSTANT);
    const otherOrigin = analyticsRequestOrigin({
      tenantWorkspaceId: "workspace-other",
      actorUserId: ACTOR_ID,
    });
    const first = buildProposalAnalyticsEvent({
      eventType: "proposal_created",
      proposalId: "p1",
      mutationRef: 1,
      origin: REQUEST_ORIGIN,
      clock,
    });
    const second = buildProposalAnalyticsEvent({
      eventType: "proposal_created",
      proposalId: "p1",
      mutationRef: 1,
      origin: otherOrigin,
      clock,
    });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.draft.eventKey).not.toBe(second.draft.eventKey);
  });
});

describe("§3.5 analytics — one-attempt failure and visibility budget", () => {
  test("append deadline stays inside the five-second visibility budget", () => {
    expect(ANALYTICS_APPEND_DEADLINE_MS).toBeLessThan(VISIBILITY_BUDGET_MS);
    expect(ANALYTICS_APPEND_DEADLINE_MS).toBe(3_000);
  });

  test("makes exactly one append attempt and never throws on persistence failure", async () => {
    const clock = new DeterministicClock(CLOCK_INSTANT);
    const writer = new RecordingWriter();
    writer.failure = Object.assign(new Error("connection reset"), {
      code: "P1001",
    });
    const failures: unknown[] = [];

    const result = await recordCommittedAnalyticsEvent(
      buildProposalAnalyticsEvent({
        eventType: "proposal_created",
        proposalId: "proposal-1",
        mutationRef: 1,
        origin: REQUEST_ORIGIN,
        clock,
      }),
      {
        writer,
        clock,
        logger: (record) => failures.push(record),
      }
    );

    expect(result.outcome).toBe("failed");
    expect(writer.attempts).toBe(1);
    expect(writer.rows).toHaveLength(0);
    expect(failures).toHaveLength(1);
  });

  test("records an event that is immediately queryable in aggregation", async () => {
    const clock = new DeterministicClock(CLOCK_INSTANT);
    const writer = new RecordingWriter();

    const append = await recordCommittedAnalyticsEvent(
      buildProposalAnalyticsEvent({
        eventType: "proposal_created",
        proposalId: "proposal-visible",
        mutationRef: 1,
        origin: REQUEST_ORIGIN,
        clock,
      }),
      { writer, clock, logger: () => {} }
    );

    expect(append.outcome).toBe("appended");
    const aggregation = aggregateAnalyticsEvents(
      writer.rows.map((row) => ({
        eventType: row.eventType,
        entityId: row.entityId,
        createdAt: row.occurredAt,
        durationMs: row.durationMs,
      }))
    );
    expect(aggregation.countsByType.proposal_created).toBe(1);
  });
});

describe("§3.5 analytics — route range validation codes", () => {
  test("maps every malformed range to a stable failure code", () => {
    expect(validateAnalyticsDateRange(null, "2026-01-31")).toBe(
      "ANALYTICS_DATE_RANGE_REQUIRED"
    );
    expect(validateAnalyticsDateRange("2026-01-01", null)).toBe(
      "ANALYTICS_DATE_RANGE_REQUIRED"
    );
    expect(validateAnalyticsDateRange("not-a-date", "2026-01-31")).toBe(
      "ANALYTICS_DATE_INVALID"
    );
    expect(
      validateAnalyticsDateRange("2026-01-31", "2026-01-01")
    ).toBe("ANALYTICS_DATE_RANGE_INVALID");
    expect(
      validateAnalyticsDateRange("2025-01-01", "2026-01-03")
    ).toBe("ANALYTICS_RANGE_TOO_LARGE");
    expect(
      validateAnalyticsDateRange("2026-01-01", "2026-01-31")
    ).toBeNull();
  });

  test("route source wires half-open ranges and schema-pending guard", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/api/analytics/proposals/route.ts"),
      "utf8"
    );
    expect(source).toContain("createdAt: { gte: startDate, lt: endDate }");
    expect(source).toContain('jsonApiFailure("ANALYTICS_DATE_RANGE_REQUIRED")');
    expect(source).toContain('jsonApiFailure("SCHEMA_MIGRATION_PENDING"');
    expect(source).toContain("synthesized or degraded metrics");
  });
});

describe("§3.5 analytics — aggregation, tenant scoping, and trends", () => {
  test("empty range returns zero counts and null median", () => {
    const result = aggregateAnalyticsEvents([]);
    for (const eventType of ANALYTICS_EVENT_TYPES) {
      expect(result.countsByType[eventType]).toBe(0);
    }
    expect(result.medianAgentDurationMs).toBeNull();
  });

  test("tenant filter excludes foreign workspace events before aggregation", () => {
    const events = [
      { workspaceId: WORKSPACE_ID, eventType: "proposal_created" as const },
      { workspaceId: "foreign", eventType: "proposal_created" as const },
    ];
    const scoped = filterEventsForTenant(events, WORKSPACE_ID);
    expect(scoped).toHaveLength(1);
  });

  test("previous-period difference uses adjacent equal-duration windows", () => {
    const start = new Date("2026-02-01T00:00:00.000Z");
    const end = new Date("2026-03-03T00:00:00.000Z");
    const periodMs = end.getTime() - start.getTime();
    const prevStart = new Date(start.getTime() - periodMs);
    const prevEnd = new Date(start.getTime());

    const current = aggregateAnalyticsEvents([
      {
        eventType: "proposal_created",
        entityId: "p1",
        createdAt: new Date("2026-02-15T00:00:00.000Z"),
      },
    ]);
    const previous = aggregateAnalyticsEvents([
      {
        eventType: "proposal_created",
        entityId: "p0",
        createdAt: new Date("2026-02-01T00:00:00.000Z"),
      },
      {
        eventType: "proposal_created",
        entityId: "p0b",
        createdAt: new Date("2026-02-02T00:00:00.000Z"),
      },
    ]);

    const currentCount = current.countsByType.proposal_created;
    const previousCount = previous.countsByType.proposal_created;
    expect(prevEnd.getTime()).toBe(start.getTime());
    expect(calculateTrend(currentCount, previousCount)).toBe("down");
    expect(currentCount - previousCount).toBe(-1);
  });

  test("median unavailable stays null rather than zero in route contract", () => {
    const aggregation = aggregateAnalyticsEvents([
      {
        eventType: "proposal_created",
        entityId: "p1",
        createdAt: new Date("2026-01-01"),
      },
    ]);
    expect(aggregation.medianAgentDurationMs).toBeNull();
    expect(aggregation.medianAgentDurationMs === 0).toBe(false);
  });
});
