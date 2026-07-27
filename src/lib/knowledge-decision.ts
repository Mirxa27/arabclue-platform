/**
 * Pure knowledge approval decision commands (requirements 11.2–11.5, 11.7,
 * 11.9, 11.10).
 *
 * The service authorizes and validates before crossing the persistence boundary.
 * Its repository performs the concrete serializable transaction, while this
 * module maps atomic outcomes to stable HTTP/domain results without importing
 * Prisma or Next.js.
 */

import { z } from "zod";
import { zodFieldPaths } from "./api-failure";
import {
  knowledgeQueueRecordTypeSchema,
  type KnowledgeDecisionState,
  type KnowledgeQueueRecordType,
} from "./knowledge-queue";
import { systemUtcClock, utcNow, type UtcClock } from "./time";

export const KNOWLEDGE_DECISION_ACTIONS = ["APPROVE", "REJECT"] as const;
export type KnowledgeDecisionAction =
  (typeof KNOWLEDGE_DECISION_ACTIONS)[number];

export const KNOWLEDGE_APPROVER_ROLES = ["OWNER", "ADMIN"] as const;
export type KnowledgeApproverRole =
  (typeof KNOWLEDGE_APPROVER_ROLES)[number];

const RECORD_IDENTIFIER_MAX_LENGTH = 200;
export const KNOWLEDGE_REJECTION_REASON_MAX_LENGTH = 1000;

const rawDecisionSchema = z
  .object({
    recordType: knowledgeQueueRecordTypeSchema,
    recordId: z.string().trim().min(1).max(RECORD_IDENTIFIER_MAX_LENGTH),
    decision: z.enum(KNOWLEDGE_DECISION_ACTIONS),
    evidenceDocumentId: z.unknown().optional(),
    reasonAr: z.unknown().optional(),
    reasonEn: z.unknown().optional(),
  })
  .strict();

export type ApproveKnowledgeDecision = Readonly<{
  action: "APPROVE";
  evidenceDocumentId: string;
}>;

export type RejectKnowledgeDecision = Readonly<{
  action: "REJECT";
  reasonAr: string;
  reasonEn: string;
}>;

export type ValidatedKnowledgeDecision =
  | ApproveKnowledgeDecision
  | RejectKnowledgeDecision;

export type ValidatedKnowledgeDecisionPayload = Readonly<{
  recordType: KnowledgeQueueRecordType;
  recordId: string;
  decision: ValidatedKnowledgeDecision;
}>;

export type KnowledgeDecisionLanguage = "ar" | "en";

export type KnowledgeDecisionPayloadValidation =
  | Readonly<{ ok: true; value: ValidatedKnowledgeDecisionPayload }>
  | Readonly<{
      ok: false;
      code: "REQUEST_VALIDATION_FAILED";
      fieldPaths: readonly string[];
    }>
  | Readonly<{
      ok: false;
      code: "REJECTION_REASON_INVALID";
      languages: readonly KnowledgeDecisionLanguage[];
      fieldPaths: readonly ("reasonAr" | "reasonEn")[];
    }>;

/**
 * Strictly validates one decision payload.
 *
 * Rejection reasons receive their requirement-specific error rather than the
 * generic request-validation code, including when either language is omitted,
 * non-string, empty after trimming, or longer than 1,000 characters.
 */
export function validateKnowledgeDecisionPayload(
  raw: unknown
): KnowledgeDecisionPayloadValidation {
  const parsed = rawDecisionSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      code: "REQUEST_VALIDATION_FAILED",
      fieldPaths: zodFieldPaths(parsed.error),
    };
  }

  const { recordType, recordId, decision } = parsed.data;
  if (decision === "APPROVE") {
    const evidenceDocumentId = normalizedIdentifier(
      parsed.data.evidenceDocumentId
    );
    if (!evidenceDocumentId) {
      return {
        ok: false,
        code: "REQUEST_VALIDATION_FAILED",
        fieldPaths: ["evidenceDocumentId"],
      };
    }
    return {
      ok: true,
      value: {
        recordType,
        recordId,
        decision: { action: "APPROVE", evidenceDocumentId },
      },
    };
  }

  const reasonAr = normalizedRejectionReason(parsed.data.reasonAr);
  const reasonEn = normalizedRejectionReason(parsed.data.reasonEn);
  const languages: KnowledgeDecisionLanguage[] = [];
  const fieldPaths: ("reasonAr" | "reasonEn")[] = [];
  if (!reasonAr) {
    languages.push("ar");
    fieldPaths.push("reasonAr");
  }
  if (!reasonEn) {
    languages.push("en");
    fieldPaths.push("reasonEn");
  }
  if (!reasonAr || !reasonEn) {
    return {
      ok: false,
      code: "REJECTION_REASON_INVALID",
      languages,
      fieldPaths,
    };
  }

  return {
    ok: true,
    value: {
      recordType,
      recordId,
      decision: { action: "REJECT", reasonAr, reasonEn },
    },
  };
}

function normalizedIdentifier(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length >= 1 &&
    normalized.length <= RECORD_IDENTIFIER_MAX_LENGTH
    ? normalized
    : null;
}

function normalizedRejectionReason(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length >= 1 &&
    normalized.length <= KNOWLEDGE_REJECTION_REASON_MAX_LENGTH
    ? normalized
    : null;
}

/* -------------------------------------------------------------------------- */
/* Persistence contract                                                       */
/* -------------------------------------------------------------------------- */

export type KnowledgeDecisionSnapshot = Readonly<{
  recordType: KnowledgeQueueRecordType;
  recordId: string;
  status: KnowledgeDecisionState;
  reviewerId: string | null;
  decisionAt: Date | null;
}>;

