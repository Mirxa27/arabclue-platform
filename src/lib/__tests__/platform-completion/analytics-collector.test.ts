/**
 * Feature: platform-completion — closed analytics vocabulary, typed event
 * constructors, and the single bounded post-commit append attempt
 * (requirements 4.1 – 4.6, 4.10, 4.12).
 *
 * Every test drives the real domain module with an in-memory writer, an
 * injected clock, and an immediate deadline scheduler: no network call, no
 * database connection, no shared-database mutation.
 */

import { beforeEach, describe, expect, test } from "bun:test";
import {
  ANALYTICS_AGENT_RUN_EVENT_TYPES,
  ANALYTICS_AGENT_TERMINAL_EVENT_TYPES,
  ANALYTICS_DOCUMENT_EVENT_TYPES,
  ANALYTICS_ENTITY_TYPES,
  ANALYTICS_EVENT_TYPES,
  ANALYTICS_EXPORT_FORMATS,
  ANALYTICS_PROPOSAL_EVENT_TYPES,
  ANALYTICS_TEMPLATE_EVENT_TYPES,
  analyticsBackgroundOrigin,
  analyticsEntityTypeFor,
  analyticsEventCarriesDuration,
  analyticsEventLabelKey,
  analyticsEventTypeSchema,
  analyticsRequestOrigin,
  buildAgentRunAnalyticsEvent,
  buildDocumentAnalyticsEvent,
  buildProposalAnalyticsEvent,
  buildTemplateAnalyticsEvent,
  deriveAnalyticsEventKey,
  findForbiddenAnalyticsField,
  isAnalyticsEventType,
  isUniqueEventKeyConflict,
  medianDurationMs,
  recordCommittedAnalyticsEvent,
  resolveAnalyticsProvenance,
  type AnalyticsEventRow,
  type AnalyticsEventWriter,
  type AnalyticsFailureRecord,
} from "../../analytics-collector";
// Type-only import: binds the recorded export channel to the real download route
// union without loading the route module at runtime.
import type { ProposalDownloadFormat } from "../../../app/api/proposals/[id]/download/route";
import { DYNAMIC_TRANSLATION_KEY_MANIFEST, localizationRegistry } from "../../i18n";
import { DeterministicClock } from "../support";

const WORKSPACE_ID = "workspace-1";
const OTHER_WORKSPACE_ID = "workspace-2";
const ACTOR_ID = "user-1";
const CLOCK_INSTANT = "2026-05-01T09:00:00.000Z";

const REQUEST_ORIGIN = analyticsRequestOrigin({
  tenantWorkspaceId: WORKSPACE_ID,
  actorUserId: ACTOR_ID,
});

class RecordingWriter implements AnalyticsEventWriter {
  readonly rows: AnalyticsEventRow[] = [];
  private readonly keys = new Set<string>();
  attempts = 0;
  failure: Error | null = null;

  async append(row: AnalyticsEventRow): Promise<void> {
    this.attempts += 1;
    if (this.failure) throw this.failure;
    if (this.keys.has(row.eventKey)) {
      throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    }
    this.keys.add(row.eventKey);
    this.rows.push(row);
  }
}

function appendOptions(writer: AnalyticsEventWriter, clock: DeterministicClock) {
  const failures: AnalyticsFailureRecord[] = [];
  return {
    options: {
      writer,
      clock,
      logger: (record: AnalyticsFailureRecord) => failures.push(record),
    },
    failures,
  };
}

