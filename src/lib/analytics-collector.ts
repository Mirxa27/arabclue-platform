/**
 * Analytics_Collector — closed event vocabulary, typed event constructors, and
 * one bounded post-commit append attempt (requirements 4.1 – 4.6, 4.10, 4.12).
 *
 * `ANALYTICS_EVENT_TYPES` is the single vocabulary source. The Zod enum, the
 * entity-type mapping, the duration rules, and the bilingual label keys are all
 * derived from it, so a writer, the aggregation, and the dashboard cannot drift
 * apart and an append outside the vocabulary cannot be constructed
 * (criterion 4.10).
 *
 * Every event is produced by a typed event-specific constructor. A constructor
 * resolves exactly one workspace and one actor from the declared origin
 * (criterion 4.5), accepts only identifiers, closed-vocabulary values, counts,
 * and nonnegative whole-millisecond durations (criteria 4.2, 4.6), derives a
 * stable event key from the committed mutation, and returns a rejection instead
 * of throwing.
 *
 * `recordCommittedAnalyticsEvent` performs exactly one bounded append attempt
 * after the originating transaction commits. A unique-key conflict is an
 * idempotent no-op, no failure is retried, and no failure changes the
 * originating operation's response (criteria 4.4, 4.12).
 *
 * Persistence, the clock, and the deadline scheduler are injected, so unit and
 * property tests exercise these rules with no network call and no shared
 * database mutation.
 */

import { z } from "zod";
import { canonicalJson, sha256Hex } from "./canonical-json";
import {
  getDynamicTranslationKey,
  type DynamicTranslationMember,
  type TranslationKey,
} from "./i18n";
import {
  systemDeadlineScheduler,
  withProviderDeadline,
  type DeadlineScheduler,
} from "./provider-timeout";
import { systemUtcClock, utcNow, type UtcClock } from "./time";

/* -------------------------------------------------------------------------- */
/* Closed event vocabulary (criterion 4.10)                                   */
/* -------------------------------------------------------------------------- */

/** Proposal lifecycle transitions recorded per committed mutation (4.1). */
export const ANALYTICS_PROPOSAL_EVENT_TYPES = [
  "proposal_created",
  "proposal_edited",
  "proposal_submitted",
  "proposal_approved",
  "proposal_rejected",
  "proposal_exported",
] as const;

/** Agent run transitions; the terminal three carry an elapsed duration (4.2). */
export const ANALYTICS_AGENT_RUN_EVENT_TYPES = [
  "agent_run_started",
  "agent_run_completed",
  "agent_run_failed",
  "agent_run_cancelled",
] as const;

/** Document transitions recorded per committed mutation (4.3). */
export const ANALYTICS_DOCUMENT_EVENT_TYPES = [
  "document_uploaded",
  "document_version_created",
] as const;

/** Template-application transitions recorded per committed mutation. */
export const ANALYTICS_TEMPLATE_EVENT_TYPES = [
  "template_used",
  "section_added",
] as const;

/**
 * The closed event-type vocabulary. Nothing outside this tuple may be appended
 * and no aggregate may report an event type absent from it (criterion 4.10).
 */
export const ANALYTICS_EVENT_TYPES = [
  ...ANALYTICS_PROPOSAL_EVENT_TYPES,
  ...ANALYTICS_AGENT_RUN_EVENT_TYPES,
  ...ANALYTICS_DOCUMENT_EVENT_TYPES,
  ...ANALYTICS_TEMPLATE_EVENT_TYPES,
] as const;

export type AnalyticsProposalEventType =
  (typeof ANALYTICS_PROPOSAL_EVENT_TYPES)[number];
export type AnalyticsAgentRunEventType =
  (typeof ANALYTICS_AGENT_RUN_EVENT_TYPES)[number];
export type AnalyticsDocumentEventType =
  (typeof ANALYTICS_DOCUMENT_EVENT_TYPES)[number];
export type AnalyticsTemplateEventType =
  (typeof ANALYTICS_TEMPLATE_EVENT_TYPES)[number];
export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number];

/** The single Zod source every writer and reader validates against. */
export const analyticsEventTypeSchema = z.enum(ANALYTICS_EVENT_TYPES);

export function isAnalyticsEventType(value: unknown): value is AnalyticsEventType {
  return (
    typeof value === "string" &&
    (ANALYTICS_EVENT_TYPES as readonly string[]).includes(value)
  );
}

/** The start transition of the agent-run duration pair (criterion 4.2). */
export const ANALYTICS_AGENT_START_EVENT_TYPE = "agent_run_started" as const;

/** Terminal agent transitions that carry an elapsed duration (criterion 4.2). */
export const ANALYTICS_AGENT_TERMINAL_EVENT_TYPES = [
  "agent_run_completed",
  "agent_run_failed",
  "agent_run_cancelled",
] as const;

export type AnalyticsAgentTerminalEventType =
  (typeof ANALYTICS_AGENT_TERMINAL_EVENT_TYPES)[number];

