/**
 * Invitation_Service — workspace invitation creation, listing, revocation, and
 * acceptance (requirements 3.1 – 3.11).
 *
 * The module is a pure domain service in the same shape as
 * `account-service.ts`: persistence, email delivery, audit writing, password
 * hashing, the clock, and cryptographic randomness are injected.
 * `invitation-service-prisma.ts` supplies the production adapters, so unit and
 * property tests drive these rules with in-memory repositories and provider
 * fakes without a network call or a shared-database mutation (design 3.1, 4.1).
 *
 * Atomicity is owned by the repository so one method equals one serializable
 * transaction:
 * - `createPendingInvitation` revokes every earlier unconsumed invitation for
 *   the same workspace and normalized address, re-checks membership and the seat
 *   allowance, and inserts the replacement row (criteria 3.1, 3.8);
 * - `acceptInvitation` re-reads the token, invited address, user, membership,
 *   invited role, and seat state before creating anything and consumes the token
 *   in the same transaction (criteria 3.2, 3.3, 3.4, 3.8);
 * - `revokePendingInvitation` closes a pending row conditionally (criterion 3.6).
 *
 * A raw token value exists only inside the outgoing message. It is never
 * persisted, returned, logged, or written to an audit entry (criterion 3.1).
 */

import { z } from "zod";
import {
  createTokenDigest,
  getTokenDigestLookup,
  nodeCryptographicRandomSource,
  verifyTokenDigest,
  MAX_RAW_TOKEN_LENGTH,
  type CryptographicRandomSource,
} from "./token-digest";
import { createKeysetCursorCodec } from "./keyset-cursor";
import {
  addUtcMilliseconds,
  fixedUtcClock,
  systemUtcClock,
  utcNow,
  type UtcClock,
} from "./time";
import {
  systemDeadlineScheduler,
  withProviderDeadline,
  ProviderDeadlineExceededError,
  type DeadlineScheduler,
} from "./provider-timeout";
import { isReservedDevelopmentIdentity } from "./production-identities";
import { getAppBaseUrl } from "./tokens";
import { hashPassword } from "./password";
import {
  buildInvitationEmailContent,
  buildInvitationUrl,
  INVITATION_LINK_EXPIRY_DAYS,
  type InvitationEmailContent,
} from "./invitation-email";
import {
  canManageInvitations,
  isInvitationTargetRole,
  INVITATION_ACCEPTANCE_BOUNDS,
  type InvitationTargetRole,
} from "./invitation-roles";
import type { Locale } from "./types";

export { INVITATION_ACCEPTANCE_BOUNDS } from "./invitation-roles";

/* -------------------------------------------------------------------------- */
/* Contract constants                                                         */
/* -------------------------------------------------------------------------- */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Single-use invitation token lifetime (criterion 3.1). */
export const INVITATION_TOKEN_TTL_MS = INVITATION_LINK_EXPIRY_DAYS * DAY_MS;

/** Invited-address bounds; the same grammar the account service enforces. */
export const INVITATION_EMAIL_BOUNDS = Object.freeze({ min: 5, max: 254 });

/** Bounded pending-invitation page size (criterion 3.7). */
export const INVITATION_PAGE_SIZE_MAX = 50;

/** Invitation-email delivery deadline, matching the account boundary. */
export const INVITATION_EMAIL_DEADLINE_MS = 30_000;

/** Delivery states reported by the list surface (criterion 3.7). */
export const INVITATION_DELIVERY_STATES = [
  "PENDING",
  "SENT",
  "UNCONFIGURED",
  "FAILED",
] as const;

export type InvitationDeliveryState =
  (typeof INVITATION_DELIVERY_STATES)[number];

const DEFAULT_INVITEE_LOCALE: Locale = "ar";
const SUPPORTED_LOCALES: readonly Locale[] = ["ar", "en"];
const MIN_RAW_TOKEN_LENGTH = 10;
const UNKNOWN_SOURCE_ADDRESS = "unknown";
const MAX_SOURCE_ADDRESS_LENGTH = 128;

/** Same deliberately strict address grammar as the account service. */
const EMAIL_PATTERN =
  /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/u;
const MAX_EMAIL_LOCAL_PART_LENGTH = 64;

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

export type NormalizedInvitationRequest = Readonly<{
  /** Trimmed, case-folded invited address (criterion 3.1). */
  email: string;
  role: InvitationTargetRole;
}>;

export type InvitationRequestValidation =
  | Readonly<{ ok: true; value: NormalizedInvitationRequest }>
  | Readonly<{ ok: false; fieldPaths: readonly string[] }>;

export type NormalizedAcceptanceAccount = Readonly<{
  displayName: string;
  password: string;
  locale: Locale;
}>;

export type AcceptanceAccountValidation =
  | Readonly<{ ok: true; value: NormalizedAcceptanceAccount }>
  | Readonly<{ ok: false; fieldPaths: readonly string[] }>;

