/**
 * Feature: platform-completion — credential recovery request and reset
 * (requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10).
 *
 * Every test drives the real Recovery_Service with in-memory persistence and
 * provider fakes: no network call, no email send, no database mutation.
 */

import { describe, expect, test } from "bun:test";
import {
  RECOVERY_EMAIL_DEADLINE_MS,
  RECOVERY_PASSWORD_BOUNDS,
  RECOVERY_TOKEN_TTL_MS,
  buildResetUrl,
  createRecoveryService,
  normalizeRecoveryEmail,
  validatePasswordReset,
  validateRecoveryRequest,
  type RecoveryService,
} from "../../recovery-service";
import { ProviderDeadlineExceededError } from "../../provider-timeout";
import { createTokenDigest } from "../../token-digest";
import {
  DeterministicClock,
  DeterministicRandomSource,
  InjectedRecoveryWriteFailure,
  createFakeRecoveryEmailProvider,
  createFakeRecoveryRepository,
  createImmediateDeadlineScheduler,
  createRecordingRecoveryAuditSink,
  type FakeRecoveryEmailProvider,
  type FakeRecoveryRepository,
  type RecordingRecoveryAuditSink,
} from "../support";

const BASE_URL = "https://app.arabclue.test";

type Harness = Readonly<{
  service: RecoveryService;
  repository: FakeRecoveryRepository;
  email: FakeRecoveryEmailProvider;
  audit: RecordingRecoveryAuditSink;
  clock: DeterministicClock;
  randomness: DeterministicRandomSource;
}>;

function createHarness(
  options: Readonly<{
    emailBehavior?: Parameters<typeof createFakeRecoveryEmailProvider>[0];
    immediateDeadline?: boolean;
  }> = {}
): Harness {
  const clock = new DeterministicClock("2026-03-01T09:00:00.000Z");
  const randomness = new DeterministicRandomSource(0x51ee2);
  const repository = createFakeRecoveryRepository();
  const email = createFakeRecoveryEmailProvider(options.emailBehavior);
  const audit = createRecordingRecoveryAuditSink();
  const service = createRecoveryService({
    repository,
    email,
    audit,
    clock,
    randomness,
    passwordHasher: Object.freeze({
      hash: async (password: string) => `hash:${password}`,
    }),
    baseUrl: BASE_URL,
    ...(options.immediateDeadline
      ? { deadlineScheduler: createImmediateDeadlineScheduler() }
      : {}),
  });
  return { service, repository, email, audit, clock, randomness };
}

async function issueToken(
  harness: Harness,
  email: string
): Promise<{ rawToken: string; beforeCount: number }> {
  const beforeCount = harness.repository.snapshot().tokens.length;
  await harness.service.requestRecovery({
    payload: { email },
    sourceAddress: "203.0.113.10",
  });
  // Capture raw token only through the outbound email body (never from persistence).
  const last = harness.email.messages.at(-1);
  expect(last).toBeDefined();
  // Versioned tokens are dot-separated (prefix.version.salt.secret).
  const match = last!.text.match(/token=([A-Za-z0-9_.-]+)/u);
  expect(match).not.toBeNull();
  return { rawToken: match![1]!, beforeCount };
}

describe("recovery request validation (requirements 2.1, 2.6)", () => {
  test("normalizes the recovery email", () => {
    expect(normalizeRecoveryEmail("  Buyer@Example.COM ")).toBe("buyer@example.com");
  });

  test("accepts a well-formed address and rejects empty or malformed payloads", () => {
    expect(validateRecoveryRequest({ email: "buyer@example.com" }).ok).toBe(true);
    expect(validateRecoveryRequest(null).ok).toBe(false);
    expect(validateRecoveryRequest({ email: "not-an-email" }).ok).toBe(false);
    expect(validateRecoveryRequest({ email: "a@b" }).ok).toBe(false);
  });
});