export function isAnalyticsAgentTerminalEventType(
  value: AnalyticsEventType,
): value is AnalyticsAgentTerminalEventType {
  return (ANALYTICS_AGENT_TERMINAL_EVENT_TYPES as readonly string[]).includes(
    value,
  );
}

/** Only these event types may carry a duration; every other row stores null. */
export function analyticsEventCarriesDuration(
  eventType: AnalyticsEventType,
): boolean {
  return isAnalyticsAgentTerminalEventType(eventType);
}

/* -------------------------------------------------------------------------- */
/* Entity types derived from the vocabulary (criterion 4.1)                    */
/* -------------------------------------------------------------------------- */

export const ANALYTICS_ENTITY_TYPES = [
  "proposal",
  "agent_run",
  "document",
  "template",
  "section",
] as const;

export type AnalyticsEntityType = (typeof ANALYTICS_ENTITY_TYPES)[number];

/**
 * The entity type of a row is derived from its event type rather than supplied
 * by a caller, so one vocabulary value always describes one subject kind.
 */
const ANALYTICS_ENTITY_TYPE_BY_EVENT = Object.freeze({
  proposal_created: "proposal",
  proposal_edited: "proposal",
  proposal_submitted: "proposal",
  proposal_approved: "proposal",
  proposal_rejected: "proposal",
  proposal_exported: "proposal",
  agent_run_started: "agent_run",
  agent_run_completed: "agent_run",
  agent_run_failed: "agent_run",
  agent_run_cancelled: "agent_run",
  document_uploaded: "document",
  document_version_created: "document",
  template_used: "template",
  section_added: "section",
}) satisfies Record<AnalyticsEventType, AnalyticsEntityType>;

export function analyticsEntityTypeFor(
  eventType: AnalyticsEventType,
): AnalyticsEntityType {
  return ANALYTICS_ENTITY_TYPE_BY_EVENT[eventType];
}

/* -------------------------------------------------------------------------- */
/* Bilingual labels derived from the vocabulary (criteria 4.9, 4.10)           */
/* -------------------------------------------------------------------------- */

const ANALYTICS_LABEL_MEMBER_BY_EVENT = Object.freeze({
  proposal_created: "PROPOSAL_CREATED",
  proposal_edited: "PROPOSAL_EDITED",
  proposal_submitted: "PROPOSAL_SUBMITTED",
  proposal_approved: "PROPOSAL_APPROVED",
  proposal_rejected: "PROPOSAL_REJECTED",
  proposal_exported: "PROPOSAL_EXPORTED",
  agent_run_started: "AGENT_RUN_STARTED",
  agent_run_completed: "AGENT_RUN_COMPLETED",
  agent_run_failed: "AGENT_RUN_FAILED",
  agent_run_cancelled: "AGENT_RUN_CANCELLED",
  document_uploaded: "DOCUMENT_UPLOADED",
  document_version_created: "DOCUMENT_VERSION_CREATED",
  template_used: "TEMPLATE_USED",
  section_added: "SECTION_ADDED",
}) satisfies Record<
  AnalyticsEventType,
  DynamicTranslationMember<"analyticsEvent">
>;

/** Registered bilingual label key for one vocabulary value (criterion 4.9). */
export function analyticsEventLabelKey(
  eventType: AnalyticsEventType,
): TranslationKey {
  return getDynamicTranslationKey(
    "analyticsEvent",
    ANALYTICS_LABEL_MEMBER_BY_EVENT[eventType],
  );
}

/* -------------------------------------------------------------------------- */
/* Minimized payload vocabulary (criterion 4.6)                               */
/* -------------------------------------------------------------------------- */

/**
 * Export channels reported by a `proposal_exported` row.
 *
 * Mirrors the download route's `ProposalDownloadFormat` union exactly, so the
 * payload value stays closed and no channel is recorded that no export path
 * produces. The list is declared here rather than imported from the route so the
 * domain module stays free of route-handler imports.
 */
export const ANALYTICS_EXPORT_FORMATS = [
  "zip",
  "pdf",
  "html",
  "xlsx",
  "xlsx-matrix",
  "xlsx-boq",
  "slides",
  "pptx",
  "manifest",
] as const;

export type AnalyticsExportFormat = (typeof ANALYTICS_EXPORT_FORMATS)[number];

/** Closed outcome vocabulary for a terminal agent transition. */
export const ANALYTICS_AGENT_OUTCOME_REASONS = [
  "no_documents",
  "cancelled_by_user",
  "pipeline_error",
  "provider_unavailable",
  "validation_failed",
] as const;

export type AnalyticsAgentOutcomeReason =
  (typeof ANALYTICS_AGENT_OUTCOME_REASONS)[number];

/** Longest identifier accepted in a payload; keeps document text structurally out. */
export const ANALYTICS_IDENTIFIER_MAX_LENGTH = 200;

/** Upper bound of an elapsed duration, one calendar year in milliseconds. */
export const ANALYTICS_DURATION_MAX_MS = 366 * 24 * 60 * 60 * 1000;

const identifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(ANALYTICS_IDENTIFIER_MAX_LENGTH);
const optionalIdentifierSchema = identifierSchema.nullish();
const countSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const percentSchema = z.number().int().min(0).max(100);
const localeSchema = z.enum(["ar", "en"]);

const proposalMetadataSchema = z
  .object({
    projectId: optionalIdentifierSchema,
    revision: countSchema.optional(),
    sectionCount: countSchema.optional(),
    locale: localeSchema.optional(),
    exportFormat: z.enum(ANALYTICS_EXPORT_FORMATS).optional(),
    reviewDecisionId: optionalIdentifierSchema,
  })
  .strict();

const agentRunMetadataSchema = z
  .object({
    projectId: optionalIdentifierSchema,
    proposalId: optionalIdentifierSchema,
    progressPercent: percentSchema.optional(),
    outcomeReason: z.enum(ANALYTICS_AGENT_OUTCOME_REASONS).optional(),
  })
  .strict();

const documentMetadataSchema = z
  .object({
    projectId: optionalIdentifierSchema,
    documentVersionId: optionalIdentifierSchema,
    versionNumber: countSchema.optional(),
    sizeBytes: countSchema.optional(),
  })
  .strict();

const templateMetadataSchema = z
  .object({
    templateKey: optionalIdentifierSchema,
    category: optionalIdentifierSchema,
    proposalId: optionalIdentifierSchema,
    projectId: optionalIdentifierSchema,
    sectionType: optionalIdentifierSchema,
    sectionCount: countSchema.optional(),
    locale: localeSchema.optional(),
  })
  .strict();

export type AnalyticsProposalMetadata = z.input<typeof proposalMetadataSchema>;
export type AnalyticsAgentRunMetadata = z.input<typeof agentRunMetadataSchema>;
export type AnalyticsDocumentMetadata = z.input<typeof documentMetadataSchema>;
export type AnalyticsTemplateMetadata = z.input<typeof templateMetadataSchema>;

/** Persisted payload shape: identifiers, closed values, counts, and nulls only. */
export type AnalyticsEventMetadata = Readonly<
  Record<string, string | number | null>
>;

/**
 * Parsed payload shape accepted by the shared draft builder. Every declared
 * event schema resolves to this shape, so no value outside identifiers, closed
 * vocabulary values, counts, and nulls can reach persistence (criterion 4.6).
 */
type ParsedAnalyticsMetadata = Readonly<
  Record<string, string | number | null | undefined>
>;

const MONETARY_FIELD_SUBSTRINGS = [
  "amount",
  "price",
  "bid",
  "total",
  "cost",
  "budget",
  "payment",
  "invoice",
  "monetary",
  "currency",
  "discount",
  "margin",
  "fee",
  "charge",
  "salary",
  "financial",
  "tax",
  "vat",
] as const;

const DOCUMENT_FIELD_SUBSTRINGS = [
  "content",
  "markdown",
  "filedata",
  "documentbody",
  "rawtext",
  "storagepath",
  "filepath",
  "attachment",
] as const;

const DOCUMENT_FIELD_EXACT = new Set([
  "body",
  "text",
  "html",
  "payload",
  "raw",
  "summary",
  "excerpt",
  "notes",
]);

/**
 * Payload minimization guard (criterion 4.6).
 *
 * The typed schemas already close the payload shape. This check is the standing
 * invariant behind Property 15: it names the first monetary or document-body
 * field so a widened schema can never let one through silently.
 */
export function findForbiddenAnalyticsField(
  metadata: Readonly<Record<string, unknown>>,
): string | null {
  for (const key of Object.keys(metadata)) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/gu, "");
    if (DOCUMENT_FIELD_EXACT.has(normalized)) return key;
    if (MONETARY_FIELD_SUBSTRINGS.some((token) => normalized.includes(token))) {
      return key;
    }
    if (DOCUMENT_FIELD_SUBSTRINGS.some((token) => normalized.includes(token))) {
      return key;
    }
  }
  return null;
}

/** Drops absent values and orders keys so one mutation yields one payload. */
function finalizeMetadata(parsed: ParsedAnalyticsMetadata): AnalyticsEventMetadata {
  const output: Record<string, string | number | null> = {};
  for (const key of Object.keys(parsed).sort()) {
    const value = parsed[key];
    if (value === undefined) continue;
    output[key] = value;
  }
  return Object.freeze(output);
}

/* -------------------------------------------------------------------------- */
/* Workspace and actor provenance (criterion 4.5)                             */
/* -------------------------------------------------------------------------- */

export const ANALYTICS_ORIGIN_KINDS = ["request", "background"] as const;

export type AnalyticsOriginKind = (typeof ANALYTICS_ORIGIN_KINDS)[number];

export type AnalyticsOriginCandidate = string | null | undefined;