/** Trimmed, case-folded address form used for every invitation comparison. */
export function normalizeInvitationEmail(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Validates an invitation request. Only administrator and member are accepted
 * target roles, so an invitation can never grant ownership (criterion 3.1).
 */
export function validateInvitationRequest(
  payload: unknown
): InvitationRequestValidation {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return { ok: false, fieldPaths: ["email", "role"] };
  }

  const record = payload as Readonly<Record<string, unknown>>;
  const offending: string[] = [];

  const email = typeof record.email === "string" ? record.email.trim() : null;
  if (
    email === null ||
    email.length < INVITATION_EMAIL_BOUNDS.min ||
    email.length > INVITATION_EMAIL_BOUNDS.max ||
    !isEmailAddressFormat(email)
  ) {
    offending.push("email");
  }

  let role: InvitationTargetRole = "MEMBER";
  if (record.role !== undefined && record.role !== null) {
    if (isInvitationTargetRole(record.role)) {
      role = record.role;
    } else {
      offending.push("role");
    }
  }

  if (offending.length > 0) return { ok: false, fieldPaths: offending };
  return {
    ok: true,
    value: { email: normalizeInvitationEmail(email as string), role },
  };
}

/**
 * Validates the account-creation fields of an acceptance submission
 * (criteria 3.2, 3.11). Only reached when no account exists for the invited
 * address.
 */
export function validateAcceptanceAccount(
  payload: unknown
): AcceptanceAccountValidation {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return { ok: false, fieldPaths: ["displayName", "password"] };
  }

  const record = payload as Readonly<Record<string, unknown>>;
  const offending: string[] = [];

  // `name` is the field the existing acceptance form submits; `displayName` is
  // the requirement's wording. Both are accepted and reported as one path.
  const rawName =
    typeof record.displayName === "string"
      ? record.displayName
      : typeof record.name === "string"
        ? record.name
        : null;
  const displayName = rawName === null ? null : rawName.trim();
  if (
    displayName === null ||
    displayName.length < INVITATION_ACCEPTANCE_BOUNDS.displayName.min ||
    displayName.length > INVITATION_ACCEPTANCE_BOUNDS.displayName.max
  ) {
    offending.push("displayName");
  }

  const password = typeof record.password === "string" ? record.password : null;
  if (
    password === null ||
    password.length < INVITATION_ACCEPTANCE_BOUNDS.password.min ||
    password.length > INVITATION_ACCEPTANCE_BOUNDS.password.max
  ) {
    offending.push("password");
  }

  let locale: Locale = DEFAULT_INVITEE_LOCALE;
  if (record.locale !== undefined && record.locale !== null) {
    if (
      typeof record.locale === "string" &&
      SUPPORTED_LOCALES.includes(record.locale as Locale)
    ) {
      locale = record.locale as Locale;
    } else {
      offending.push("locale");
    }
  }

  if (offending.length > 0) return { ok: false, fieldPaths: offending };
  return {
    ok: true,
    value: {
      displayName: displayName as string,
      password: password as string,
      locale,
    },
  };
}

/** Bounded, non-empty submitted token, or null when it cannot be a token. */
export function readSubmittedInvitationToken(value: unknown): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const token = (value as Readonly<Record<string, unknown>>).token;
  if (typeof token !== "string") return null;
  const trimmed = token.trim();
  if (
    trimmed.length < MIN_RAW_TOKEN_LENGTH ||
    trimmed.length > MAX_RAW_TOKEN_LENGTH
  ) {
    return null;
  }
  return trimmed;
}

/* -------------------------------------------------------------------------- */
/* Keyset cursor                                                              */
/* -------------------------------------------------------------------------- */

const invitationCursorScopeSchema = z.object({ workspaceId: z.string().min(1) });
const invitationCursorSortSchema = z.object({
  createdAt: z.string().min(1),
  id: z.string().min(1),
});

/**
 * Versioned cursor over the exact list ordering — creation timestamp descending
 * with the identifier as tie-breaker — scoped to the addressed workspace, so a
 * cursor cannot be replayed against another tenant (design 3.3, criterion 3.7).
 */
export const INVITATION_CURSOR_CODEC = createKeysetCursorCodec({
  resource: "workspace-invitations",
  scopeSchema: invitationCursorScopeSchema,
  sortSchema: invitationCursorSortSchema,
});

export function encodeInvitationCursor(
  workspaceId: string,
  position: Readonly<{ createdAt: Date; id: string }>
): string {
  return INVITATION_CURSOR_CODEC.encode({
    scope: { workspaceId },
    sort: { createdAt: position.createdAt.toISOString(), id: position.id },
  });
}

/** Decodes a cursor, or returns null when it does not address this workspace. */
export function decodeInvitationCursor(
  cursor: string,
  workspaceId: string
): Readonly<{ createdAt: Date; id: string }> | null {
  try {
    const decoded = INVITATION_CURSOR_CODEC.decode(cursor, { workspaceId });
    const createdAt = new Date(decoded.sort.createdAt);
    if (!Number.isFinite(createdAt.getTime())) return null;
    return { createdAt, id: decoded.sort.id };
  } catch {
    return null;
  }
}