describe("recovery request (requirements 2.1, 2.2, 2.5, 2.7, 2.8)", () => {
  test("returns 202 RECOVERY_REQUEST_ACCEPTED for unknown addresses and stores nothing", async () => {
    const harness = createHarness();
    const result = await harness.service.requestRecovery({
      payload: { email: "nobody@example.com" },
      sourceAddress: "203.0.113.10",
    });
    expect(result).toEqual({
      ok: true,
      status: 202,
      code: "RECOVERY_REQUEST_ACCEPTED",
    });
    expect(harness.repository.snapshot().tokens).toHaveLength(0);
    expect(harness.email.messages).toHaveLength(0);
  });

  test("returns the same 202 for an invalid payload (anti-enumeration)", async () => {
    const harness = createHarness();
    const result = await harness.service.requestRecovery({
      payload: { email: "bad" },
      sourceAddress: "203.0.113.10",
    });
    expect(result.code).toBe("RECOVERY_REQUEST_ACCEPTED");
    expect(result.status).toBe(202);
  });

  test("creates one 60-minute token and emails the raw token once for an eligible user", async () => {
    const harness = createHarness();
    harness.repository.seedUser({ email: "buyer@example.com", locale: "en" });

    const result = await harness.service.requestRecovery({
      payload: { email: "  Buyer@Example.COM " },
      sourceAddress: "203.0.113.10",
    });

    expect(result.status).toBe(202);
    expect(result.code).toBe("RECOVERY_REQUEST_ACCEPTED");
    const tokens = harness.repository.snapshot().tokens;
    expect(tokens).toHaveLength(1);
    const token = tokens[0]!;
    expect(token.expiresAt.getTime() - token.createdAt.getTime()).toBe(
      RECOVERY_TOKEN_TTL_MS
    );
    expect(token.consumedAt).toBeNull();
    expect(harness.email.messages).toHaveLength(1);
    const body = harness.email.messages[0]!;
    expect(body.to).toBe("buyer@example.com");
    expect(body.text).toContain("/reset-password?token=");
    // Persistence never stores the raw token.
    for (const row of tokens) {
      expect(body.text.includes(row.tokenHash)).toBe(false);
    }
    expect(harness.audit.entries.some((e) => e.action === "PASSWORD_RESET_REQUEST")).toBe(
      true
    );
  });

  test("invalidates earlier unconsumed tokens when a fresh request is made", async () => {
    const harness = createHarness();
    harness.repository.seedUser({ email: "buyer@example.com" });
    await harness.service.requestRecovery({
      payload: { email: "buyer@example.com" },
      sourceAddress: "10.0.0.1",
    });
    const firstId = harness.repository.snapshot().tokens[0]!.id;
    harness.clock.advanceBy(60_000);
    await harness.service.requestRecovery({
      payload: { email: "buyer@example.com" },
      sourceAddress: "10.0.0.1",
    });
    const tokens = harness.repository.snapshot().tokens;
    expect(tokens).toHaveLength(2);
    const first = tokens.find((t) => t.id === firstId)!;
    expect(first.consumedAt).not.toBeNull();
    const active = tokens.filter((t) => t.consumedAt === null);
    expect(active).toHaveLength(1);
  });

  test("answers RECOVERY_EMAIL_UNCONFIGURED without creating a token", async () => {
    const harness = createHarness({ emailBehavior: { kind: "unconfigured" } });
    harness.repository.seedUser({ email: "buyer@example.com" });
    const result = await harness.service.requestRecovery({
      payload: { email: "buyer@example.com" },
      sourceAddress: "10.0.0.1",
    });
    expect(result).toEqual({
      ok: true,
      status: 202,
      code: "RECOVERY_EMAIL_UNCONFIGURED",
    });
    expect(harness.repository.snapshot().tokens).toHaveLength(0);
  });

  test("keeps the committed token when post-commit email delivery fails", async () => {
    const harness = createHarness({ emailBehavior: { kind: "failed" } });
    harness.repository.seedUser({ email: "buyer@example.com" });
    const result = await harness.service.requestRecovery({
      payload: { email: "buyer@example.com" },
      sourceAddress: "10.0.0.1",
    });
    expect(result.code).toBe("RECOVERY_REQUEST_ACCEPTED");
    expect(harness.repository.snapshot().tokens).toHaveLength(1);
    expect(
      harness.audit.entries.some((e) => e.action === "PASSWORD_RESET_EMAIL_FAILED")
    ).toBe(true);
  });

  test("bounds email delivery and treats a hang as a delivery failure", async () => {
    const harness = createHarness({
      emailBehavior: { kind: "hangs" },
      immediateDeadline: true,
    });
    harness.repository.seedUser({ email: "buyer@example.com" });
    const result = await harness.service.requestRecovery({
      payload: { email: "buyer@example.com" },
      sourceAddress: "10.0.0.1",
    });
    expect(result.code).toBe("RECOVERY_REQUEST_ACCEPTED");
    expect(harness.repository.snapshot().tokens).toHaveLength(1);
    expect(harness.email.abortReasons.length).toBeGreaterThan(0);
    expect(RECOVERY_EMAIL_DEADLINE_MS).toBe(30_000);
  });

  test("skips inactive or unverified accounts without revealing eligibility", async () => {
    const harness = createHarness();
    harness.repository.seedUser({
      email: "inactive@example.com",
      active: false,
    });
    harness.repository.seedUser({
      email: "unverified@example.com",
      emailVerified: false,
    });
    for (const email of ["inactive@example.com", "unverified@example.com"]) {
      const result = await harness.service.requestRecovery({
        payload: { email },
        sourceAddress: "10.0.0.1",
      });
      expect(result.code).toBe("RECOVERY_REQUEST_ACCEPTED");
    }
    expect(harness.repository.snapshot().tokens).toHaveLength(0);
  });
});