/**
 * Candidate provenance of one event.
 *
 * A request-scoped origin supplies the `Tenant_Context` workspace and the
 * session actor. A background origin supplies the subject record's stored
 * workspace and the member recorded as its initiator. Candidates are collections
 * so a background origin that reads several records can be rejected when they
 * disagree instead of silently choosing one.
 */
export type AnalyticsProvenanceInput = Readonly<{
  origin: AnalyticsOriginKind;
  workspaceIds: readonly AnalyticsOriginCandidate[];
  actorIds: readonly AnalyticsOriginCandidate[];
}>;

export const ANALYTICS_PROVENANCE_FAILURES = [
  "workspace_unresolved",
  "workspace_ambiguous",
  "actor_unresolved",
  "actor_ambiguous",
] as const;

export type AnalyticsProvenanceFailure =
  (typeof ANALYTICS_PROVENANCE_FAILURES)[number];

export type AnalyticsProvenance =
  | Readonly<{
      ok: true;
      origin: AnalyticsOriginKind;
      workspaceId: string;
      actorId: string;
    }>
  | Readonly<{ ok: false; reason: AnalyticsProvenanceFailure }>;

function distinctIdentifiers(
  candidates: readonly AnalyticsOriginCandidate[],
): string[] {
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const trimmed = candidate.trim();
    if (trimmed.length === 0) continue;
    if (trimmed.length > ANALYTICS_IDENTIFIER_MAX_LENGTH) continue;
    seen.add(trimmed);
  }
  return [...seen];
}

/**
 * Resolves exactly one workspace and one actor, or reports why it could not.
 * No row is appended unless both resolve to a single identifier (criterion 4.5).
 */
export function resolveAnalyticsProvenance(
  input: AnalyticsProvenanceInput,
): AnalyticsProvenance {
  const workspaces = distinctIdentifiers(input.workspaceIds);
  if (workspaces.length === 0) {
    return { ok: false, reason: "workspace_unresolved" };
  }
  if (workspaces.length > 1) {
    return { ok: false, reason: "workspace_ambiguous" };
  }

  const actors = distinctIdentifiers(input.actorIds);
  if (actors.length === 0) return { ok: false, reason: "actor_unresolved" };
  if (actors.length > 1) return { ok: false, reason: "actor_ambiguous" };

  return {
    ok: true,
    origin: input.origin,
    workspaceId: workspaces[0]!,
    actorId: actors[0]!,
  };
}

/** Provenance of a request-scoped mutation: Tenant_Context plus session actor. */
export function analyticsRequestOrigin(input: {
  readonly tenantWorkspaceId: AnalyticsOriginCandidate;
  readonly actorUserId: AnalyticsOriginCandidate;
}): AnalyticsProvenanceInput {
  return Object.freeze({
    origin: "request" as const,
    workspaceIds: Object.freeze([input.tenantWorkspaceId]),
    actorIds: Object.freeze([input.actorUserId]),
  });
}

/** Provenance of a background mutation: the subject record's stored values. */
export function analyticsBackgroundOrigin(input: {
  readonly subjectWorkspaceId:
    | AnalyticsOriginCandidate
    | readonly AnalyticsOriginCandidate[];
  readonly initiatorUserId:
    | AnalyticsOriginCandidate
    | readonly AnalyticsOriginCandidate[];
}): AnalyticsProvenanceInput {
  return Object.freeze({
    origin: "background" as const,
    workspaceIds: Object.freeze(toCandidateList(input.subjectWorkspaceId)),
    actorIds: Object.freeze(toCandidateList(input.initiatorUserId)),
  });
}

function toCandidateList(
  value: AnalyticsOriginCandidate | readonly AnalyticsOriginCandidate[],
): AnalyticsOriginCandidate[] {
  return Array.isArray(value) ? [...value] : [value as AnalyticsOriginCandidate];
}

/* -------------------------------------------------------------------------- */
/* Stable event keys (criteria 4.1, 4.12)                                     */
/* -------------------------------------------------------------------------- */

export const ANALYTICS_EVENT_KEY_VERSION = "av1" as const;

/**
 * Derives the stable key of one committed mutation.
 *
 * The key covers the workspace, the vocabulary value, the subject, and the
 * persisted mutation reference (revision, version, or transition identifier), so
 * the same committed mutation always derives the same key and the unique index
 * turns a repeated attempt into a no-op instead of a second row.
 */
export function deriveAnalyticsEventKey(input: {
  readonly workspaceId: string;
  readonly eventType: AnalyticsEventType;
  readonly entityType: AnalyticsEntityType;
  readonly entityId: string;
  readonly mutationRef: string;
}): string {
  const digest = sha256Hex(
    canonicalJson({
      v: ANALYTICS_EVENT_KEY_VERSION,
      workspaceId: input.workspaceId,
      eventType: input.eventType,
      entityType: input.entityType,
      entityId: input.entityId,
      mutationRef: input.mutationRef,
    }),
  );
  return `${ANALYTICS_EVENT_KEY_VERSION}_${digest}`;
}