/** Clamps a requested page size into the bound stated by criterion 3.7. */
export function resolveInvitationPageSize(requested: unknown): number {
  if (requested === undefined || requested === null) {
    return INVITATION_PAGE_SIZE_MAX;
  }
  const value =
    typeof requested === "number"
      ? requested
      : typeof requested === "string" && /^\d{1,4}$/u.test(requested.trim())
        ? Number.parseInt(requested.trim(), 10)
        : Number.NaN;
  if (!Number.isSafeInteger(value) || value < 1) return INVITATION_PAGE_SIZE_MAX;
  return Math.min(value, INVITATION_PAGE_SIZE_MAX);
}

/** Maps a persisted delivery state onto the reported vocabulary. */
export function normalizeInvitationDeliveryState(
  value: string | null | undefined
): InvitationDeliveryState {
  if (
    typeof value === "string" &&
    (INVITATION_DELIVERY_STATES as readonly string[]).includes(value)
  ) {
    return value as InvitationDeliveryState;
  }
  // Rows written before the vocabulary existed recorded a skipped send when the
  // email boundary was unset.
  if (value === "SKIPPED") return "UNCONFIGURED";
  return "PENDING";
}

function isEmailAddressFormat(value: string): boolean {
  if (!EMAIL_PATTERN.test(value)) return false;
  const localPart = value.slice(0, value.lastIndexOf("@"));
  return localPart.length <= MAX_EMAIL_LOCAL_PART_LENGTH;
}

/* -------------------------------------------------------------------------- */
/* Injected boundaries                                                        */
/* -------------------------------------------------------------------------- */

export type InvitationTokenDigest = Readonly<{
  tokenHash: string;
  hashSalt: string;
  hashVersion: number;
  createdAt: Date;
  expiresAt: Date;
}>;

export type InvitationSeatUsage = Readonly<{
  /** Bounded seat allowance of the active plan, or null when unbounded. */
  seatAllowance: number | null;
  memberCount: number;
  pendingInvitationCount: number;
}>;

export type CreateInvitationInput = Readonly<{
  workspaceId: string;
  email: string;
  role: InvitationTargetRole;
  inviterId: string;
  createdAt: Date;
  token: InvitationTokenDigest;
}>;

export type CreatedInvitation = Readonly<{
  id: string;
  workspaceId: string;
  email: string;
  role: string;
  createdAt: Date;
  expiresAt: Date;
  emailDeliveryState: string;
  /** Number of earlier unconsumed invitations closed by this replacement. */
  replacedCount: number;
}>;

export type CreateInvitationOutcome =
  | Readonly<{ kind: "CREATED"; invitation: CreatedInvitation }>
  | Readonly<{ kind: "ALREADY_MEMBER" }>
  | Readonly<{ kind: "SEAT_LIMIT_REACHED" }>;

export type StoredPendingInvitation = Readonly<{
  id: string;
  workspaceId: string;
  email: string;
  role: string;
  createdAt: Date;
  expiresAt: Date;
  emailDeliveryState: string | null;
  inviter: Readonly<{
    id: string;
    name: string | null;
    email: string;
  }> | null;
}>;

export type PendingInvitationPageQuery = Readonly<{
  workspaceId: string;
  /** Rows to read; the caller asks for one extra row to detect a next page. */
  limit: number;
  now: Date;
  after?: Readonly<{ createdAt: Date; id: string }> | null;
}>;

export type RevokeInvitationInput = Readonly<{
  workspaceId: string;
  invitationId: string;
  revokedAt: Date;
}>;

export type RevokeInvitationOutcome =
  | Readonly<{ kind: "REVOKED"; email: string; role: string }>
  | Readonly<{ kind: "NOT_FOUND" }>
  | Readonly<{ kind: "ALREADY_CLOSED" }>;

export type StoredInvitation = Readonly<{
  id: string;
  workspaceId: string;
  workspaceName: string;
  email: string;
  role: string;
  tokenHash: string;
  hashSalt: string | null;
  hashVersion: number | null;
  createdAt: Date;
  expiresAt: Date;
  consumedAt: Date | null;
  revokedAt: Date | null;
}>;

export type AcceptInvitationActor =
  | Readonly<{ kind: "EXISTING_USER"; userId: string }>
  | Readonly<{
      kind: "NEW_USER";
      displayName: string;
      passwordHash: string;
      locale: Locale;
    }>;

export type AcceptInvitationInput = Readonly<{
  invitationId: string;
  /** Re-read guard: the digest the submitted token resolved to. */
  tokenHash: string;
  workspaceId: string;
  /** Normalized invited address re-read inside the transaction. */
  email: string;
  acceptedAt: Date;
  actor: AcceptInvitationActor;
}>;