describe("closed analytics event vocabulary (criterion 4.10)", () => {
  test("composes the vocabulary from the declared subject families only", () => {
    expect([...ANALYTICS_EVENT_TYPES]).toEqual([
      ...ANALYTICS_PROPOSAL_EVENT_TYPES,
      ...ANALYTICS_AGENT_RUN_EVENT_TYPES,
      ...ANALYTICS_DOCUMENT_EVENT_TYPES,
      ...ANALYTICS_TEMPLATE_EVENT_TYPES,
    ]);
    expect(new Set(ANALYTICS_EVENT_TYPES).size).toBe(ANALYTICS_EVENT_TYPES.length);
  });

  test("accepts every vocabulary value and rejects anything outside it", () => {
    for (const eventType of ANALYTICS_EVENT_TYPES) {
      expect(analyticsEventTypeSchema.safeParse(eventType).success).toBe(true);
      expect(isAnalyticsEventType(eventType)).toBe(true);
    }
    for (const outside of ["proposal_viewed", "proposal_builder_opened", "", "PROPOSAL_CREATED"]) {
      expect(analyticsEventTypeSchema.safeParse(outside).success).toBe(false);
      expect(isAnalyticsEventType(outside)).toBe(false);
    }
  });

  test("derives one closed entity type per vocabulary value", () => {
    for (const eventType of ANALYTICS_EVENT_TYPES) {
      expect(ANALYTICS_ENTITY_TYPES).toContain(analyticsEntityTypeFor(eventType));
    }
    expect(analyticsEntityTypeFor("proposal_exported")).toBe("proposal");
    expect(analyticsEntityTypeFor("agent_run_failed")).toBe("agent_run");
    expect(analyticsEntityTypeFor("document_version_created")).toBe("document");
    expect(analyticsEntityTypeFor("template_used")).toBe("template");
    expect(analyticsEntityTypeFor("section_added")).toBe("section");
  });

  test("permits a duration only on a terminal agent transition", () => {
    for (const eventType of ANALYTICS_EVENT_TYPES) {
      const expected = (
        ANALYTICS_AGENT_TERMINAL_EVENT_TYPES as readonly string[]
      ).includes(eventType);
      expect(analyticsEventCarriesDuration(eventType)).toBe(expected);
    }
  });

  test("registers one bilingual label per vocabulary value and no orphan label", () => {
    const labelKeys = new Set<string>();
    for (const eventType of ANALYTICS_EVENT_TYPES) {
      const key = analyticsEventLabelKey(eventType);
      labelKeys.add(key);
      const pair = localizationRegistry[key];
      expect(pair.ar.trim().length).toBeGreaterThan(0);
      expect(pair.en.trim().length).toBeGreaterThan(0);
    }
    expect(labelKeys.size).toBe(ANALYTICS_EVENT_TYPES.length);
    expect(
      Object.values(DYNAMIC_TRANSLATION_KEY_MANIFEST.analyticsEvent).sort(),
    ).toEqual([...labelKeys].sort());
  });

  test("closes the export channel payload over the real download formats", () => {
    // Mirrors `ProposalDownloadFormat` in the download route, so no channel is
    // recorded that no export path produces and every produced channel is
    // recordable (criteria 4.6, 4.10).
    const downloadFormats: readonly ProposalDownloadFormat[] = [
      "zip",
      "pdf",
      "html",
      "xlsx",
      "xlsx-matrix",
      "xlsx-boq",
      "slides",
      "pptx",
      "manifest",
    ];
    expect([...ANALYTICS_EXPORT_FORMATS].sort()).toEqual(
      [...downloadFormats].sort(),
    );

    for (const exportFormat of ANALYTICS_EXPORT_FORMATS) {
      const build = buildProposalAnalyticsEvent({
        eventType: "proposal_exported",
        proposalId: "proposal-1",
        mutationRef: `${exportFormat}:sha256:abc`,
        origin: REQUEST_ORIGIN,
        clock: new DeterministicClock(CLOCK_INSTANT),
        metadata: { exportFormat },
      });
      expect(build.ok, exportFormat).toBe(true);
    }
  });
});

describe("workspace and actor provenance (criterion 4.5)", () => {
  test("resolves exactly one workspace and actor from a request origin", () => {
    expect(resolveAnalyticsProvenance(REQUEST_ORIGIN)).toEqual({
      ok: true,
      origin: "request",
      workspaceId: WORKSPACE_ID,
      actorId: ACTOR_ID,
    });
  });

  test("resolves the subject record's stored workspace and initiator for background work", () => {
    expect(
      resolveAnalyticsProvenance(
        analyticsBackgroundOrigin({
          subjectWorkspaceId: [WORKSPACE_ID, WORKSPACE_ID],
          initiatorUserId: ACTOR_ID,
        }),
      ),
    ).toEqual({
      ok: true,
      origin: "background",
      workspaceId: WORKSPACE_ID,
      actorId: ACTOR_ID,
    });
  });

  test("appends nothing when neither source resolves exactly one workspace", () => {
    expect(
      resolveAnalyticsProvenance(
        analyticsRequestOrigin({ tenantWorkspaceId: "  ", actorUserId: ACTOR_ID }),
      ),
    ).toEqual({ ok: false, reason: "workspace_unresolved" });

    expect(
      resolveAnalyticsProvenance(
        analyticsBackgroundOrigin({
          subjectWorkspaceId: [WORKSPACE_ID, OTHER_WORKSPACE_ID],
          initiatorUserId: ACTOR_ID,
        }),
      ),
    ).toEqual({ ok: false, reason: "workspace_ambiguous" });

    expect(
      resolveAnalyticsProvenance(
        analyticsRequestOrigin({ tenantWorkspaceId: WORKSPACE_ID, actorUserId: null }),
      ),
    ).toEqual({ ok: false, reason: "actor_unresolved" });

    expect(
      resolveAnalyticsProvenance(
        analyticsBackgroundOrigin({
          subjectWorkspaceId: WORKSPACE_ID,
          initiatorUserId: [ACTOR_ID, "user-2"],
        }),
      ),
    ).toEqual({ ok: false, reason: "actor_ambiguous" });
  });
});