function normalizeMutationRef(value: string | number): string | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) ? String(value) : null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > ANALYTICS_IDENTIFIER_MAX_LENGTH) return null;
  return trimmed;
}

/* -------------------------------------------------------------------------- */
/* Typed event constructors                                                   */
/* -------------------------------------------------------------------------- */

export const ANALYTICS_BUILD_REJECTIONS = [
  ...ANALYTICS_PROVENANCE_FAILURES,
  "event_type_outside_vocabulary",
  "entity_identifier_invalid",
  "mutation_reference_invalid",
  "metadata_invalid",
  "forbidden_payload_field",
  "duration_required",
  "duration_invalid",
  "occurred_at_invalid",
  "version_identifier_required",
] as const;

export type AnalyticsBuildRejection =
  (typeof ANALYTICS_BUILD_REJECTIONS)[number];

/** One validated, minimized event ready for a single append attempt. */
export interface AnalyticsEventDraft {
  readonly eventKey: string;
  readonly workspaceId: string;
  readonly actorId: string;
  readonly origin: AnalyticsOriginKind;
  readonly eventType: AnalyticsEventType;
  readonly entityType: AnalyticsEntityType;
  readonly entityId: string;
  readonly durationMs: number | null;
  readonly occurredAt: Date;
  readonly metadata: AnalyticsEventMetadata;
}

export type AnalyticsEventBuild =
  | Readonly<{ ok: true; draft: AnalyticsEventDraft }>
  | Readonly<{
      ok: false;
      reason: AnalyticsBuildRejection;
      fieldPaths: readonly string[];
    }>;

function rejectBuild(
  reason: AnalyticsBuildRejection,
  fieldPaths: readonly string[] = [],
): AnalyticsEventBuild {
  return Object.freeze({ ok: false as const, reason, fieldPaths });
}

interface DraftFoundation {
  readonly eventType: AnalyticsEventType;
  readonly entityId: string;
  readonly mutationRef: string | number;
  readonly origin: AnalyticsProvenanceInput;
  readonly durationMs?: number | null;
  readonly occurredAt?: Date;
  readonly clock?: UtcClock;
}

/** Structural view of a schema rejection; keeps this module free of Zod internals. */
interface MetadataIssueSource {
  readonly issues: readonly { readonly path: readonly PropertyKey[] }[];
}

/** Field paths of a rejected payload, for the redacted failure record. */
function metadataFieldPaths(error: MetadataIssueSource): string[] {
  const paths = error.issues.map(
    (issue) => issue.path.map((segment) => String(segment)).join(".") || "metadata",
  );
  return paths.length > 0 ? paths : ["metadata"];
}

function buildDraft(
  foundation: DraftFoundation,
  parsedMetadata: ParsedAnalyticsMetadata,
): AnalyticsEventBuild {
  if (!isAnalyticsEventType(foundation.eventType)) {
    return rejectBuild("event_type_outside_vocabulary", ["eventType"]);
  }

  const provenance = resolveAnalyticsProvenance(foundation.origin);
  if (!provenance.ok) return rejectBuild(provenance.reason, ["origin"]);

  const entityId = identifierSchema.safeParse(foundation.entityId);
  if (!entityId.success) return rejectBuild("entity_identifier_invalid", ["entityId"]);

  const mutationRef = normalizeMutationRef(foundation.mutationRef);
  if (mutationRef === null) {
    return rejectBuild("mutation_reference_invalid", ["mutationRef"]);
  }

  const metadata = finalizeMetadata(parsedMetadata);
  const forbidden = findForbiddenAnalyticsField(metadata);
  if (forbidden) return rejectBuild("forbidden_payload_field", [forbidden]);

  const carriesDuration = analyticsEventCarriesDuration(foundation.eventType);
  const durationMs = foundation.durationMs ?? null;
  if (carriesDuration) {
    if (durationMs === null) return rejectBuild("duration_required", ["durationMs"]);
    if (
      !Number.isSafeInteger(durationMs) ||
      durationMs < 0 ||
      durationMs > ANALYTICS_DURATION_MAX_MS
    ) {
      return rejectBuild("duration_invalid", ["durationMs"]);
    }
  } else if (durationMs !== null) {
    return rejectBuild("duration_invalid", ["durationMs"]);
  }

  const entityType = analyticsEntityTypeFor(foundation.eventType);
  const occurredAt =
    foundation.occurredAt ?? utcNow(foundation.clock ?? systemUtcClock);
  if (!Number.isFinite(occurredAt.getTime())) {
    return rejectBuild("occurred_at_invalid", ["occurredAt"]);
  }

  return Object.freeze({
    ok: true as const,
    draft: Object.freeze({
      eventKey: deriveAnalyticsEventKey({
        workspaceId: provenance.workspaceId,
        eventType: foundation.eventType,
        entityType,
        entityId: entityId.data,
        mutationRef,
      }),
      workspaceId: provenance.workspaceId,
      actorId: provenance.actorId,
      origin: provenance.origin,
      eventType: foundation.eventType,
      entityType,
      entityId: entityId.data,
      durationMs: carriesDuration ? durationMs : null,
      occurredAt: new Date(occurredAt.getTime()),
      metadata,
    }),
  });
}

