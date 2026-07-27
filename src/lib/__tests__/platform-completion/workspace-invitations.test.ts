/**
 * Feature: platform-completion — atomic workspace invitation creation, listing,
 * revocation, and acceptance (requirements 3.1 – 3.11).
 *
 * Every test drives the real domain service with in-memory persistence and
 * provider fakes: no network call, no email send, no database mutation.
 */

import { beforeEach, describe, expect, test } from "bun:test";
import {
  INVITATION_ACCEPTANCE_BOUNDS,
  INVITATION_EMAIL_DEADLINE_MS,
  INVITATION_PAGE_SIZE_MAX,
  INVITATION_TOKEN_TTL_MS,
  createInvitationService,
  decodeInvitationCursor,
  encodeInvitationCursor,
  normalizeInvitationDeliveryState,
  resolveInvitationPageSize,
  validateAcceptanceAccount,
  validateInvitationRequest,
  type AcceptInvitationResult,
  type CreateInvitationResult,
  type InvitationActor,
  type InvitationService,
} from "../../invitation-service";
import {
  INVITATION_TARGET_ROLES,
  canManageInvitations,
} from "../../invitation-roles";
import { buildInvitationUrl } from "../../invitation-email";
import { createTokenDigest } from "../../token-digest";
import {
  DeterministicClock,
  DeterministicRandomSource,
  InjectedInvitationWriteFailure,
  createFakeInvitationEmailProvider,
  createFakeInvitationPasswordHasher,
  createFakeInvitationRepository,
  createImmediateDeadlineScheduler,
  createRecordingInvitationAuditSink,
  type FakeInvitationEmailProvider,
  type FakeInvitationRepository,
  type InvitationWriteBoundary,
  type RecordingInvitationAuditSink,
} from "../support";

const BASE_URL = "https://app.arabclue.test";
const WORKSPACE = Object.freeze({ id: "workspace-1", name: "Riyadh Bid Team" });
const CLOCK_INSTANT = "2026-05-01T09:00:00.000Z";
const INVITED_EMAIL = "colleague@example.com";

const OWNER: InvitationActor = Object.freeze({
  userId: "user-owner",
  membershipRole: "OWNER",
  platformRole: "BIDDER",
});
const ADMIN: InvitationActor = Object.freeze({
  userId: "user-admin",
  membershipRole: "ADMIN",
  platformRole: "BIDDER",
});
const PLAIN_MEMBER: InvitationActor = Object.freeze({
  userId: "user-member",
  membershipRole: "MEMBER",
  platformRole: "BIDDER",
});

type Harness = Readonly<{
  service: InvitationService;
  repository: FakeInvitationRepository;
  email: FakeInvitationEmailProvider;
  audit: RecordingInvitationAuditSink;
  clock: DeterministicClock;
  passwordHasher: ReturnType<typeof createFakeInvitationPasswordHasher>;
}>;

function createHarness(
  options: Readonly<{
    emailBehavior?: Parameters<typeof createFakeInvitationEmailProvider>[0];
    seatAllowance?: number | null;
    immediateDeadline?: boolean;
  }> = {}
): Harness {
  const clock = new DeterministicClock(CLOCK_INSTANT);
  const repository = createFakeInvitationRepository({
    workspaceName: WORKSPACE.name,
    seatAllowance: options.seatAllowance ?? null,
  });
  const email = createFakeInvitationEmailProvider(options.emailBehavior);
  const audit = createRecordingInvitationAuditSink();
  const passwordHasher = createFakeInvitationPasswordHasher();
  const service = createInvitationService({
    repository,
    email,
    audit,
    passwordHasher,
    clock,
    randomness: new DeterministicRandomSource(0x51f0),
    baseUrl: BASE_URL,
    ...(options.immediateDeadline
      ? { deadlineScheduler: createImmediateDeadlineScheduler() }
      : {}),
  });

  return { service, repository, email, audit, clock, passwordHasher };
}

function create(
  harness: Harness,
  payload: Readonly<Record<string, unknown>> = { email: INVITED_EMAIL },
  actor: InvitationActor = OWNER
): Promise<CreateInvitationResult> {
  return harness.service.createInvitation({
    actor,
    workspace: WORKSPACE,
    payload,
    sourceAddress: "203.0.113.10",
  });
}