export type KnowledgeDecisionWrite = Readonly<{
  workspaceId: string;
  reviewerId: string;
  recordType: KnowledgeQueueRecordType;
  recordId: string;
  decidedAt: Date;
  decision: ValidatedKnowledgeDecision;
}>;

export type KnowledgeDecisionWriteOutcome =
  | Readonly<{ kind: "DECIDED"; decision: KnowledgeDecisionSnapshot }>
  | Readonly<{
      kind: "ALREADY_DECIDED";
      decision: KnowledgeDecisionSnapshot;
    }>
  | Readonly<{ kind: "NOT_FOUND" }>
  | Readonly<{ kind: "EVIDENCE_VERSION_MISSING" }>;

export interface KnowledgeDecisionRepository {
  recordDecision(
    input: KnowledgeDecisionWrite
  ): Promise<KnowledgeDecisionWriteOutcome>;
}

/* -------------------------------------------------------------------------- */
/* Command/result contract                                                    */
/* -------------------------------------------------------------------------- */

export type KnowledgeDecisionActor = Readonly<{
  userId: string;
  membershipRole: string;
}>;

export type DecideKnowledgeCommand = Readonly<{
  actor: KnowledgeDecisionActor;
  workspace: Readonly<{ id: string }>;
  payload: unknown;
}>;

export type SerializedKnowledgeDecision = Readonly<{
  recordType: KnowledgeQueueRecordType;
  recordId: string;
  status: KnowledgeDecisionState;
  reviewerId: string | null;
  decisionAt: string | null;
}>;

export type DecideKnowledgeResult =
  | Readonly<{
      ok: true;
      status: 200;
      decision: SerializedKnowledgeDecision;
    }>
  | Readonly<{
      ok: false;
      status: 403;
      code: "APPROVAL_FORBIDDEN";
    }>
  | Readonly<{
      ok: false;
      status: 400;
      code: "REQUEST_VALIDATION_FAILED";
      fieldPaths: readonly string[];
    }>
  | Readonly<{
      ok: false;
      status: 400;
      code: "REJECTION_REASON_INVALID";
      languages: readonly KnowledgeDecisionLanguage[];
      fieldPaths: readonly ("reasonAr" | "reasonEn")[];
    }>
  | Readonly<{
      ok: false;
      status: 404;
      code: "KNOWLEDGE_RECORD_NOT_FOUND";
    }>
  | Readonly<{
      ok: false;
      status: 409;
      code: "EVIDENCE_VERSION_MISSING";
    }>
  | Readonly<{
      ok: false;
      status: 409;
      code: "KNOWLEDGE_DECISION_ALREADY_RECORDED";
      decision: SerializedKnowledgeDecision;
    }>;

export interface KnowledgeDecisionService {
  decide(command: DecideKnowledgeCommand): Promise<DecideKnowledgeResult>;
}

export type KnowledgeDecisionServiceDependencies = Readonly<{
  repository: KnowledgeDecisionRepository;
  clock?: UtcClock;
}>;

export function createKnowledgeDecisionService(
  dependencies: KnowledgeDecisionServiceDependencies
): KnowledgeDecisionService {
  const clock = dependencies.clock ?? systemUtcClock;

  async function decide(
    command: DecideKnowledgeCommand
  ): Promise<DecideKnowledgeResult> {
    // Authorization precedes payload parsing and every persistence call so a
    // forbidden reviewer cannot probe record or evidence existence.
    if (!isKnowledgeApproverRole(command.actor.membershipRole)) {
      return { ok: false, status: 403, code: "APPROVAL_FORBIDDEN" };
    }

    const validation = validateKnowledgeDecisionPayload(command.payload);
    if (!validation.ok) {
      if (validation.code === "REJECTION_REASON_INVALID") {
        return {
          ok: false,
          status: 400,
          code: validation.code,
          languages: validation.languages,
          fieldPaths: validation.fieldPaths,
        };
      }
      return {
        ok: false,
        status: 400,
        code: validation.code,
        fieldPaths: validation.fieldPaths,
      };
    }

    const outcome = await dependencies.repository.recordDecision({
      workspaceId: command.workspace.id,
      reviewerId: command.actor.userId,
      recordType: validation.value.recordType,
      recordId: validation.value.recordId,
      decidedAt: utcNow(clock),
      decision: validation.value.decision,
    });

    switch (outcome.kind) {
      case "DECIDED":
        return {
          ok: true,
          status: 200,
          decision: serializeKnowledgeDecision(outcome.decision),
        };
      case "ALREADY_DECIDED":
        return {
          ok: false,
          status: 409,
          code: "KNOWLEDGE_DECISION_ALREADY_RECORDED",
          decision: serializeKnowledgeDecision(outcome.decision),
        };
      case "NOT_FOUND":
        return {
          ok: false,
          status: 404,
          code: "KNOWLEDGE_RECORD_NOT_FOUND",
        };
      case "EVIDENCE_VERSION_MISSING":
        return {
          ok: false,
          status: 409,
          code: "EVIDENCE_VERSION_MISSING",
        };
    }
  }

  return Object.freeze({ decide });
}

export function isKnowledgeApproverRole(
  role: string
): role is KnowledgeApproverRole {
  return (KNOWLEDGE_APPROVER_ROLES as readonly string[]).includes(role);
}

export function serializeKnowledgeDecision(
  decision: KnowledgeDecisionSnapshot
): SerializedKnowledgeDecision {
  return {
    recordType: decision.recordType,
    recordId: decision.recordId,
    status: decision.status,
    reviewerId: decision.reviewerId,
    decisionAt: decision.decisionAt?.toISOString() ?? null,
  };
}