/**
 * Proposal lifecycle event (criterion 4.1). `mutationRef` is the persisted
 * revision or decision identifier of the committed mutation, so two committed
 * mutations never coalesce into one row.
 */
export function buildProposalAnalyticsEvent(input: {
  readonly eventType: AnalyticsProposalEventType;
  readonly proposalId: string;
  readonly mutationRef: string | number;
  readonly origin: AnalyticsProvenanceInput;
  readonly metadata?: AnalyticsProposalMetadata;
  readonly occurredAt?: Date;
  readonly clock?: UtcClock;
}): AnalyticsEventBuild {
  const parsed = proposalMetadataSchema.safeParse(input.metadata ?? {});
  if (!parsed.success) {
    return rejectBuild("metadata_invalid", metadataFieldPaths(parsed.error));
  }

  return buildDraft(
    {
      eventType: input.eventType,
      entityId: input.proposalId,
      mutationRef: input.mutationRef,
      origin: input.origin,
      occurredAt: input.occurredAt,
      clock: input.clock,
    },
    parsed.data,
  );
}

/**
 * Agent run transition (criterion 4.2).
 *
 * A terminal transition requires the recorded start instant; the elapsed time is
 * derived as a nonnegative whole number of milliseconds. A start transition
 * carries no duration.
 */
export function buildAgentRunAnalyticsEvent(input: {
  readonly eventType: AnalyticsAgentRunEventType;
  readonly runId: string;
  readonly origin: AnalyticsProvenanceInput;
  readonly startedAt?: Date | string | number | null;
  readonly metadata?: AnalyticsAgentRunMetadata;
  readonly occurredAt?: Date;
  readonly clock?: UtcClock;
}): AnalyticsEventBuild {
  const occurredAt = input.occurredAt ?? utcNow(input.clock ?? systemUtcClock);
  const carriesDuration = analyticsEventCarriesDuration(input.eventType);

  let durationMs: number | null = null;
  if (carriesDuration) {
    const elapsed = elapsedMilliseconds(input.startedAt, occurredAt);
    if (elapsed === null) return rejectBuild("duration_required", ["startedAt"]);
    durationMs = elapsed;
  }

  const parsed = agentRunMetadataSchema.safeParse(input.metadata ?? {});
  if (!parsed.success) {
    return rejectBuild("metadata_invalid", metadataFieldPaths(parsed.error));
  }

  return buildDraft(
    {
      eventType: input.eventType,
      // The run identifier is the transition subject; one transition per run.
      entityId: input.runId,
      mutationRef: input.eventType,
      origin: input.origin,
      durationMs,
      occurredAt,
      clock: input.clock,
    },
    parsed.data,
  );
}

/** Elapsed whole milliseconds from a recorded start instant, never negative. */
function elapsedMilliseconds(
  startedAt: Date | string | number | null | undefined,
  observedAt: Date,
): number | null {
  if (startedAt === null || startedAt === undefined) return null;
  const start =
    startedAt instanceof Date ? startedAt.getTime() : new Date(startedAt).getTime();
  if (!Number.isFinite(start)) return null;
  const observed = observedAt.getTime();
  if (!Number.isFinite(observed)) return null;
  const elapsed = Math.round(observed - start);
  if (!Number.isSafeInteger(elapsed)) return null;
  return elapsed < 0 ? 0 : Math.min(elapsed, ANALYTICS_DURATION_MAX_MS);
}

/**
 * Document upload or version creation (criterion 4.3). A version-creation event
 * must carry the persisted version identifier.
 */
export function buildDocumentAnalyticsEvent(input: {
  readonly eventType: AnalyticsDocumentEventType;
  readonly documentId: string;
  readonly mutationRef: string | number;
  readonly origin: AnalyticsProvenanceInput;
  readonly metadata?: AnalyticsDocumentMetadata;
  readonly occurredAt?: Date;
  readonly clock?: UtcClock;
}): AnalyticsEventBuild {
  if (input.eventType === "document_version_created") {
    const versionId = input.metadata?.documentVersionId;
    if (typeof versionId !== "string" || versionId.trim().length === 0) {
      return rejectBuild("version_identifier_required", ["documentVersionId"]);
    }
  }

  const parsed = documentMetadataSchema.safeParse(input.metadata ?? {});
  if (!parsed.success) {
    return rejectBuild("metadata_invalid", metadataFieldPaths(parsed.error));
  }

  return buildDraft(
    {
      eventType: input.eventType,
      entityId: input.documentId,
      mutationRef: input.mutationRef,
      origin: input.origin,
      occurredAt: input.occurredAt,
      clock: input.clock,
    },
    parsed.data,
  );
}