describe("typed event constructors (criteria 4.1 – 4.3, 4.6)", () => {
  let clock: DeterministicClock;

  beforeEach(() => {
    clock = new DeterministicClock(CLOCK_INSTANT);
  });

  test("builds one minimized proposal event per committed mutation", () => {
    const build = buildProposalAnalyticsEvent({
      eventType: "proposal_submitted",
      proposalId: "proposal-1",
      mutationRef: 4,
      origin: REQUEST_ORIGIN,
      clock,
      metadata: { projectId: "project-1", revision: 4, locale: "ar" },
    });

    expect(build.ok).toBe(true);
    if (!build.ok) return;
    expect(build.draft).toMatchObject({
      workspaceId: WORKSPACE_ID,
      actorId: ACTOR_ID,
      origin: "request",
      eventType: "proposal_submitted",
      entityType: "proposal",
      entityId: "proposal-1",
      durationMs: null,
    });
    expect(build.draft.occurredAt.toISOString()).toBe(CLOCK_INSTANT);
    expect(build.draft.metadata).toEqual({
      locale: "ar",
      projectId: "project-1",
      revision: 4,
    });
  });

  test("gives two committed mutations of one subject two distinct keys", () => {
    const first = buildProposalAnalyticsEvent({
      eventType: "proposal_edited",
      proposalId: "proposal-1",
      mutationRef: 2,
      origin: REQUEST_ORIGIN,
      clock,
    });
    const second = buildProposalAnalyticsEvent({
      eventType: "proposal_edited",
      proposalId: "proposal-1",
      mutationRef: 3,
      origin: REQUEST_ORIGIN,
      clock,
    });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.draft.eventKey).not.toBe(second.draft.eventKey);
  });

  test("keys the same committed mutation identically and scopes it by workspace", () => {
    const shared = {
      eventType: "proposal_created" as const,
      entityType: "proposal" as const,
      entityId: "proposal-1",
      mutationRef: "1",
    };
    expect(deriveAnalyticsEventKey({ ...shared, workspaceId: WORKSPACE_ID })).toBe(
      deriveAnalyticsEventKey({ ...shared, workspaceId: WORKSPACE_ID }),
    );
    expect(
      deriveAnalyticsEventKey({ ...shared, workspaceId: WORKSPACE_ID }),
    ).not.toBe(deriveAnalyticsEventKey({ ...shared, workspaceId: OTHER_WORKSPACE_ID }));
  });

  test("derives a terminal agent duration from the recorded start transition", () => {
    const startedAt = new Date(Date.parse(CLOCK_INSTANT) - 1_500);
    const build = buildAgentRunAnalyticsEvent({
      eventType: "agent_run_completed",
      runId: "run-1",
      origin: analyticsBackgroundOrigin({
        subjectWorkspaceId: WORKSPACE_ID,
        initiatorUserId: ACTOR_ID,
      }),
      startedAt,
      clock,
      metadata: { projectId: "project-1", progressPercent: 100 },
    });

    expect(build.ok).toBe(true);
    if (!build.ok) return;
    expect(build.draft.durationMs).toBe(1_500);
    expect(build.draft.origin).toBe("background");
  });

  test("reports a nonnegative whole duration for a clock skewed backwards", () => {
    const build = buildAgentRunAnalyticsEvent({
      eventType: "agent_run_failed",
      runId: "run-1",
      origin: REQUEST_ORIGIN,
      startedAt: new Date(Date.parse(CLOCK_INSTANT) + 5_000),
      clock,
    });
    expect(build.ok).toBe(true);
    if (!build.ok) return;
    expect(build.draft.durationMs).toBe(0);
  });

  test("stores no duration on the start transition", () => {
    const build = buildAgentRunAnalyticsEvent({
      eventType: "agent_run_started",
      runId: "run-1",
      origin: REQUEST_ORIGIN,
      startedAt: new Date(Date.parse(CLOCK_INSTANT) - 1_000),
      clock,
    });
    expect(build.ok).toBe(true);
    if (!build.ok) return;
    expect(build.draft.durationMs).toBeNull();
  });

  test("rejects a terminal agent transition with no recorded start transition", () => {
    const build = buildAgentRunAnalyticsEvent({
      eventType: "agent_run_cancelled",
      runId: "run-1",
      origin: REQUEST_ORIGIN,
      clock,
    });
    expect(build).toEqual({
      ok: false,
      reason: "duration_required",
      fieldPaths: ["startedAt"],
    });
  });

  test("requires the version identifier on a version-creation event", () => {
    expect(
      buildDocumentAnalyticsEvent({
        eventType: "document_version_created",
        documentId: "document-1",
        mutationRef: "version-7",
        origin: REQUEST_ORIGIN,
        clock,
      }),
    ).toEqual({
      ok: false,
      reason: "version_identifier_required",
      fieldPaths: ["documentVersionId"],
    });

    const build = buildDocumentAnalyticsEvent({
      eventType: "document_version_created",
      documentId: "document-1",
      mutationRef: "version-7",
      origin: REQUEST_ORIGIN,
      clock,
      metadata: { documentVersionId: "version-7", versionNumber: 7 },
    });
    expect(build.ok).toBe(true);
    if (!build.ok) return;
    expect(build.draft.metadata).toEqual({
      documentVersionId: "version-7",
      versionNumber: 7,
    });
  });

  test("rejects a monetary or document-body payload field", () => {
    const build = buildTemplateAnalyticsEvent({
      eventType: "template_used",
      entityId: "template-1",
      mutationRef: "proposal-1",
      origin: REQUEST_ORIGIN,
      clock,
      metadata: { totalAmount: 1200, bodyText: "confidential clause" } as never,
    });
    expect(build.ok).toBe(false);
    if (build.ok) return;
    expect(build.reason).toBe("metadata_invalid");
  });

  test("names a monetary or document-body field for any candidate payload", () => {
    expect(findForbiddenAnalyticsField({ projectId: "p", sectionCount: 3 })).toBeNull();
    expect(findForbiddenAnalyticsField({ bidAmount: 1 })).toBe("bidAmount");
    expect(findForbiddenAnalyticsField({ unit_price: 1 })).toBe("unit_price");
    expect(findForbiddenAnalyticsField({ currency: "SAR" })).toBe("currency");
    expect(findForbiddenAnalyticsField({ body: "x" })).toBe("body");
    expect(findForbiddenAnalyticsField({ contentJson: "x" })).toBe("contentJson");
  });

  test("rejects an invalid subject identifier, mutation reference, and count", () => {
    expect(
      buildProposalAnalyticsEvent({
        eventType: "proposal_created",
        proposalId: "   ",
        mutationRef: 1,
        origin: REQUEST_ORIGIN,
        clock,
      }),
    ).toMatchObject({ ok: false, reason: "entity_identifier_invalid" });

    expect(
      buildProposalAnalyticsEvent({
        eventType: "proposal_created",
        proposalId: "proposal-1",
        mutationRef: "",
        origin: REQUEST_ORIGIN,
        clock,
      }),
    ).toMatchObject({ ok: false, reason: "mutation_reference_invalid" });

    expect(
      buildProposalAnalyticsEvent({
        eventType: "proposal_created",
        proposalId: "proposal-1",
        mutationRef: 1,
        origin: REQUEST_ORIGIN,
        clock,
        metadata: { sectionCount: -1 },
      }),
    ).toMatchObject({ ok: false, reason: "metadata_invalid" });
  });

  test("rejects a build whose origin resolves no single workspace", () => {
    expect(
      buildProposalAnalyticsEvent({
        eventType: "proposal_created",
        proposalId: "proposal-1",
        mutationRef: 1,
        origin: analyticsBackgroundOrigin({
          subjectWorkspaceId: [WORKSPACE_ID, OTHER_WORKSPACE_ID],
          initiatorUserId: ACTOR_ID,
        }),
        clock,
      }),
    ).toMatchObject({ ok: false, reason: "workspace_ambiguous" });
  });
});

