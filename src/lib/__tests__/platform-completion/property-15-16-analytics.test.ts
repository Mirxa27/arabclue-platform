/**
 * Feature: platform-completion
 * Property 15: Analytics event provenance and minimization
 * Property 16: Analytics aggregates match the reference model
 */

import { describe, expect, test } from "bun:test";
import {
  ANALYTICS_EVENT_TYPES,
  aggregateAnalyticsEvents,
  findForbiddenAnalyticsField,
  medianDurationMs,
  type AnalyticsAggregateEvent,
  type AnalyticsEventType,
} from "../../analytics-collector";

describe("Feature: platform-completion, Property 15: Analytics event provenance and minimization", () => {
  test("accepted metadata never carries monetary or document-body fields across 100+ cases", () => {
    let cases = 0;
    for (let seed = 0; seed < 120; seed++) {
      const safe = {
        exportFormat: seed % 2 === 0 ? "pdf" : "xlsx",
        sectionType: `section_${seed % 5}`,
        agentId: `agent-${seed}`,
        count: seed,
      };
      expect(findForbiddenAnalyticsField(safe)).toBeNull();

      const forbiddenKey =
        seed % 4 === 0
          ? "amount"
          : seed % 4 === 1
            ? "documentBody"
            : seed % 4 === 2
              ? "bidTotal"
              : "content";
      const unsafe = { ...safe, [forbiddenKey]: seed % 4 === 3 ? "# body" : 99 };
      expect(findForbiddenAnalyticsField(unsafe)).toBe(forbiddenKey);
      cases += 1;
    }
    expect(cases).toBeGreaterThanOrEqual(100);
  });
});

describe("Feature: platform-completion, Property 16: Analytics aggregates match the reference model", () => {
  test("counts and medians match a tenant-scoped reference aggregation across 100+ sets", () => {
    let cases = 0;
    const base = new Date("2026-07-01T00:00:00.000Z").getTime();

    for (let seed = 0; seed < 120; seed++) {
      const events: AnalyticsAggregateEvent[] = [];
      const eventCount = 5 + (seed % 20);

      for (let i = 0; i < eventCount; i++) {
        const eventType = ANALYTICS_EVENT_TYPES[
          (seed + i) % ANALYTICS_EVENT_TYPES.length
        ] as AnalyticsEventType;
        events.push({
          eventType,
          entityId: `entity-${seed}-${i % 3}`,
          createdAt: new Date(base + i * 60_000),
        });
      }

      // Pair an agent run when the seed allows it.
      if (seed % 2 === 0) {
        const runId = `run-${seed}`;
        events.push({
          eventType: "agent_run_started",
          entityId: runId,
          createdAt: new Date(base + 1_000),
        });
        events.push({
          eventType: seed % 4 === 0 ? "agent_run_completed" : "agent_run_failed",
          entityId: runId,
          createdAt: new Date(base + 1_000 + (10 + (seed % 50)) * 1_000),
        });
      }

      const result = aggregateAnalyticsEvents(events);

      // Reference model: count every vocabulary type independently.
      for (const type of ANALYTICS_EVENT_TYPES) {
        const expected = events.filter((e) => e.eventType === type).length;
        expect(result.countsByType[type]).toBe(expected);
      }

      // Reference median from earliest start/terminal pairing.
      const starts = new Map<string, number>();
      const terminals = new Map<string, number>();
      for (const event of events) {
        if (event.eventType === "agent_run_started") {
          const t = event.createdAt.getTime();
          if (!starts.has(event.entityId) || t < starts.get(event.entityId)!) {
            starts.set(event.entityId, t);
          }
        }
        if (
          event.eventType === "agent_run_completed" ||
          event.eventType === "agent_run_failed" ||
          event.eventType === "agent_run_cancelled"
        ) {
          const t = event.createdAt.getTime();
          if (
            !terminals.has(event.entityId) ||
            t < terminals.get(event.entityId)!
          ) {
            terminals.set(event.entityId, t);
          }
        }
      }
      const durations: number[] = [];
      for (const [id, start] of starts) {
        const end = terminals.get(id);
        if (end !== undefined && end >= start) {
          durations.push(Math.round(end - start));
        }
      }
      expect(result.medianAgentDurationMs).toBe(medianDurationMs(durations));
      expect(result.agentDurationSampleSize).toBe(durations.length);
      cases += 1;
    }

    expect(cases).toBeGreaterThanOrEqual(100);
  });
});