describe("password reset validation (requirement 2.9)", () => {
  test("names every offending field path", () => {
    const both = validatePasswordReset({});
    expect(both.ok).toBe(false);
    if (!both.ok) {
      expect(both.fieldPaths).toEqual(expect.arrayContaining(["token", "password"]));
    }
    const shortPassword = validatePasswordReset({
      token: "a".repeat(20),
      password: "short",
    });
    expect(shortPassword.ok).toBe(false);
    if (!shortPassword.ok) {
      expect(shortPassword.fieldPaths).toEqual(["password"]);
    }
    expect(RECOVERY_PASSWORD_BOUNDS).toEqual({ min: 10, max: 128 });
  });
});

describe("password reset (requirements 2.3, 2.4, 2.5, 2.9)", () => {
  test("replaces the password, consumes the token, and revokes every session", async () => {
    const harness = createHarness();
    const user = harness.repository.seedUser({
      email: "buyer@example.com",
      sessions: 3,
      passwordHash: "old-hash",
    });
    const { rawToken } = await issueToken(harness, "buyer@example.com");

    const result = await harness.service.resetPassword({
      payload: { token: rawToken, password: "correct horse battery" },
      sourceAddress: "203.0.113.44",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.code).toBe("PASSWORD_RESET_COMPLETE");
    expect(result.userId).toBe(user.id);

    const snap = harness.repository.snapshot();
    const owner = snap.users.find((u) => u.id === user.id)!;
    expect(owner.passwordHash).toBe("hash:correct horse battery");
    expect(snap.sessions.filter((s) => s.userId === user.id)).toHaveLength(0);
    expect(snap.tokens.every((t) => t.consumedAt !== null)).toBe(true);
    expect(harness.audit.entries.some((e) => e.action === "PASSWORD_RESET")).toBe(true);
    // Audits and responses never carry the raw token.
    for (const entry of harness.audit.entries) {
      expect(JSON.stringify(entry)).not.toContain(rawToken);
    }
  });

  test("rejects a replay of a consumed token without mutating anything", async () => {
    const harness = createHarness();
    harness.repository.seedUser({ email: "buyer@example.com", sessions: 2 });
    const { rawToken } = await issueToken(harness, "buyer@example.com");
    await harness.service.resetPassword({
      payload: { token: rawToken, password: "first-password" },
      sourceAddress: "10.0.0.1",
    });
    const afterFirst = harness.repository.snapshot();
    const result = await harness.service.resetPassword({
      payload: { token: rawToken, password: "second-password-xx" },
      sourceAddress: "10.0.0.1",
    });
    expect(result).toEqual({
      ok: false,
      status: 400,
      code: "RECOVERY_TOKEN_INVALID",
    });
    expect(harness.repository.snapshot()).toEqual(afterFirst);
  });

  test("rejects an expired token without consuming it", async () => {
    const harness = createHarness();
    harness.repository.seedUser({ email: "buyer@example.com" });
    const { rawToken } = await issueToken(harness, "buyer@example.com");
    harness.clock.advanceBy(RECOVERY_TOKEN_TTL_MS + 1);
    const before = harness.repository.snapshot();
    const result = await harness.service.resetPassword({
      payload: { token: rawToken, password: "still-valid-password" },
      sourceAddress: "10.0.0.1",
    });
    expect(result.code).toBe("RECOVERY_TOKEN_INVALID");
    expect(harness.repository.snapshot().tokens[0]!.consumedAt).toBeNull();
    expect(harness.repository.snapshot().users[0]!.passwordHash).toBe(
      before.users[0]!.passwordHash
    );
  });

  test("rejects a bad password without consuming the token or revoking sessions", async () => {
    const harness = createHarness();
    harness.repository.seedUser({ email: "buyer@example.com", sessions: 2 });
    const { rawToken } = await issueToken(harness, "buyer@example.com");
    const before = harness.repository.snapshot();
    const result = await harness.service.resetPassword({
      payload: { token: rawToken, password: "short" },
      sourceAddress: "10.0.0.1",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("RECOVERY_PASSWORD_REJECTED");
    expect(result.fieldPaths).toEqual(["password"]);
    expect(harness.repository.snapshot()).toEqual(before);
  });

  test("rolls back the staged reset when a write boundary fails", async () => {
    const harness = createHarness();
    harness.repository.seedUser({ email: "buyer@example.com", sessions: 1 });
    const { rawToken } = await issueToken(harness, "buyer@example.com");
    const before = harness.repository.snapshot();
    harness.repository.failNextWriteAt("password");
    await expect(
      harness.service.resetPassword({
        payload: { token: rawToken, password: "still-valid-password" },
        sourceAddress: "10.0.0.1",
      })
    ).rejects.toBeInstanceOf(InjectedRecoveryWriteFailure);
    expect(harness.repository.snapshot()).toEqual(before);
  });

  test("keeps a successful reset when the audit sink fails after commit", async () => {
    const harness = createHarness();
    harness.repository.seedUser({ email: "buyer@example.com" });
    const { rawToken } = await issueToken(harness, "buyer@example.com");
    harness.audit.failNext();
    const result = await harness.service.resetPassword({
      payload: { token: rawToken, password: "still-valid-password" },
      sourceAddress: "10.0.0.1",
    });
    expect(result.ok).toBe(true);
    expect(harness.repository.snapshot().sessions).toHaveLength(0);
  });
});

describe("recovery helpers", () => {
  test("buildResetUrl embeds the raw token exactly once", () => {
    const url = buildResetUrl("https://app.example", "raw-token-value");
    expect(url).toBe("https://app.example/reset-password?token=raw-token-value");
  });

  test("createTokenDigest digests remain opaque in storage", () => {
    const issued = createTokenDigest({
      randomness: new DeterministicRandomSource(7),
    });
    expect(issued.rawToken.length).toBeGreaterThanOrEqual(10);
    expect(issued.tokenHash).not.toEqual(issued.rawToken);
  });

  test("deadline constant matches the thirty-second requirement", () => {
    expect(RECOVERY_EMAIL_DEADLINE_MS).toBe(30_000);
    expect(ProviderDeadlineExceededError).toBeDefined();
  });
});