function rawTokenFromLastMessage(email: FakeInvitationEmailProvider): string {
  const message = email.messages.at(-1);
  if (!message) throw new Error("No invitation message was produced");
  const match = /token=([^"&\s<]+)/u.exec(message.text);
  if (!match) throw new Error("No invitation token was present in the message");
  return decodeURIComponent(match[1]);
}

function seedPendingInvitation(
  harness: Harness,
  options: Readonly<{
    email?: string;
    role?: string;
    seed?: number;
    createdAt?: Date;
    expiresAt?: Date;
    consumedAt?: Date | null;
    revokedAt?: Date | null;
  }> = {}
): Readonly<{ rawToken: string; invitationId: string }> {
  const issued = createTokenDigest({
    randomness: new DeterministicRandomSource(options.seed ?? 0xa11ce),
  });
  const createdAt = options.createdAt ?? harness.clock.now();
  const row = harness.repository.seedInvitation({
    workspaceId: WORKSPACE.id,
    email: options.email ?? INVITED_EMAIL,
    role: options.role ?? "MEMBER",
    tokenHash: issued.tokenHash,
    hashSalt: issued.hashSalt,
    hashVersion: issued.hashVersion,
    createdAt,
    expiresAt:
      options.expiresAt ?? new Date(createdAt.getTime() + INVITATION_TOKEN_TTL_MS),
    consumedAt: options.consumedAt ?? null,
    revokedAt: options.revokedAt ?? null,
    inviterId: OWNER.userId,
  });
  return { rawToken: issued.rawToken, invitationId: row.id };
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

describe("invitation request validation (requirements 3.1, 19.4)", () => {
  test("accepts only administrator and member as target roles", () => {
    expect(INVITATION_TARGET_ROLES).toEqual(["ADMIN", "MEMBER"]);

    for (const role of INVITATION_TARGET_ROLES) {
      expect(
        validateInvitationRequest({ email: INVITED_EMAIL, role })
      ).toEqual({ ok: true, value: { email: INVITED_EMAIL, role } });
    }

    for (const role of ["OWNER", "REVIEWER", "owner", "member", 1, {}]) {
      expect(
        validateInvitationRequest({ email: INVITED_EMAIL, role })
      ).toEqual({ ok: false, fieldPaths: ["role"] });
    }
  });

  test("defaults an omitted role to member and normalizes the address", () => {
    expect(
      validateInvitationRequest({ email: "  Colleague@Example.COM " })
    ).toEqual({
      ok: true,
      value: { email: INVITED_EMAIL, role: "MEMBER" },
    });
  });

  test("names every offending field for an out-of-bounds or malformed request", () => {
    expect(validateInvitationRequest({ email: "a@b", role: "OWNER" })).toEqual({
      ok: false,
      fieldPaths: ["email", "role"],
    });
    expect(validateInvitationRequest({ email: "not-an-address" })).toEqual({
      ok: false,
      fieldPaths: ["email"],
    });
    expect(
      validateInvitationRequest({ email: `${"l".repeat(65)}@example.com` })
    ).toEqual({ ok: false, fieldPaths: ["email"] });
    for (const payload of [null, undefined, "invite", 7, []]) {
      expect(validateInvitationRequest(payload)).toEqual({
        ok: false,
        fieldPaths: ["email", "role"],
      });
    }
  });

  test("enforces the display-name and password bounds of criteria 3.2 and 3.11", () => {
    expect(INVITATION_ACCEPTANCE_BOUNDS.displayName).toEqual({ min: 2, max: 120 });
    expect(INVITATION_ACCEPTANCE_BOUNDS.password.min).toBe(10);

    expect(
      validateAcceptanceAccount({
        name: `  ${"n".repeat(120)}  `,
        password: "p".repeat(10),
      })
    ).toEqual({
      ok: true,
      value: {
        displayName: "n".repeat(120),
        password: "p".repeat(10),
        locale: "ar",
      },
    });

    expect(
      validateAcceptanceAccount({ name: "n".repeat(121), password: "short" })
    ).toEqual({ ok: false, fieldPaths: ["displayName", "password"] });
    expect(validateAcceptanceAccount({ name: "x", password: "p".repeat(10) })).toEqual(
      { ok: false, fieldPaths: ["displayName"] }
    );
    expect(
      validateAcceptanceAccount({
        displayName: "Nora",
        password: "p".repeat(INVITATION_ACCEPTANCE_BOUNDS.password.max + 1),
      })
    ).toEqual({ ok: false, fieldPaths: ["password"] });
    expect(
      validateAcceptanceAccount({ displayName: "Nora", password: "p".repeat(10), locale: "fr" })
    ).toEqual({ ok: false, fieldPaths: ["locale"] });
  });

  test("clamps the page size and maps the delivery-state vocabulary", () => {
    expect(resolveInvitationPageSize(undefined)).toBe(INVITATION_PAGE_SIZE_MAX);
    expect(resolveInvitationPageSize("10")).toBe(10);
    expect(resolveInvitationPageSize(500)).toBe(INVITATION_PAGE_SIZE_MAX);
    expect(resolveInvitationPageSize(0)).toBe(INVITATION_PAGE_SIZE_MAX);
    expect(INVITATION_PAGE_SIZE_MAX).toBe(50);

    expect(normalizeInvitationDeliveryState("SENT")).toBe("SENT");
    expect(normalizeInvitationDeliveryState("SKIPPED")).toBe("UNCONFIGURED");
    expect(normalizeInvitationDeliveryState(null)).toBe("PENDING");
  });

  test("permits only owner, administrator, or a platform administrator", () => {
    expect(canManageInvitations("OWNER", "BIDDER")).toBe(true);
    expect(canManageInvitations("ADMIN", "BIDDER")).toBe(true);
    expect(canManageInvitations("MEMBER", "BIDDER")).toBe(false);
    expect(canManageInvitations("MEMBER", "SUPER_ADMIN")).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* Creation                                                                   */
/* -------------------------------------------------------------------------- */

describe("invitation creation (requirements 3.1, 3.5, 3.8)", () => {
  let harness: Harness;

  beforeEach(() => {
    harness = createHarness();
  });

  test("creates one pending invitation with a seven-day salted token", async () => {
    const result = await create(harness, {
      email: "  Colleague@Example.COM ",
      role: "ADMIN",
    });

    expect(result).toMatchObject({
      ok: true,
      status: 201,
      code: "INVITATION_SENT",
      emailDelivery: "SENT",
    });
    if (!result.ok) throw new Error("Expected a created invitation");

    const [row] = harness.repository.snapshot().invitations;
    expect(row).toMatchObject({
      workspaceId: WORKSPACE.id,
      email: INVITED_EMAIL,
      role: "ADMIN",
      consumedAt: null,
      revokedAt: null,
      inviterId: OWNER.userId,
      hashVersion: 1,
    });
    expect(typeof row.hashSalt).toBe("string");
    expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBe(
      INVITATION_TOKEN_TTL_MS
    );
    expect(INVITATION_TOKEN_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
    expect(result.invitation).toMatchObject({
      id: row.id,
      email: INVITED_EMAIL,
      role: "ADMIN",
      emailDeliveryState: "SENT",
    });
  });

  test("creates the invitation whether or not an account already exists", async () => {
    harness.repository.seedUser({ email: INVITED_EMAIL });

    const result = await create(harness);

    expect(result.ok).toBe(true);
    expect(harness.repository.snapshot().invitations).toHaveLength(1);
  });

  test("keeps the raw token out of persistence, the result, and audit entries", async () => {
    const result = await create(harness);
    const rawToken = rawTokenFromLastMessage(harness.email);

    expect(rawToken.length).toBeGreaterThan(20);
    expect(JSON.stringify(result)).not.toContain(rawToken);
    expect(JSON.stringify(harness.repository.snapshot())).not.toContain(rawToken);
    expect(JSON.stringify(harness.audit.entries)).not.toContain(rawToken);
  });

  test("invalidates every earlier unconsumed invitation for the same address", async () => {
    const first = await create(harness);
    const firstToken = rawTokenFromLastMessage(harness.email);
    if (!first.ok) throw new Error("Expected the first invitation to be created");

    harness.clock.advanceBy(60_000);
    const second = await create(harness, { email: INVITED_EMAIL, role: "ADMIN" });
    if (!second.ok) throw new Error("Expected the replacement to be created");

    const rows = harness.repository.snapshot().invitations;
    expect(rows).toHaveLength(2);
    const replaced = rows.find((row) => row.id === first.invitation.id);
    expect(replaced).toMatchObject({
      consumedAt: harness.clock.now(),
      revokedAt: harness.clock.now(),
    });
    expect(rows.find((row) => row.id === second.invitation.id)).toMatchObject({
      consumedAt: null,
      revokedAt: null,
    });

    // The replaced token can no longer be accepted (criteria 3.1, 3.6).
    await expect(
      harness.service.acceptInvitation({
        payload: { token: firstToken, name: "Nora", password: "p".repeat(10) },
      })
    ).resolves.toEqual({
      ok: false,
      status: 400,
      code: "INVITATION_REVOKED",
    });

    const list = await harness.service.listPendingInvitations({
      actor: OWNER,
      workspace: WORKSPACE,
    });
    if (!list.ok) throw new Error("Expected the pending list");
    expect(list.invitations.map((invitation) => invitation.id)).toEqual([
      second.invitation.id,
    ]);
  });

  test("rejects a caller who is neither owner nor administrator", async () => {
    const result = await create(harness, { email: INVITED_EMAIL }, PLAIN_MEMBER);

    expect(result).toEqual({ ok: false, status: 403, code: "INVITE_FORBIDDEN" });
    expect(harness.repository.snapshot().invitations).toHaveLength(0);
    expect(harness.repository.createCalls).toHaveLength(0);
    expect(harness.email.messages).toHaveLength(0);
    expect(harness.audit.entries).toHaveLength(0);
  });

  test("admits an administrator and rejects an ownership escalation", async () => {
    expect((await create(harness, { email: "admin-invite@example.com" }, ADMIN)).ok).toBe(
      true
    );

    const escalation = await create(harness, {
      email: "escalation@example.com",
      role: "OWNER",
    });
    expect(escalation).toEqual({
      ok: false,
      status: 400,
      code: "REQUEST_VALIDATION_FAILED",
      fieldPaths: ["role"],
    });
    expect(harness.repository.snapshot().invitations).toHaveLength(1);
  });

  test("rejects an invitee who already holds membership", async () => {
    const user = harness.repository.seedUser({ email: INVITED_EMAIL });
    harness.repository.seedMember({
      workspaceId: WORKSPACE.id,
      userId: user.id,
      role: "MEMBER",
    });

    const result = await create(harness);

    expect(result).toEqual({ ok: false, status: 409, code: "ALREADY_A_MEMBER" });
    expect(harness.repository.snapshot().invitations).toHaveLength(0);
  });

  test("rejects creation once members plus pending invitations reach the allowance", async () => {
    const limited = createHarness({ seatAllowance: 2 });
    const owner = limited.repository.seedUser({ email: "owner@example.com" });
    limited.repository.seedMember({
      workspaceId: WORKSPACE.id,
      userId: owner.id,
      role: "OWNER",
    });
    const accepted = await create(limited, { email: "first@example.com" });
    expect(accepted.ok).toBe(true);

    const denied = await create(limited, { email: "second@example.com" });

    expect(denied).toEqual({ ok: false, status: 429, code: "SEAT_LIMIT_REACHED" });
    expect(limited.repository.snapshot().invitations).toHaveLength(1);
  });

  test("treats an unbounded allowance as no seat limit", async () => {
    const unbounded = createHarness({ seatAllowance: null });
    for (let index = 0; index < 3; index += 1) {
      expect((await create(unbounded, { email: `invitee${index}@example.com` })).ok).toBe(
        true
      );
    }
    expect(unbounded.repository.snapshot().invitations).toHaveLength(3);
  });

  test("records the delivery state for every email branch", async () => {
    const branches = [
      { behavior: { kind: "sent" } as const, expected: "SENT" },
      { behavior: { kind: "unconfigured" } as const, expected: "UNCONFIGURED" },
      { behavior: { kind: "skipped" } as const, expected: "UNCONFIGURED" },
      { behavior: { kind: "failed" } as const, expected: "FAILED" },
      { behavior: { kind: "throws" } as const, expected: "FAILED" },
    ];

    for (const branch of branches) {
      const local = createHarness({ emailBehavior: branch.behavior });
      const result = await create(local);

      expect(result).toMatchObject({
        ok: true,
        status: 201,
        code: "INVITATION_SENT",
        emailDelivery: branch.expected,
      });
      const [row] = local.repository.snapshot().invitations;
      expect(row.emailDeliveryState).toBe(branch.expected);
      expect(row.consumedAt).toBeNull();
    }
  });

  test("records FAILED when delivery exceeds its bounded deadline", async () => {
    const hanging = createHarness({
      emailBehavior: { kind: "hangs" },
      immediateDeadline: true,
    });

    const result = await create(hanging);

    expect(INVITATION_EMAIL_DEADLINE_MS).toBe(30_000);
    expect(result).toMatchObject({ ok: true, emailDelivery: "FAILED" });
    expect(hanging.repository.snapshot().invitations).toHaveLength(1);
  });

  test("sends one bilingual message carrying the acceptance link", async () => {
    await create(harness, { email: INVITED_EMAIL, role: "ADMIN" });

    expect(harness.email.messages).toHaveLength(1);
    const [message] = harness.email.messages;
    expect(message.to).toBe(INVITED_EMAIL);
    expect(message.subject).toContain("Invitation to join an Arabclue workspace");
    expect(message.html).toContain('dir="rtl"');
    expect(message.html).toContain('dir="ltr"');
    expect(message.html).toContain(WORKSPACE.name);
    expect(message.text).toContain("Administrator");
    expect(message.text).toContain("مسؤول");
    expect(message.text).toContain(`${BASE_URL}/invite?token=`);
  });

  test("persists nothing when a write inside the transaction fails", async () => {
    const boundaries: readonly InvitationWriteBoundary[] = ["replace", "invitation"];

    for (const boundary of boundaries) {
      const local = createHarness();
      local.repository.seedInvitation({
        workspaceId: WORKSPACE.id,
        email: INVITED_EMAIL,
        role: "MEMBER",
        tokenHash: `hash-${boundary}`,
        createdAt: local.clock.now(),
        expiresAt: new Date(local.clock.now().getTime() + INVITATION_TOKEN_TTL_MS),
      });
      const before = local.repository.snapshot();
      local.repository.failNextWriteAt(boundary);

      await expect(create(local)).rejects.toBeInstanceOf(
        InjectedInvitationWriteFailure
      );

      expect(local.repository.snapshot()).toEqual(before);
      expect(local.email.messages).toHaveLength(0);
      expect(local.audit.entries).toHaveLength(0);
    }
  });

  test("keeps a committed invitation successful when the audit sink fails", async () => {
    harness.audit.failNext(true);

    const result = await create(harness);

    expect(result.ok).toBe(true);
    expect(harness.repository.snapshot().invitations).toHaveLength(1);
  });

  test("builds an acceptance URL that encodes the token exactly once", () => {
    const url = buildInvitationUrl(`${BASE_URL}/`, "ac.v1.a+b/c=");
    expect(url).toBe(
      `${BASE_URL}/invite?token=${encodeURIComponent("ac.v1.a+b/c=")}`
    );
    expect(new URL(url).searchParams.get("token")).toBe("ac.v1.a+b/c=");
  });
});

/* -------------------------------------------------------------------------- */
/* Listing                                                                    */
/* -------------------------------------------------------------------------- */

describe("pending invitation listing (requirement 3.7)", () => {
  test("returns pending rows newest first with the required fields only", async () => {
    const harness = createHarness();
    const inviter = harness.repository.seedUser({
      email: "owner@example.com",
      name: "Owner",
    });
    for (let index = 0; index < 3; index += 1) {
      harness.repository.seedInvitation({
        workspaceId: WORKSPACE.id,
        email: `invitee${index}@example.com`,
        role: index === 0 ? "ADMIN" : "MEMBER",
        tokenHash: `hash-${index}`,
        hashSalt: `salt-${index}`,
        hashVersion: 1,
        createdAt: new Date(Date.parse(CLOCK_INSTANT) + index * 60_000),
        expiresAt: new Date(
          Date.parse(CLOCK_INSTANT) + index * 60_000 + INVITATION_TOKEN_TTL_MS
        ),
        inviterId: inviter.id,
        emailDeliveryState: "SENT",
      });
    }
    harness.clock.advanceBy(5 * 60_000);

    const result = await harness.service.listPendingInvitations({
      actor: OWNER,
      workspace: WORKSPACE,
    });

    if (!result.ok) throw new Error("Expected the pending list");
    expect(result.invitations.map((row) => row.email)).toEqual([
      "invitee2@example.com",
      "invitee1@example.com",
      "invitee0@example.com",
    ]);
    expect(result.nextPosition).toBeNull();
    expect(Object.keys(result.invitations[0]).sort()).toEqual([
      "createdAt",
      "email",
      "emailDeliveryState",
      "expiresAt",
      "id",
      "inviter",
      "role",
      "workspaceId",
    ]);
    expect(result.invitations[0].inviter).toEqual({
      id: inviter.id,
      name: "Owner",
      email: "owner@example.com",
    });
    expect(JSON.stringify(result.invitations)).not.toContain("hash");
  });

  test("excludes consumed, revoked, expired, and foreign-workspace rows", async () => {
    const harness = createHarness();
    const now = harness.clock.now();
    harness.repository.seedInvitation({
      workspaceId: WORKSPACE.id,
      email: "consumed@example.com",
      role: "MEMBER",
      tokenHash: "hash-consumed",
      createdAt: now,
      expiresAt: new Date(now.getTime() + INVITATION_TOKEN_TTL_MS),
      consumedAt: now,
    });
    harness.repository.seedInvitation({
      workspaceId: WORKSPACE.id,
      email: "revoked@example.com",
      role: "MEMBER",
      tokenHash: "hash-revoked",
      createdAt: now,
      expiresAt: new Date(now.getTime() + INVITATION_TOKEN_TTL_MS),
      revokedAt: now,
    });
    harness.repository.seedInvitation({
      workspaceId: WORKSPACE.id,
      email: "expired@example.com",
      role: "MEMBER",
      tokenHash: "hash-expired",
      createdAt: new Date(now.getTime() - 2 * INVITATION_TOKEN_TTL_MS),
      expiresAt: new Date(now.getTime() - INVITATION_TOKEN_TTL_MS),
    });
    harness.repository.seedInvitation({
      workspaceId: "workspace-other",
      email: "foreign@example.com",
      role: "MEMBER",
      tokenHash: "hash-foreign",
      createdAt: now,
      expiresAt: new Date(now.getTime() + INVITATION_TOKEN_TTL_MS),
    });

    const result = await harness.service.listPendingInvitations({
      actor: OWNER,
      workspace: WORKSPACE,
    });

    if (!result.ok) throw new Error("Expected the pending list");
    expect(result.invitations).toEqual([]);
  });

  test("bounds the page at fifty rows and visits every row exactly once", async () => {
    const harness = createHarness();
    const total = 120;
    for (let index = 0; index < total; index += 1) {
      harness.repository.seedInvitation({
        workspaceId: WORKSPACE.id,
        email: `invitee${index}@example.com`,
        role: "MEMBER",
        tokenHash: `hash-${index}`,
        createdAt: new Date(Date.parse(CLOCK_INSTANT) - index * 1_000),
        expiresAt: new Date(Date.parse(CLOCK_INSTANT) + INVITATION_TOKEN_TTL_MS),
      });
    }

    const visited: string[] = [];
    let after: Readonly<{ createdAt: Date; id: string }> | null = null;
    let pages = 0;
    do {
      const page = await harness.service.listPendingInvitations({
        actor: OWNER,
        workspace: WORKSPACE,
        pageSize: 500,
        after,
      });
      if (!page.ok) throw new Error("Expected the pending list");
      expect(page.invitations.length).toBeLessThanOrEqual(INVITATION_PAGE_SIZE_MAX);
      visited.push(...page.invitations.map((row) => row.id));

      // The cursor survives a base64url round trip scoped to this workspace.
      after = page.nextPosition
        ? decodeInvitationCursor(
            encodeInvitationCursor(WORKSPACE.id, page.nextPosition),
            WORKSPACE.id
          )
        : null;
      pages += 1;
    } while (after && pages < 10);

    expect(pages).toBe(3);
    expect(visited).toHaveLength(total);
    expect(new Set(visited).size).toBe(total);
  });

  test("rejects a cursor issued for another workspace", () => {
    const cursor = encodeInvitationCursor(WORKSPACE.id, {
      createdAt: new Date(CLOCK_INSTANT),
      id: "invite-0001",
    });

    expect(decodeInvitationCursor(cursor, WORKSPACE.id)).toEqual({
      createdAt: new Date(CLOCK_INSTANT),
      id: "invite-0001",
    });
    expect(decodeInvitationCursor(cursor, "workspace-other")).toBeNull();
    expect(decodeInvitationCursor("not-a-cursor", WORKSPACE.id)).toBeNull();
  });

  test("rejects a caller who is neither owner nor administrator", async () => {
    const harness = createHarness();
    seedPendingInvitation(harness);

    const result = await harness.service.listPendingInvitations({
      actor: PLAIN_MEMBER,
      workspace: WORKSPACE,
    });

    expect(result).toEqual({ ok: false, status: 403, code: "INVITE_FORBIDDEN" });
  });
});

/* -------------------------------------------------------------------------- */
/* Revocation                                                                 */
/* -------------------------------------------------------------------------- */

describe("invitation revocation (requirements 3.5, 3.6)", () => {
  test("marks the invitation consumed, hides it, and leaves memberships alone", async () => {
    const harness = createHarness();
    const seeded = seedPendingInvitation(harness);
    const user = harness.repository.seedUser({ email: "existing@example.com" });
    harness.repository.seedMember({
      workspaceId: WORKSPACE.id,
      userId: user.id,
      role: "MEMBER",
    });
    const membersBefore = harness.repository.snapshot().members;

    const result = await harness.service.revokeInvitation({
      actor: OWNER,
      workspace: WORKSPACE,
      invitationId: seeded.invitationId,
    });

    expect(result).toEqual({
      ok: true,
      status: 200,
      code: "INVITATION_REVOKED",
      invitationId: seeded.invitationId,
    });
    const [row] = harness.repository.snapshot().invitations;
    expect(row.consumedAt).toEqual(harness.clock.now());
    expect(row.revokedAt).toEqual(harness.clock.now());
    expect(harness.repository.snapshot().members).toEqual(membersBefore);
    expect(harness.audit.entries.at(-1)).toMatchObject({
      action: "WORKSPACE_INVITE_REVOKE",
      details: { workspaceId: WORKSPACE.id, email: INVITED_EMAIL },
    });

    const list = await harness.service.listPendingInvitations({
      actor: OWNER,
      workspace: WORKSPACE,
    });
    if (!list.ok) throw new Error("Expected the pending list");
    expect(list.invitations).toEqual([]);
  });

  test("rejects a later submission of a revoked token", async () => {
    const harness = createHarness();
    const seeded = seedPendingInvitation(harness);
    await harness.service.revokeInvitation({
      actor: OWNER,
      workspace: WORKSPACE,
      invitationId: seeded.invitationId,
    });

    const accepted = await harness.service.acceptInvitation({
      payload: { token: seeded.rawToken, name: "Nora", password: "p".repeat(10) },
    });

    expect(accepted).toEqual({
      ok: false,
      status: 400,
      code: "INVITATION_REVOKED",
    });
    expect(harness.repository.snapshot().users).toHaveLength(0);
    expect(harness.repository.snapshot().members).toHaveLength(0);
  });

  test("answers not-found for an unknown or foreign invitation identifier", async () => {
    const harness = createHarness();
    harness.repository.seedInvitation({
      workspaceId: "workspace-other",
      email: "foreign@example.com",
      role: "MEMBER",
      tokenHash: "hash-foreign",
      createdAt: harness.clock.now(),
      expiresAt: new Date(harness.clock.now().getTime() + INVITATION_TOKEN_TTL_MS),
    });
    const foreignId = harness.repository.snapshot().invitations[0].id;

    for (const invitationId of ["missing-id", foreignId, "", 42]) {
      expect(
        await harness.service.revokeInvitation({
          actor: OWNER,
          workspace: WORKSPACE,
          invitationId,
        })
      ).toEqual({ ok: false, status: 404, code: "RESOURCE_NOT_FOUND" });
    }
    expect(harness.repository.snapshot().invitations[0].revokedAt).toBeNull();
  });

  test("rejects a second revocation and an unauthorized caller", async () => {
    const harness = createHarness();
    const seeded = seedPendingInvitation(harness);

    expect(
      await harness.service.revokeInvitation({
        actor: PLAIN_MEMBER,
        workspace: WORKSPACE,
        invitationId: seeded.invitationId,
      })
    ).toEqual({ ok: false, status: 403, code: "INVITE_FORBIDDEN" });
    expect(harness.repository.snapshot().invitations[0].revokedAt).toBeNull();

    await harness.service.revokeInvitation({
      actor: OWNER,
      workspace: WORKSPACE,
      invitationId: seeded.invitationId,
    });
    expect(
      await harness.service.revokeInvitation({
        actor: OWNER,
        workspace: WORKSPACE,
        invitationId: seeded.invitationId,
      })
    ).toEqual({ ok: false, status: 400, code: "INVITATION_REVOKED" });
  });
});

/* -------------------------------------------------------------------------- */
/* Acceptance                                                                 */
/* -------------------------------------------------------------------------- */

describe("invitation acceptance (requirements 3.2, 3.3, 3.4, 3.9, 3.10, 3.11)", () => {
  test("creates a verified account, the membership, and consumes the token", async () => {
    const harness = createHarness();
    const seeded = seedPendingInvitation(harness, { role: "ADMIN" });

    const result = await harness.service.acceptInvitation({
      payload: {
        token: ` ${seeded.rawToken} `,
        name: "  Nora Al Qahtani  ",
        password: "correct horse battery",
        locale: "en",
      },
      sourceAddress: "198.51.100.5",
    });

    expect(result).toMatchObject({
      ok: true,
      status: 201,
      code: "INVITATION_ACCEPTED",
      workspaceId: WORKSPACE.id,
      role: "ADMIN",
      createdUser: true,
    });
    const state = harness.repository.snapshot();
    expect(state.users).toHaveLength(1);
    expect(state.users[0]).toMatchObject({
      email: INVITED_EMAIL,
      name: "Nora Al Qahtani",
      locale: "en",
      emailVerified: true,
      activeWorkspaceId: WORKSPACE.id,
    });
    expect(state.members).toHaveLength(1);
    expect(state.members[0]).toMatchObject({
      workspaceId: WORKSPACE.id,
      userId: state.users[0].id,
      role: "ADMIN",
    });
    expect(state.invitations[0].consumedAt).toEqual(harness.clock.now());
    expect(harness.passwordHasher.hashed).toEqual(["correct horse battery"]);
    expect(harness.audit.entries.map((entry) => entry.action)).toEqual([
      "USER_CREATE",
      "WORKSPACE_INVITE_ACCEPT",
    ]);
    expect(JSON.stringify(harness.audit.entries)).not.toContain(seeded.rawToken);
  });

  test("rejects every replay of a consumed token without mutating anything", async () => {
    const harness = createHarness();
    const seeded = seedPendingInvitation(harness);
    await harness.service.acceptInvitation({
      payload: { token: seeded.rawToken, name: "Nora", password: "p".repeat(10) },
    });
    const afterFirst = harness.repository.snapshot();

    const replay = await harness.service.acceptInvitation({
      payload: { token: seeded.rawToken, name: "Nora", password: "p".repeat(10) },
    });

    expect(replay).toEqual({
      ok: false,
      status: 400,
      code: "INVITATION_TOKEN_INVALID",
    });
    expect(harness.repository.snapshot()).toEqual(afterFirst);
  });

  test("adds the membership for the authenticated invited account", async () => {
    const harness = createHarness();
    const seeded = seedPendingInvitation(harness);
    const user = harness.repository.seedUser({ email: "Colleague@Example.com" });

    const result = await harness.service.acceptInvitation({
      payload: { token: seeded.rawToken },
      session: { userId: user.id, email: " COLLEAGUE@example.com " },
    });

    expect(result).toMatchObject({
      ok: true,
      status: 200,
      code: "INVITATION_ACCEPTED",
      workspaceId: WORKSPACE.id,
      role: "MEMBER",
      userId: user.id,
      createdUser: false,
    });
    const state = harness.repository.snapshot();
    expect(state.users).toHaveLength(1);
    expect(state.members).toHaveLength(1);
    expect(state.invitations[0].consumedAt).toEqual(harness.clock.now());
    expect(harness.audit.entries.map((entry) => entry.action)).toEqual([
      "WORKSPACE_INVITE_ACCEPT",
    ]);
  });

  test("requires the authenticated session of an address that already has an account", async () => {
    const harness = createHarness();
    const seeded = seedPendingInvitation(harness);
    harness.repository.seedUser({ email: INVITED_EMAIL });

    const result = await harness.service.acceptInvitation({
      payload: { token: seeded.rawToken, name: "Nora", password: "p".repeat(10) },
    });

    expect(result).toEqual({
      ok: false,
      status: 401,
      code: "AUTHENTICATION_REQUIRED",
    });
    expect(harness.repository.snapshot().members).toHaveLength(0);
    expect(harness.repository.snapshot().invitations[0].consumedAt).toBeNull();
  });

  test("rejects a session whose address differs and leaves the invitation pending", async () => {
    const harness = createHarness();
    const seeded = seedPendingInvitation(harness);
    const other = harness.repository.seedUser({ email: "someone-else@example.com" });

    const result = await harness.service.acceptInvitation({
      payload: { token: seeded.rawToken },
      session: { userId: other.id, email: "someone-else@example.com" },
    });

    expect(result).toEqual({
      ok: false,
      status: 403,
      code: "INVITATION_EMAIL_MISMATCH",
    });
    expect(harness.repository.snapshot().members).toHaveLength(0);
    expect(harness.repository.snapshot().invitations[0]).toMatchObject({
      consumedAt: null,
      revokedAt: null,
    });
    expect(harness.repository.acceptCalls).toHaveLength(0);
  });

  test("consumes the token for an existing member without changing the role", async () => {
    const harness = createHarness();
    const seeded = seedPendingInvitation(harness, { role: "ADMIN" });
    const user = harness.repository.seedUser({ email: INVITED_EMAIL });
    harness.repository.seedMember({
      workspaceId: WORKSPACE.id,
      userId: user.id,
      role: "MEMBER",
    });

    const result = await harness.service.acceptInvitation({
      payload: { token: seeded.rawToken },
      session: { userId: user.id, email: INVITED_EMAIL },
    });

    expect(result).toEqual({
      ok: false,
      status: 409,
      code: "ALREADY_A_MEMBER",
      workspaceId: WORKSPACE.id,
    });
    const state = harness.repository.snapshot();
    expect(state.members).toHaveLength(1);
    expect(state.members[0].role).toBe("MEMBER");
    expect(state.invitations[0].consumedAt).toEqual(harness.clock.now());
  });

  test("rejects unknown, malformed, and expired tokens", async () => {
    const harness = createHarness();
    seedPendingInvitation(harness, {
      createdAt: new Date(Date.parse(CLOCK_INSTANT) - 2 * INVITATION_TOKEN_TTL_MS),
      expiresAt: new Date(Date.parse(CLOCK_INSTANT) - 1_000),
      seed: 0xdead,
    });
    const expired = createTokenDigest({
      randomness: new DeterministicRandomSource(0xdead),
    }).rawToken;
    const unknown = createTokenDigest({
      randomness: new DeterministicRandomSource(0xbeef),
    }).rawToken;
    const before = harness.repository.snapshot();

    for (const payload of [
      { token: expired },
      { token: unknown },
      { token: "short" },
      { token: "" },
      { token: 42 },
      {},
      null,
      "token",
    ]) {
      expect(await harness.service.acceptInvitation({ payload })).toEqual({
        ok: false,
        status: 400,
        code: "INVITATION_TOKEN_INVALID",
      });
    }
    expect(harness.repository.snapshot()).toEqual(before);
    expect(harness.repository.acceptCalls).toHaveLength(0);
  });

  test("rejects a reserved development identity and keeps the invitation pending", async () => {
    const harness = createHarness();
    const seeded = seedPendingInvitation(harness, {
      email: "reserved@arabclue.local",
    });

    const result = await harness.service.acceptInvitation({
      payload: { token: seeded.rawToken, name: "Nora", password: "p".repeat(10) },
    });

    expect(result).toEqual({ ok: false, status: 400, code: "RESERVED_IDENTITY" });
    expect(harness.repository.snapshot().users).toHaveLength(0);
    expect(harness.repository.snapshot().invitations[0].consumedAt).toBeNull();
  });

  test("names every offending acceptance field and keeps the invitation pending", async () => {
    const harness = createHarness();
    const seeded = seedPendingInvitation(harness);

    const result = await harness.service.acceptInvitation({
      payload: { token: seeded.rawToken, name: "x", password: "short" },
    });

    expect(result).toEqual({
      ok: false,
      status: 400,
      code: "INVITATION_ACCEPTANCE_INVALID",
      fieldPaths: ["displayName", "password"],
    });
    expect(harness.repository.snapshot().users).toHaveLength(0);
    expect(harness.repository.snapshot().members).toHaveLength(0);
    expect(harness.repository.snapshot().invitations[0].consumedAt).toBeNull();
    expect(harness.passwordHasher.hashed).toHaveLength(0);
  });

  test("rejects acceptance once the seat allowance is exhausted", async () => {
    const harness = createHarness({ seatAllowance: 1 });
    const owner = harness.repository.seedUser({ email: "owner@example.com" });
    harness.repository.seedMember({
      workspaceId: WORKSPACE.id,
      userId: owner.id,
      role: "OWNER",
    });
    const seeded = seedPendingInvitation(harness);

    const result = await harness.service.acceptInvitation({
      payload: { token: seeded.rawToken, name: "Nora", password: "p".repeat(10) },
    });

    expect(result).toEqual({ ok: false, status: 429, code: "SEAT_LIMIT_REACHED" });
    expect(harness.repository.snapshot().members).toHaveLength(1);
    expect(harness.repository.snapshot().invitations[0].consumedAt).toBeNull();
  });

  test("admits the last seat when the accepted invitation is the only pending one", async () => {
    const harness = createHarness({ seatAllowance: 2 });
    const owner = harness.repository.seedUser({ email: "owner@example.com" });
    harness.repository.seedMember({
      workspaceId: WORKSPACE.id,
      userId: owner.id,
      role: "OWNER",
    });
    const seeded = seedPendingInvitation(harness);

    const result = await harness.service.acceptInvitation({
      payload: { token: seeded.rawToken, name: "Nora", password: "p".repeat(10) },
    });

    expect(result).toMatchObject({ ok: true, code: "INVITATION_ACCEPTED" });
    expect(harness.repository.snapshot().members).toHaveLength(2);
  });

  test("persists nothing when a write inside the acceptance transaction fails", async () => {
    const boundaries: readonly InvitationWriteBoundary[] = [
      "user",
      "member",
      "consume",
    ];

    for (const boundary of boundaries) {
      const harness = createHarness();
      const seeded = seedPendingInvitation(harness);
      const before = harness.repository.snapshot();
      harness.repository.failNextWriteAt(boundary);

      const accept = (): Promise<AcceptInvitationResult> =>
        harness.service.acceptInvitation({
          payload: {
            token: seeded.rawToken,
            name: "Nora",
            password: "p".repeat(10),
          },
        });

      await expect(accept()).rejects.toBeInstanceOf(
        InjectedInvitationWriteFailure
      );

      expect(harness.repository.snapshot()).toEqual(before);
      expect(harness.audit.entries).toHaveLength(0);
    }
  });
});