/** Template application or section creation committed by a tenant mutation. */
export function buildTemplateAnalyticsEvent(input: {
  readonly eventType: AnalyticsTemplateEventType;
  readonly entityId: string;
  readonly mutationRef: string | number;
  readonly origin: AnalyticsProvenanceInput;
  readonly metadata?: AnalyticsTemplateMetadata;
  readonly occurredAt?: Date;
  readonly clock?: UtcClock;
}): AnalyticsEventBuild {
  const parsed = templateMetadataSchema.safeParse(input.metadata ?? {});
  if (!parsed.success) {
    return rejectBuild("metadata_invalid", metadataFieldPaths(parsed.error));
  }

  return buildDraft(
    {
      eventType: input.eventType,
      entityId: input.entityId,
      mutationRef: input.mutationRef,
      origin: input.origin,
      occurredAt: input.occurredAt,
      clock: input.clock,
    },
    parsed.data,
  );
}

/* -------------------------------------------------------------------------- */
/* One bounded post-commit append attempt (criteria 4.4, 4.12)                 */
/* -------------------------------------------------------------------------- */

/** Row shape handed to persistence; no field outside the closed contract. */
export interface AnalyticsEventRow {
  readonly eventKey: string;
  readonly workspaceId: string;
  readonly eventType: AnalyticsEventType;
  readonly entityType: AnalyticsEntityType;
  readonly entityId: string;
  readonly userId: string;
  readonly durationMs: number | null;
  readonly metadataJson: AnalyticsEventMetadata;
  readonly createdAt: Date;
}

export interface AnalyticsEventWriter {
  append(row: AnalyticsEventRow, signal: AbortSignal): Promise<void>;
}

/**
 * Append deadline. Bounded well inside the five-second visibility budget of
 * criterion 4.12 so a slow append cannot delay the origin response past it.
 */
export const ANALYTICS_APPEND_DEADLINE_MS = 3_000;

export const ANALYTICS_APPEND_OUTCOMES = [
  "appended",
  "duplicate",
  "rejected",
  "failed",
] as const;

export type AnalyticsAppendOutcome = (typeof ANALYTICS_APPEND_OUTCOMES)[number];

export interface AnalyticsAppendResult {
  readonly outcome: AnalyticsAppendOutcome;
  readonly eventKey: string | null;
  readonly reason: string | null;
}

export interface AnalyticsFailureRecord {
  readonly outcome: Extract<AnalyticsAppendOutcome, "rejected" | "failed">;
  readonly reason: string;
  readonly eventType: string | null;
  readonly entityType: string | null;
  readonly entityId: string | null;
  readonly workspaceId: string | null;
  readonly eventKey: string | null;
  readonly fieldPaths: readonly string[];
  readonly elapsedMs: number;
}

export type AnalyticsFailureLogger = (record: AnalyticsFailureRecord) => void;

const defaultFailureLogger: AnalyticsFailureLogger = (record) => {
  // Stable code, resource identifiers, and elapsed time only: never the payload.
  console.error("[analytics-collector]", record);
};

export interface RecordCommittedAnalyticsEventOptions {
  readonly writer?: AnalyticsEventWriter;
  readonly deadlineMs?: number;
  readonly scheduler?: DeadlineScheduler;
  readonly clock?: UtcClock;
  readonly logger?: AnalyticsFailureLogger;
}

/**
 * Performs exactly one bounded append attempt for a constructed event, after the
 * originating transaction has committed.
 *
 * This function never throws and never retries. A rejected construction, a
 * unique-key conflict, a deadline, and a persistence error are all reported in
 * the returned result, so the originating operation keeps its own response
 * status and payload unchanged (criterion 4.4).
 */
export async function recordCommittedAnalyticsEvent(
  build: AnalyticsEventBuild,
  options: RecordCommittedAnalyticsEventOptions = {},
): Promise<AnalyticsAppendResult> {
  const clock = options.clock ?? systemUtcClock;
  const logger = options.logger ?? defaultFailureLogger;
  const startedAt = safeNow(clock);

  if (!build.ok) {
    logger({
      outcome: "rejected",
      reason: build.reason,
      eventType: null,
      entityType: null,
      entityId: null,
      workspaceId: null,
      eventKey: null,
      fieldPaths: build.fieldPaths,
      elapsedMs: 0,
    });
    return { outcome: "rejected", eventKey: null, reason: build.reason };
  }

  const { draft } = build;
  const row: AnalyticsEventRow = Object.freeze({
    eventKey: draft.eventKey,
    workspaceId: draft.workspaceId,
    eventType: draft.eventType,
    entityType: draft.entityType,
    entityId: draft.entityId,
    userId: draft.actorId,
    durationMs: draft.durationMs,
    metadataJson: draft.metadata,
    createdAt: draft.occurredAt,
  });

  const writer = options.writer ?? prismaAnalyticsEventWriter;

  try {
    await withProviderDeadline((signal) => writer.append(row, signal), {
      provider: "analytics-collector",
      timeoutMs: options.deadlineMs ?? ANALYTICS_APPEND_DEADLINE_MS,
      scheduler: options.scheduler ?? systemDeadlineScheduler,
    });
    return { outcome: "appended", eventKey: row.eventKey, reason: null };
  } catch (error) {
    if (isUniqueEventKeyConflict(error)) {
      // The same committed mutation was already recorded: an idempotent no-op.
      return { outcome: "duplicate", eventKey: row.eventKey, reason: null };
    }
    logger({
      outcome: "failed",
      reason: failureReason(error),
      eventType: row.eventType,
      entityType: row.entityType,
      entityId: row.entityId,
      workspaceId: row.workspaceId,
      eventKey: row.eventKey,
      fieldPaths: [],
      elapsedMs: Math.max(0, safeNow(clock) - startedAt),
    });
    return {
      outcome: "failed",
      eventKey: row.eventKey,
      reason: failureReason(error),
    };
  }
}