export type AcceptInvitationOutcome =
  | Readonly<{
      kind: "ACCEPTED";
      workspaceId: string;
      userId: string;
      role: string;
      createdUser: boolean;
    }>
  | Readonly<{ kind: "ALREADY_MEMBER"; workspaceId: string; role: string }>
  | Readonly<{ kind: "TOKEN_INVALID" }>
  | Readonly<{ kind: "REVOKED" }>
  | Readonly<{ kind: "SEAT_LIMIT_REACHED" }>
  /** The invited address gained an account before this acceptance committed. */
  | Readonly<{ kind: "ACCOUNT_EXISTS" }>;

/**
 * Persistence boundary. Every method that a requirement describes as one atomic
 * step must be one serializable transaction in the adapter.
 */
export interface InvitationRepository {
  findMembershipByEmail(
    input: Readonly<{ workspaceId: string; email: string }>
  ): Promise<Readonly<{ userId: string; role: string }> | null>;
  readSeatUsage(
    input: Readonly<{ workspaceId: string; now: Date }>
  ): Promise<InvitationSeatUsage>;
  createPendingInvitation(
    input: CreateInvitationInput
  ): Promise<CreateInvitationOutcome>;
  listPendingInvitations(
    query: PendingInvitationPageQuery
  ): Promise<readonly StoredPendingInvitation[]>;
  revokePendingInvitation(
    input: RevokeInvitationInput
  ): Promise<RevokeInvitationOutcome>;
  recordEmailDeliveryState(
    input: Readonly<{ invitationId: string; state: InvitationDeliveryState }>
  ): Promise<void>;
  findInvitationByTokenHash(tokenHash: string): Promise<StoredInvitation | null>;
  findUserIdByNormalizedEmail(email: string): Promise<string | null>;
  acceptInvitation(
    input: AcceptInvitationInput
  ): Promise<AcceptInvitationOutcome>;
}

export type EmailSendOutcome = Readonly<{ ok: boolean; skipped?: boolean }>;

export interface InvitationEmailProvider {
  /** Whether the email Configuration_Boundary is set. */
  isConfigured(): boolean;
  send(
    message: InvitationEmailContent,
    context: Readonly<{ signal: AbortSignal }>
  ): Promise<EmailSendOutcome>;
}

export type InvitationAuditAction =
  | "WORKSPACE_INVITE_CREATE"
  | "WORKSPACE_INVITE_REVOKE"
  | "WORKSPACE_INVITE_ACCEPT"
  | "USER_CREATE";

/**
 * Audit entry appended after commit. The typed detail shape carries identifiers,
 * the invited address, the role, and a UTC timestamp, and structurally cannot
 * carry token material (criterion 3.1).
 */
export type InvitationAuditEntry = Readonly<{
  action: InvitationAuditAction;
  userId: string;
  resource: "WorkspaceInvitation" | "Workspace" | "User";
  resourceId?: string;
  severity: "INFO" | "WARN";
  sourceAddress: string;
  details: Readonly<{
    workspaceId: string;
    email: string;
    role?: string;
    invitationId?: string;
    occurredAt: string;
    emailDelivery?: InvitationDeliveryState;
    replacedCount?: number;
    via?: "invitation";
  }>;
}>;

export interface InvitationAuditSink {
  append(entry: InvitationAuditEntry): Promise<void>;
}

export interface PasswordHasher {
  hash(plainPassword: string): Promise<string>;
}

export const defaultInvitationPasswordHasher: PasswordHasher = Object.freeze({
  hash: (plainPassword) => hashPassword(plainPassword),
});

export type InvitationServiceDependencies = Readonly<{
  repository: InvitationRepository;
  email: InvitationEmailProvider;
  audit: InvitationAuditSink;
  passwordHasher?: PasswordHasher;
  clock?: UtcClock;
  randomness?: CryptographicRandomSource;
  /** Absolute base URL used to build the acceptance link. */
  baseUrl?: string;
  emailDeadlineMs?: number;
  /** Injected only so a test can drive the delivery deadline without waiting. */
  deadlineScheduler?: DeadlineScheduler;
}>;

/* -------------------------------------------------------------------------- */
/* Commands and results                                                       */
/* -------------------------------------------------------------------------- */

export type InvitationActor = Readonly<{
  userId: string;
  membershipRole: string;
  platformRole: string;
}>;

export type InvitationWorkspace = Readonly<{ id: string; name: string }>;

export type PendingInvitationView = Readonly<{
  id: string;
  workspaceId: string;
  email: string;
  role: string;
  createdAt: string;
  expiresAt: string;
  emailDeliveryState: InvitationDeliveryState;
  inviter: Readonly<{
    id: string;
    name: string | null;
    email: string;
  }> | null;
}>;

export type CreateInvitationCommand = Readonly<{
  actor: InvitationActor;
  workspace: InvitationWorkspace;
  payload: unknown;
  sourceAddress?: string | null;
}>;