describe("one bounded post-commit append attempt (criteria 4.4, 4.12)", () => {
  let clock: DeterministicClock;
  let writer: RecordingWriter;

  beforeEach(() => {
    clock = new DeterministicClock(CLOCK_INSTANT);
    writer = new RecordingWriter();
  });

  test("appends exactly one row carrying the required fields", async () => {
    const { options, failures } = appendOptions(writer, clock);
    const result = await recordCommittedAnalyticsEvent(
      buildProposalAnalyticsEvent({
        eventType: "proposal_exported",
        proposalId: "proposal-1",
        mutationRef: "export-9",
        origin: REQUEST_ORIGIN,
        clock,
        metadata: { exportFormat: "xlsx", locale: "en" },
      }),
      options,
    );

    expect(result.outcome).toBe("appended");
    expect(writer.attempts).toBe(1);
    expect(writer.rows).toHaveLength(1);
    expect(writer.rows[0]).toMatchObject({
      workspaceId: WORKSPACE_ID,
      userId: ACTOR_ID,
      eventType: "proposal_exported",
      entityType: "proposal",
      entityId: "proposal-1",
      durationMs: null,
    });
    expect(writer.rows[0]!.createdAt.toISOString()).toBe(CLOCK_INSTANT);
    expect(failures).toHaveLength(0);
  });

  test("treats a repeated attempt for one committed mutation as an idempotent no-op", async () => {
    const { options, failures } = appendOptions(writer, clock);
    const build = () =>
      buildProposalAnalyticsEvent({
        eventType: "proposal_approved",
        proposalId: "proposal-1",
        mutationRef: "decision-3",
        origin: REQUEST_ORIGIN,
        clock,
      });

    const first = await recordCommittedAnalyticsEvent(build(), options);
    const second = await recordCommittedAnalyticsEvent(build(), options);

    expect(first.outcome).toBe("appended");
    expect(second.outcome).toBe("duplicate");
    expect(second.eventKey).toBe(first.eventKey);
    expect(writer.rows).toHaveLength(1);
    expect(writer.attempts).toBe(2);
    expect(failures).toHaveLength(0);
  });

  test("makes no further attempt and never throws when persistence fails", async () => {
    writer.failure = Object.assign(new Error("connection reset"), { code: "P1001" });
    const { options, failures } = appendOptions(writer, clock);

    const result = await recordCommittedAnalyticsEvent(
      buildProposalAnalyticsEvent({
        eventType: "proposal_rejected",
        proposalId: "proposal-1",
        mutationRef: "decision-4",
        origin: REQUEST_ORIGIN,
        clock,
      }),
      options,
    );

    expect(result.outcome).toBe("failed");
    expect(result.reason).toBe("P1001");
    expect(writer.attempts).toBe(1);
    expect(writer.rows).toHaveLength(0);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({
      outcome: "failed",
      reason: "P1001",
      workspaceId: WORKSPACE_ID,
      eventType: "proposal_rejected",
    });
  });

  test("persists no row and logs the reason for a rejected construction", async () => {
    const { options, failures } = appendOptions(writer, clock);
    const result = await recordCommittedAnalyticsEvent(
      buildAgentRunAnalyticsEvent({
        eventType: "agent_run_completed",
        runId: "run-1",
        origin: REQUEST_ORIGIN,
        clock,
      }),
      options,
    );

    expect(result).toEqual({
      outcome: "rejected",
      eventKey: null,
      reason: "duration_required",
    });
    expect(writer.attempts).toBe(0);
    expect(writer.rows).toHaveLength(0);
    expect(failures[0]).toMatchObject({ outcome: "rejected", reason: "duration_required" });
  });

  test("bounds the attempt and reports the deadline without throwing", async () => {
    const pending: AnalyticsEventWriter = {
      append: () => new Promise<void>(() => {}),
    };
    const result = await recordCommittedAnalyticsEvent(
      buildProposalAnalyticsEvent({
        eventType: "proposal_created",
        proposalId: "proposal-1",
        mutationRef: 1,
        origin: REQUEST_ORIGIN,
        clock,
      }),
      {
        writer: pending,
        clock,
        deadlineMs: 5,
        logger: () => {},
      },
    );

    expect(result.outcome).toBe("failed");
    expect(result.reason).toBe("PROVIDER_DEADLINE_EXCEEDED");
  });

  test("recognises a unique-key conflict from either driver shape", () => {
    expect(isUniqueEventKeyConflict({ code: "P2002" })).toBe(true);
    expect(isUniqueEventKeyConflict({ code: "23505" })).toBe(true);
    expect(
      isUniqueEventKeyConflict(
        new Error('duplicate key value violates unique constraint "AnalyticsEvent_eventKey_key"'),
      ),
    ).toBe(true);
    expect(isUniqueEventKeyConflict(new Error("connection reset"))).toBe(false);
    expect(isUniqueEventKeyConflict(null)).toBe(false);
  });
});

describe("median duration helper (criterion 4.8)", () => {
  test("reports an unavailable median for an empty sample", () => {
    expect(medianDurationMs([])).toBeNull();
  });

  test("reports whole milliseconds for odd and even samples", () => {
    expect(medianDurationMs([30, 10, 20])).toBe(20);
    expect(medianDurationMs([10, 20, 30, 41])).toBe(25);
  });
});