function safeNow(clock: UtcClock): number {
  try {
    return utcNow(clock).getTime();
  } catch {
    return 0;
  }
}

/** Stable, redacted failure reason. Never echoes a provider or SQL payload. */
function failureReason(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && code.length > 0 && code.length <= 64) {
      return code;
    }
  }
  if (error instanceof Error && error.name) return error.name;
  return "append_failed";
}

/** True when persistence rejected the append because the event key already exists. */
export function isUniqueEventKeyConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  if (code === "P2002" || code === "23505") return true;
  const message = error instanceof Error ? error.message : "";
  return (
    /unique constraint/i.test(message) || /duplicate key value/i.test(message)
  );
}

/**
 * Production writer. `db` is imported lazily so the domain rules above stay
 * importable by unit and property tests without loading a database client.
 */
export const prismaAnalyticsEventWriter: AnalyticsEventWriter = Object.freeze({
  async append(row: AnalyticsEventRow): Promise<void> {
    const { db } = await import("./db");
    await db.analyticsEvent.create({
      data: {
        eventKey: row.eventKey,
        workspaceId: row.workspaceId,
        eventType: row.eventType,
        entityType: row.entityType,
        entityId: row.entityId,
        userId: row.userId,
        durationMs: row.durationMs,
        metadataJson: { ...row.metadataJson },
        createdAt: row.createdAt,
      },
    });
  },
});

/* -------------------------------------------------------------------------- */
/* Origin helpers                                                             */
/* -------------------------------------------------------------------------- */

/** Builds and appends one proposal lifecycle event (criterion 4.1). */
export function recordProposalAnalyticsEvent(
  input: Parameters<typeof buildProposalAnalyticsEvent>[0],
  options?: RecordCommittedAnalyticsEventOptions,
): Promise<AnalyticsAppendResult> {
  return recordCommittedAnalyticsEvent(
    buildProposalAnalyticsEvent(input),
    options,
  );
}

/** Builds and appends one agent run transition (criterion 4.2). */
export function recordAgentRunAnalyticsEvent(
  input: Parameters<typeof buildAgentRunAnalyticsEvent>[0],
  options?: RecordCommittedAnalyticsEventOptions,
): Promise<AnalyticsAppendResult> {
  return recordCommittedAnalyticsEvent(
    buildAgentRunAnalyticsEvent(input),
    options,
  );
}

/** Builds and appends one document upload or version creation (criterion 4.3). */
export function recordDocumentAnalyticsEvent(
  input: Parameters<typeof buildDocumentAnalyticsEvent>[0],
  options?: RecordCommittedAnalyticsEventOptions,
): Promise<AnalyticsAppendResult> {
  return recordCommittedAnalyticsEvent(
    buildDocumentAnalyticsEvent(input),
    options,
  );
}

/** Builds and appends one template application or section creation. */
export function recordTemplateAnalyticsEvent(
  input: Parameters<typeof buildTemplateAnalyticsEvent>[0],
  options?: RecordCommittedAnalyticsEventOptions,
): Promise<AnalyticsAppendResult> {
  return recordCommittedAnalyticsEvent(
    buildTemplateAnalyticsEvent(input),
    options,
  );
}

/* -------------------------------------------------------------------------- */
/* Shared aggregation helper                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Median of recorded durations in whole milliseconds, or `null` when the sample
 * is empty. An empty range reports an unavailable median rather than zero
 * (criterion 4.8).
 */
export function medianDurationMs(values: readonly number[]): number | null {
  const sample = values
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((a, b) => a - b);
  if (sample.length === 0) return null;
  const middle = Math.floor(sample.length / 2);
  if (sample.length % 2 === 1) return Math.round(sample[middle]!);
  return Math.round((sample[middle - 1]! + sample[middle]!) / 2);
}

/**
 * Numeric median retained for the current aggregation call sites.
 * New code should use `medianDurationMs`, which reports an unavailable median as
 * `null` instead of zero.
 */
export function calculateMedian(values: number[]): number {
  return medianDurationMs(values) ?? 0;
}