export type CreateInvitationResult =
  | Readonly<{
      ok: true;
      status: 201;
      code: "INVITATION_SENT";
      emailDelivery: InvitationDeliveryState;
      invitation: PendingInvitationView;
    }>
  | Readonly<{ ok: false; status: 403; code: "INVITE_FORBIDDEN" }>
  | Readonly<{
      ok: false;
      status: 400;
      code: "REQUEST_VALIDATION_FAILED";
      fieldPaths: readonly string[];
    }>
  | Readonly<{ ok: false; status: 409; code: "ALREADY_A_MEMBER" }>
  | Readonly<{ ok: false; status: 429; code: "SEAT_LIMIT_REACHED" }>;

export type ListInvitationsCommand = Readonly<{
  actor: InvitationActor;
  workspace: InvitationWorkspace;
  pageSize?: unknown;
  /** Decoded keyset position; the route owns cursor encoding and validation. */
  after?: Readonly<{ createdAt: Date; id: string }> | null;
}>;

export type ListInvitationsResult =
  | Readonly<{
      ok: true;
      status: 200;
      invitations: readonly PendingInvitationView[];
      nextPosition: Readonly<{ createdAt: Date; id: string }> | null;
    }>
  | Readonly<{ ok: false; status: 403; code: "INVITE_FORBIDDEN" }>;

export type RevokeInvitationCommand = Readonly<{
  actor: InvitationActor;
  workspace: InvitationWorkspace;
  invitationId: unknown;
  sourceAddress?: string | null;
}>;

export type RevokeInvitationResult =
  | Readonly<{
      ok: true;
      status: 200;
      code: "INVITATION_REVOKED";
      invitationId: string;
    }>
  | Readonly<{ ok: false; status: 403; code: "INVITE_FORBIDDEN" }>
  | Readonly<{ ok: false; status: 404; code: "RESOURCE_NOT_FOUND" }>
  | Readonly<{ ok: false; status: 400; code: "INVITATION_REVOKED" }>;

export type AcceptInvitationCommand = Readonly<{
  payload: unknown;
  /** Server-resolved session, or null for an unauthenticated submission. */
  session?: Readonly<{ userId: string; email: string }> | null;
  sourceAddress?: string | null;
}>;

export type AcceptInvitationResult =
  | Readonly<{
      ok: true;
      status: 200 | 201;
      code: "INVITATION_ACCEPTED";
      workspaceId: string;
      role: string;
      userId: string;
      createdUser: boolean;
    }>
  | Readonly<{ ok: false; status: 400; code: "INVITATION_TOKEN_INVALID" }>
  | Readonly<{ ok: false; status: 400; code: "INVITATION_REVOKED" }>
  | Readonly<{ ok: false; status: 400; code: "RESERVED_IDENTITY" }>
  | Readonly<{
      ok: false;
      status: 400;
      code: "INVITATION_ACCEPTANCE_INVALID";
      fieldPaths: readonly string[];
    }>
  | Readonly<{ ok: false; status: 401; code: "AUTHENTICATION_REQUIRED" }>
  | Readonly<{ ok: false; status: 403; code: "INVITATION_EMAIL_MISMATCH" }>
  | Readonly<{
      ok: false;
      status: 409;
      code: "ALREADY_A_MEMBER";
      workspaceId: string;
    }>
  | Readonly<{ ok: false; status: 429; code: "SEAT_LIMIT_REACHED" }>;

export interface InvitationService {
  createInvitation(
    command: CreateInvitationCommand
  ): Promise<CreateInvitationResult>;
  listPendingInvitations(
    command: ListInvitationsCommand
  ): Promise<ListInvitationsResult>;
  revokeInvitation(
    command: RevokeInvitationCommand
  ): Promise<RevokeInvitationResult>;
  acceptInvitation(
    command: AcceptInvitationCommand
  ): Promise<AcceptInvitationResult>;
}

/* -------------------------------------------------------------------------- */
/* Service                                                                    */
/* -------------------------------------------------------------------------- */

export function createInvitationService(
  dependencies: InvitationServiceDependencies
): InvitationService {
  const repository = dependencies.repository;
  const emailProvider = dependencies.email;
  const auditSink = dependencies.audit;
  const passwordHasher =
    dependencies.passwordHasher ?? defaultInvitationPasswordHasher;
  const clock = dependencies.clock ?? systemUtcClock;
  const randomness = dependencies.randomness ?? nodeCryptographicRandomSource;
  const emailDeadlineMs =
    dependencies.emailDeadlineMs ?? INVITATION_EMAIL_DEADLINE_MS;
  const deadlineScheduler =
    dependencies.deadlineScheduler ?? systemDeadlineScheduler;

  async function appendAudit(entry: InvitationAuditEntry): Promise<void> {
    try {
      await auditSink.append(entry);
    } catch (error) {
      // An audit sink failure must never roll back or fail a committed change.
      console.error("[invitation-service] audit append failed", {
        action: entry.action,
        errorName: error instanceof Error ? error.name : typeof error,
      });
    }
  }

  function authorized(actor: InvitationActor): boolean {
    return canManageInvitations(actor.membershipRole, actor.platformRole);
  }

  function seatAllowanceExhausted(
    usage: InvitationSeatUsage,
    pendingAdjustment = 0
  ): boolean {
    const allowance = usage.seatAllowance;
    if (allowance === null || !Number.isSafeInteger(allowance) || allowance <= 0) {
      return false;
    }
    const pending = Math.max(0, usage.pendingInvitationCount + pendingAdjustment);
    return usage.memberCount + pending >= allowance;
  }

  async function createInvitation(
    command: CreateInvitationCommand
  ): Promise<CreateInvitationResult> {
    // Criterion 3.5: authorization precedes every read and write.
    if (!authorized(command.actor)) {
      return { ok: false, status: 403, code: "INVITE_FORBIDDEN" };
    }

    const validation = validateInvitationRequest(command.payload);
    if (!validation.ok) {
      return {
        ok: false,
        status: 400,
        code: "REQUEST_VALIDATION_FAILED",
        fieldPaths: validation.fieldPaths,
      };
    }
    const request = validation.value;
    const sourceAddress = normalizeSourceAddress(command.sourceAddress);
    const now = utcNow(clock);

    const membership = await repository.findMembershipByEmail({
      workspaceId: command.workspace.id,
      email: request.email,
    });
    if (membership) {
      return { ok: false, status: 409, code: "ALREADY_A_MEMBER" };
    }

    // Criterion 3.8: the pre-check answers quickly; the transaction re-checks.
    const usage = await repository.readSeatUsage({
      workspaceId: command.workspace.id,
      now,
    });
    if (seatAllowanceExhausted(usage)) {
      return { ok: false, status: 429, code: "SEAT_LIMIT_REACHED" };
    }

    const issued = createTokenDigest({ randomness });
    const expiresAt = addUtcMilliseconds(now, INVITATION_TOKEN_TTL_MS);

    const outcome = await repository.createPendingInvitation({
      workspaceId: command.workspace.id,
      email: request.email,
      role: request.role,
      inviterId: command.actor.userId,
      createdAt: now,
      token: {
        tokenHash: issued.tokenHash,
        hashSalt: issued.hashSalt,
        hashVersion: issued.hashVersion,
        createdAt: now,
        expiresAt,
      },
    });

    if (outcome.kind === "ALREADY_MEMBER") {
      return { ok: false, status: 409, code: "ALREADY_A_MEMBER" };
    }
    if (outcome.kind === "SEAT_LIMIT_REACHED") {
      return { ok: false, status: 429, code: "SEAT_LIMIT_REACHED" };
    }

    const created = outcome.invitation;
    const emailDelivery = await deliverInvitationEmail({
      invitationId: created.id,
      email: created.email,
      role: request.role,
      workspaceName: command.workspace.name,
      rawToken: issued.rawToken,
    });

    await appendAudit({
      action: "WORKSPACE_INVITE_CREATE",
      userId: command.actor.userId,
      resource: "WorkspaceInvitation",
      resourceId: created.id,
      severity: "INFO",
      sourceAddress,
      details: {
        workspaceId: created.workspaceId,
        email: created.email,
        role: created.role,
        invitationId: created.id,
        occurredAt: now.toISOString(),
        emailDelivery,
        replacedCount: created.replacedCount,
      },
    });

    return {
      ok: true,
      status: 201,
      code: "INVITATION_SENT",
      emailDelivery,
      invitation: {
        id: created.id,
        workspaceId: created.workspaceId,
        email: created.email,
        role: created.role,
        createdAt: created.createdAt.toISOString(),
        expiresAt: created.expiresAt.toISOString(),
        emailDeliveryState: emailDelivery,
        inviter: null,
      },
    };
  }

  /**
   * Sends the bilingual invitation message behind a bounded deadline and records
   * the resulting delivery state on the committed invitation (criterion 3.7).
   * A delivery failure never invalidates the persisted invitation.
   */
  async function deliverInvitationEmail(input: {
    readonly invitationId: string;
    readonly email: string;
    readonly role: InvitationTargetRole;
    readonly workspaceName: string;
    readonly rawToken: string;
  }): Promise<InvitationDeliveryState> {
    const state = await sendInvitationEmail(input);
    try {
      await repository.recordEmailDeliveryState({
        invitationId: input.invitationId,
        state,
      });
    } catch (error) {
      console.error("[invitation-service] delivery state write failed", {
        errorName: error instanceof Error ? error.name : typeof error,
      });
    }
    return state;
  }

  async function sendInvitationEmail(input: {
    readonly email: string;
    readonly role: InvitationTargetRole;
    readonly workspaceName: string;
    readonly rawToken: string;
  }): Promise<InvitationDeliveryState> {
    if (!emailProvider.isConfigured()) return "UNCONFIGURED";

    const message = buildInvitationEmailContent({
      to: input.email,
      // An invitee has no persisted locale before acceptance, so the platform
      // default (Arabic) is rendered first and both languages are included.
      locale: DEFAULT_INVITEE_LOCALE,
      workspaceName: input.workspaceName,
      role: input.role,
      invitationUrl: buildInvitationUrl(
        dependencies.baseUrl ?? getAppBaseUrl(),
        input.rawToken
      ),
      expiryDays: INVITATION_LINK_EXPIRY_DAYS,
    });

    try {
      const outcome = await withProviderDeadline(
        (signal) => emailProvider.send(message, { signal }),
        {
          provider: "invitation-email",
          timeoutMs: emailDeadlineMs,
          scheduler: deadlineScheduler,
        }
      );
      if (outcome.ok) return "SENT";
      return outcome.skipped ? "UNCONFIGURED" : "FAILED";
    } catch (error) {
      // Timeout and provider exception share the failure branch; the message is
      // never logged, so the raw token cannot reach a log sink.
      console.error("[invitation-service] invitation email not delivered", {
        errorName: error instanceof Error ? error.name : typeof error,
        timedOut: error instanceof ProviderDeadlineExceededError,
      });
      return "FAILED";
    }
  }

  async function listPendingInvitations(
    command: ListInvitationsCommand
  ): Promise<ListInvitationsResult> {
    if (!authorized(command.actor)) {
      return { ok: false, status: 403, code: "INVITE_FORBIDDEN" };
    }

    const pageSize = resolveInvitationPageSize(command.pageSize);
    const rows = await repository.listPendingInvitations({
      workspaceId: command.workspace.id,
      limit: pageSize + 1,
      now: utcNow(clock),
      after: command.after ?? null,
    });

    const page = rows.slice(0, pageSize);
    const last = page.at(-1);
    const nextPosition =
      rows.length > pageSize && last
        ? { createdAt: last.createdAt, id: last.id }
        : null;

    return {
      ok: true,
      status: 200,
      invitations: page.map(toPendingInvitationView),
      nextPosition,
    };
  }

  async function revokeInvitation(
    command: RevokeInvitationCommand
  ): Promise<RevokeInvitationResult> {
    if (!authorized(command.actor)) {
      return { ok: false, status: 403, code: "INVITE_FORBIDDEN" };
    }

    const invitationId =
      typeof command.invitationId === "string" ? command.invitationId.trim() : "";
    if (invitationId.length === 0 || invitationId.length > 128) {
      return { ok: false, status: 404, code: "RESOURCE_NOT_FOUND" };
    }

    const now = utcNow(clock);
    const outcome = await repository.revokePendingInvitation({
      workspaceId: command.workspace.id,
      invitationId,
      revokedAt: now,
    });

    if (outcome.kind === "NOT_FOUND") {
      return { ok: false, status: 404, code: "RESOURCE_NOT_FOUND" };
    }
    if (outcome.kind === "ALREADY_CLOSED") {
      return { ok: false, status: 400, code: "INVITATION_REVOKED" };
    }

    await appendAudit({
      action: "WORKSPACE_INVITE_REVOKE",
      userId: command.actor.userId,
      resource: "WorkspaceInvitation",
      resourceId: invitationId,
      severity: "INFO",
      sourceAddress: normalizeSourceAddress(command.sourceAddress),
      details: {
        workspaceId: command.workspace.id,
        email: outcome.email,
        role: outcome.role,
        invitationId,
        occurredAt: now.toISOString(),
      },
    });

    return { ok: true, status: 200, code: "INVITATION_REVOKED", invitationId };
  }

  async function acceptInvitation(
    command: AcceptInvitationCommand
  ): Promise<AcceptInvitationResult> {
    const rawToken = readSubmittedInvitationToken(command.payload);
    if (!rawToken) return invalidInvitationToken();

    const lookup = getTokenDigestLookup(rawToken);
    if (!lookup) return invalidInvitationToken();

    const stored = await repository.findInvitationByTokenHash(lookup.tokenHash);
    if (!stored) return invalidInvitationToken();

    const now = utcNow(clock);
    const matches = verifyTokenDigest(rawToken, stored, {
      clock: fixedUtcClock(now),
      legacy: { maxAgeMs: INVITATION_TOKEN_TTL_MS },
    });
    // `verifyTokenDigest` also rejects an expired record (criterion 3.9).
    if (!matches) return invalidInvitationToken();

    // A revoked invitation is also marked consumed, so the revoked state is
    // reported first (criteria 3.6, 3.9).
    if (stored.revokedAt !== null) {
      return { ok: false, status: 400, code: "INVITATION_REVOKED" };
    }
    if (stored.consumedAt !== null) return invalidInvitationToken();

    const invitedEmail = normalizeInvitationEmail(stored.email);

    // Criterion 3.11: a reserved development identity never gains an account or
    // a membership, and the invitation stays pending.
    if (isReservedDevelopmentIdentity(invitedEmail)) {
      return { ok: false, status: 400, code: "RESERVED_IDENTITY" };
    }

    const sourceAddress = normalizeSourceAddress(command.sourceAddress);
    const session = command.session ?? null;

    if (session) {
      // Criterion 3.10: a mismatched session leaves the invitation pending.
      if (normalizeInvitationEmail(session.email) !== invitedEmail) {
        return { ok: false, status: 403, code: "INVITATION_EMAIL_MISMATCH" };
      }
      return finalizeAcceptance({
        stored,
        invitedEmail,
        now,
        sourceAddress,
        actor: { kind: "EXISTING_USER", userId: session.userId },
      });
    }

    // Criterion 3.3 admits an existing account only through its authenticated
    // session, so an unauthenticated submission for a known address creates
    // nothing and leaves the invitation pending.
    const existingUserId =
      await repository.findUserIdByNormalizedEmail(invitedEmail);
    if (existingUserId) {
      return { ok: false, status: 401, code: "AUTHENTICATION_REQUIRED" };
    }

    const account = validateAcceptanceAccount(command.payload);
    if (!account.ok) {
      return {
        ok: false,
        status: 400,
        code: "INVITATION_ACCEPTANCE_INVALID",
        fieldPaths: account.fieldPaths,
      };
    }

    const passwordHash = await passwordHasher.hash(account.value.password);
    return finalizeAcceptance({
      stored,
      invitedEmail,
      now,
      sourceAddress,
      actor: {
        kind: "NEW_USER",
        displayName: account.value.displayName,
        passwordHash,
        locale: account.value.locale,
      },
    });
  }

  async function finalizeAcceptance(input: {
    readonly stored: StoredInvitation;
    readonly invitedEmail: string;
    readonly now: Date;
    readonly sourceAddress: string;
    readonly actor: AcceptInvitationActor;
  }): Promise<AcceptInvitationResult> {
    const { stored, invitedEmail, now, sourceAddress } = input;

    const outcome = await repository.acceptInvitation({
      invitationId: stored.id,
      tokenHash: stored.tokenHash,
      workspaceId: stored.workspaceId,
      email: invitedEmail,
      acceptedAt: now,
      actor: input.actor,
    });

    switch (outcome.kind) {
      case "TOKEN_INVALID":
        return invalidInvitationToken();
      case "REVOKED":
        return { ok: false, status: 400, code: "INVITATION_REVOKED" };
      case "SEAT_LIMIT_REACHED":
        return { ok: false, status: 429, code: "SEAT_LIMIT_REACHED" };
      case "ACCOUNT_EXISTS":
        return { ok: false, status: 401, code: "AUTHENTICATION_REQUIRED" };
      case "ALREADY_MEMBER":
        // Criterion 3.4: the token is consumed by the transaction and the
        // existing membership role is unchanged.
        return {
          ok: false,
          status: 409,
          code: "ALREADY_A_MEMBER",
          workspaceId: outcome.workspaceId,
        };
      case "ACCEPTED":
        break;
    }

    if (outcome.createdUser) {
      await appendAudit({
        action: "USER_CREATE",
        userId: outcome.userId,
        resource: "User",
        resourceId: outcome.userId,
        severity: "INFO",
        sourceAddress,
        details: {
          workspaceId: outcome.workspaceId,
          email: invitedEmail,
          invitationId: stored.id,
          occurredAt: now.toISOString(),
          via: "invitation",
        },
      });
    }

    await appendAudit({
      action: "WORKSPACE_INVITE_ACCEPT",
      userId: outcome.userId,
      resource: "Workspace",
      resourceId: outcome.workspaceId,
      severity: "INFO",
      sourceAddress,
      details: {
        workspaceId: outcome.workspaceId,
        email: invitedEmail,
        role: outcome.role,
        invitationId: stored.id,
        occurredAt: now.toISOString(),
      },
    });

    return {
      ok: true,
      status: outcome.createdUser ? 201 : 200,
      code: "INVITATION_ACCEPTED",
      workspaceId: outcome.workspaceId,
      role: outcome.role,
      userId: outcome.userId,
      createdUser: outcome.createdUser,
    };
  }

  return Object.freeze({
    createInvitation,
    listPendingInvitations,
    revokeInvitation,
    acceptInvitation,
  });
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function invalidInvitationToken(): AcceptInvitationResult {
  return { ok: false, status: 400, code: "INVITATION_TOKEN_INVALID" };
}

/** Criterion 3.7 view: no raw token material and no internal digest fields. */
export function toPendingInvitationView(
  row: StoredPendingInvitation
): PendingInvitationView {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    email: row.email,
    role: row.role,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    emailDeliveryState: normalizeInvitationDeliveryState(row.emailDeliveryState),
    inviter: row.inviter,
  };
}

export function normalizeSourceAddress(
  value: string | null | undefined
): string {
  if (typeof value !== "string") return UNKNOWN_SOURCE_ADDRESS;
  const address = value.trim();
  if (address.length === 0 || address.length > MAX_SOURCE_ADDRESS_LENGTH) {
    return UNKNOWN_SOURCE_ADDRESS;
  }
  return address;
}
