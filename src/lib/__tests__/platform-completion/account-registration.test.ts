/**
 * Feature: platform-completion — transactional registration and email
 * verification (requirements 1.1, 1.2, 1.3, 1.4, 1.6, 1.7, 1.8, 1.9, 1.11,
 * 1.12, 1.13).
 *
 * Every test drives the real domain service with in-memory persistence and
 * provider fakes: no network call, no email send, no database mutation.
 */

import { beforeEach, describe, expect, test } from "bun:test";
import {
  REGISTRATION_FIELD_BOUNDS,
  REGISTRATION_MEMBERSHIP_ROLE,
  REGISTRATION_PLATFORM_ROLE,
  REGISTRATION_RATE_LIMIT,
  VERIFICATION_EMAIL_DEADLINE_MS,
  VERIFICATION_RATE_LIMIT,
  VERIFICATION_TOKEN_TTL_MS,
  buildVerificationUrl,
  createAccountService,
  normalizeAccountEmail,
  validateRegistrationPayload,
  type AccountService,
  type RegistrationResult,
} from "../../account-service";
import { buildVerificationEmailContent } from "../../account-verification-email";
import { ProviderDeadlineExceededError } from "../../provider-timeout";
import { createTokenDigest } from "../../token-digest";
import {
  DeterministicClock,
  DeterministicRandomSource,
  InjectedWriteFailure,
  createFakeAccountEmailProvider,
  createFakeAccountRateLimiter,
  createFakeAccountRepository,
  createImmediateDeadlineScheduler,
  createRecordingAccountAuditSink,
  permissiveAccountRateLimiter,
  type AccountWriteBoundary,
  type FakeAccountEmailProvider,
  type FakeAccountRepository,
  type RecordingAccountAuditSink,
} from "../support";

const BASE_URL = "https://app.arabclue.test";
const PRODUCTION_RUNTIME = Object.freeze({ NODE_ENV: "production" });
const DEVELOPMENT_RUNTIME = Object.freeze({ NODE_ENV: "development" });

const VALID_PAYLOAD = Object.freeze({
  email: "  Buyer@Example.COM ",
  password: "correct horse battery",
  name: "  Nora Al Qahtani  ",
  workspaceName: "  Riyadh Bid Team  ",
  locale: "en",
});

type Harness = Readonly<{
  service: AccountService;
  repository: FakeAccountRepository;
  email: FakeAccountEmailProvider;
  audit: RecordingAccountAuditSink;
  clock: DeterministicClock;
}>;

function createHarness(
  options: Readonly<{
    emailBehavior?: Parameters<typeof createFakeAccountEmailProvider>[0];
    rollingRateLimit?: boolean;
    identityEnvironment?: Readonly<{ NODE_ENV?: string; VERCEL?: string }>;
    immediateDeadline?: boolean;
  }> = {}
): Harness {
  const clock = new DeterministicClock("2026-03-01T09:00:00.000Z");
  const repository = createFakeAccountRepository();
  const email = createFakeAccountEmailProvider(options.emailBehavior);
  const audit = createRecordingAccountAuditSink();
  const service = createAccountService({
    repository,
    email,
    audit,
    rateLimiter: options.rollingRateLimit
      ? createFakeAccountRateLimiter(() => clock.now())
      : permissiveAccountRateLimiter,
    clock,
    randomness: new DeterministicRandomSource(0x51ee1),
    randomUuid: new DeterministicRandomSource(0x9a17).randomUUID,
    identityEnvironment: options.identityEnvironment ?? DEVELOPMENT_RUNTIME,
    baseUrl: BASE_URL,
    ...(options.immediateDeadline
      ? { deadlineScheduler: createImmediateDeadlineScheduler() }
      : {}),
  });

  return { service, repository, email, audit, clock };
}

function register(
  service: AccountService,
  overrides: Readonly<Record<string, unknown>> = {},
  sourceAddress = "203.0.113.10"
): Promise<RegistrationResult> {
  return service.register({
    payload: { ...VALID_PAYLOAD, ...overrides },
    sourceAddress,
  });
}

function rawTokenFromLastMessage(email: FakeAccountEmailProvider): string {
  const message = email.messages.at(-1);
  if (!message) throw new Error("No verification message was produced");
  const match = /token=([^"&\s<]+)/u.exec(message.text);
  if (!match) throw new Error("No verification token was present in the message");
  return decodeURIComponent(match[1]);
}

describe("registration payload validation (requirement 1.11)", () => {
  test("normalizes an accepted payload and defaults the locale to Arabic", () => {
    const result = validateRegistrationPayload({
      email: " Owner@Example.COM ",
      password: "a".repeat(REGISTRATION_FIELD_BOUNDS.password.min),
      name: "  Sara  ",
      workspaceName: "  Bid Desk  ",
    });

    expect(result).toEqual({
      ok: true,
      value: {
        email: "owner@example.com",
        password: "a".repeat(10),
        name: "Sara",
        workspaceName: "Bid Desk",
        locale: "ar",
      },
    });
  });

  test("accepts the exact upper bound of every field", () => {
    const localPart = "b".repeat(64);
    const domain = `${"c".repeat(181)}.example`;
    const email = `${localPart}@${domain}`;
    expect(email.length).toBe(REGISTRATION_FIELD_BOUNDS.email.max);

    const result = validateRegistrationPayload({
      email,
      password: "p".repeat(REGISTRATION_FIELD_BOUNDS.password.max),
      name: "n".repeat(REGISTRATION_FIELD_BOUNDS.name.max),
      workspaceName: "w".repeat(REGISTRATION_FIELD_BOUNDS.workspaceName.max),
      locale: "en",
    });

    expect(result.ok).toBe(true);
  });

  test("names every offending field when all bounds are violated", () => {
    const result = validateRegistrationPayload({
      email: "a@b",
      password: "short",
      name: "x",
      workspaceName: " ",
      locale: "fr",
    });

    expect(result).toEqual({
      ok: false,
      fieldPaths: ["email", "password", "name", "workspaceName", "locale"],
    });
  });

  test("names every required field for a missing or non-object payload", () => {
    for (const payload of [null, undefined, "registration", 7, []]) {
      expect(validateRegistrationPayload(payload)).toEqual({
        ok: false,
        fieldPaths: ["email", "password", "name", "workspaceName"],
      });
    }

    expect(validateRegistrationPayload({})).toEqual({
      ok: false,
      fieldPaths: ["email", "password", "name", "workspaceName"],
    });
  });

  test("rejects addresses that fail format validation", () => {
    const rejected = [
      "plainaddress",
      "two@@example.com",
      "spaced address@example.com",
      "trailing@example.com.",
      "missing@domain",
      "under_score@-example.com",
      `${"l".repeat(65)}@example.com`,
    ];

    for (const email of rejected) {
      expect(validateRegistrationPayload({ ...VALID_PAYLOAD, email }).ok).toBe(
        false
      );
    }
  });

  test("measures the password without trimming and the text fields after trimming", () => {
    const spaces = " ".repeat(REGISTRATION_FIELD_BOUNDS.password.min);
    expect(
      validateRegistrationPayload({ ...VALID_PAYLOAD, password: spaces }).ok
    ).toBe(true);

    expect(
      validateRegistrationPayload({
        ...VALID_PAYLOAD,
        name: `  ${"y".repeat(REGISTRATION_FIELD_BOUNDS.name.max + 1)}  `,
      })
    ).toEqual({ ok: false, fieldPaths: ["name"] });
  });

  test("case-folds and trims the normalized address used for uniqueness", () => {
    expect(normalizeAccountEmail("  MiXeD@Example.COM  ")).toBe(
      "mixed@example.com"
    );
  });
});

describe("registration persistence and delivery (requirements 1.1, 1.4, 1.9, 1.13)", () => {
  let harness: Harness;

  beforeEach(() => {
    harness = createHarness();
  });

  test("commits user, workspace, writer membership, and one token, then answers 201", async () => {
    const result = await register(harness.service);

    expect(result).toMatchObject({
      ok: true,
      status: 201,
      code: "REGISTRATION_CREATED",
      emailDelivery: "SENT",
    });
    if (!result.ok) throw new Error("Expected a successful registration");

    const state = harness.repository.snapshot();
    expect(state.users).toHaveLength(1);
    expect(state.workspaces).toHaveLength(1);
    expect(state.members).toHaveLength(1);
    expect(state.tokens).toHaveLength(1);

    expect(state.users[0]).toMatchObject({
      email: "buyer@example.com",
      name: "Nora Al Qahtani",
      locale: "en",
      platformRole: REGISTRATION_PLATFORM_ROLE,
      emailVerified: false,
      emailVerifiedAt: null,
      activeWorkspaceId: state.workspaces[0].id,
    });
    expect(state.workspaces[0].name).toBe("Riyadh Bid Team");
    expect(state.workspaces[0].slug.startsWith("riyadh-bid-team-")).toBe(true);
    expect(state.members[0]).toMatchObject({
      role: REGISTRATION_MEMBERSHIP_ROLE,
      userId: state.users[0].id,
      workspaceId: state.workspaces[0].id,
    });

    expect(result.account).toMatchObject({
      userId: state.users[0].id,
      workspaceId: state.workspaces[0].id,
      membershipId: state.members[0].id,
      membershipRole: REGISTRATION_MEMBERSHIP_ROLE,
      email: "buyer@example.com",
      emailVerified: false,
      verificationTokenId: state.tokens[0].id,
    });
  });

  test("issues exactly one salted token expiring 24 hours after its creation", async () => {
    const result = await register(harness.service);
    if (!result.ok) throw new Error("Expected a successful registration");

    const [token] = harness.repository.snapshot().tokens;
    expect(token.hashVersion).toBe(1);
    expect(typeof token.hashSalt).toBe("string");
    expect((token.hashSalt ?? "").length).toBeGreaterThan(0);
    expect(token.consumedAt).toBeNull();
    expect(token.expiresAt.getTime() - token.createdAt.getTime()).toBe(
      VERIFICATION_TOKEN_TTL_MS
    );
    expect(VERIFICATION_TOKEN_TTL_MS).toBe(24 * 60 * 60 * 1000);
    expect(result.account.verificationTokenCreatedAt).toBe(
      token.createdAt.toISOString()
    );
    expect(result.account.verificationTokenExpiresAt).toBe(
      token.expiresAt.toISOString()
    );
  });

  test("keeps the raw token out of persistence, the result, and audit entries", async () => {
    const result = await register(harness.service);
    const rawToken = rawTokenFromLastMessage(harness.email);

    expect(rawToken.length).toBeGreaterThan(20);
    expect(JSON.stringify(result)).not.toContain(rawToken);
    expect(JSON.stringify(harness.repository.snapshot())).not.toContain(rawToken);
    expect(JSON.stringify(harness.audit.entries)).not.toContain(rawToken);
    for (const entry of harness.audit.entries) {
      expect(Object.keys(entry.details).sort()).not.toContain("token");
    }
  });

  test("appends the registration audit entry with the address and a UTC timestamp", async () => {
    await register(harness.service);

    expect(harness.audit.entries).toHaveLength(1);
    expect(harness.audit.entries[0]).toMatchObject({
      action: "REGISTRATION_CREATED",
      resource: "User",
      severity: "INFO",
      details: {
        email: "buyer@example.com",
        occurredAt: "2026-03-01T09:00:00.000Z",
      },
    });
  });

  test("sends one bilingual message carrying the verification link", async () => {
    await register(harness.service);

    expect(harness.email.messages).toHaveLength(1);
    const [message] = harness.email.messages;
    expect(message.to).toBe("buyer@example.com");
    expect(message.locale).toBe("en");
    expect(message.subject).toContain("Confirm your Arabclue email address");
    expect(message.subject).toContain("أكد بريدك الإلكتروني");
    expect(message.html).toContain('dir="rtl"');
    expect(message.html).toContain('dir="ltr"');
    expect(message.html).toContain("Riyadh Bid Team");
    expect(message.text).toContain(`${BASE_URL}/verify-email?token=`);
  });

  test("answers 202 VERIFICATION_EMAIL_UNCONFIGURED and keeps every record", async () => {
    const unconfigured = createHarness({
      emailBehavior: { kind: "unconfigured" },
    });

    const result = await register(unconfigured.service);

    expect(result).toMatchObject({
      ok: true,
      status: 202,
      code: "VERIFICATION_EMAIL_UNCONFIGURED",
      emailDelivery: "UNCONFIGURED",
    });
    expect(unconfigured.email.messages).toHaveLength(0);
    const state = unconfigured.repository.snapshot();
    expect(state.users).toHaveLength(1);
    expect(state.tokens).toHaveLength(1);
    expect(unconfigured.audit.entries.map((entry) => entry.action)).toEqual([
      "REGISTRATION_CREATED",
      "EMAIL_VERIFICATION_PENDING",
    ]);
    expect(unconfigured.audit.entries[1]).toMatchObject({
      severity: "INFO",
      details: {
        email: "buyer@example.com",
        occurredAt: "2026-03-01T09:00:00.000Z",
        reason: "email_unconfigured",
      },
    });
  });

  test("answers 202 VERIFICATION_EMAIL_SEND_FAILED when delivery reports failure", async () => {
    const failing = createHarness({ emailBehavior: { kind: "failed" } });

    const result = await register(failing.service);

    expect(result).toMatchObject({
      ok: true,
      status: 202,
      code: "VERIFICATION_EMAIL_SEND_FAILED",
      emailDelivery: "FAILED",
    });
    const state = failing.repository.snapshot();
    expect(state.users).toHaveLength(1);
    expect(state.workspaces).toHaveLength(1);
    expect(state.members).toHaveLength(1);
    expect(state.tokens).toHaveLength(1);
    expect(failing.audit.entries[1]).toMatchObject({
      action: "EMAIL_VERIFICATION_SEND_FAILED",
      severity: "WARN",
      details: { email: "buyer@example.com", reason: "delivery_failed" },
    });
  });

  test("answers 202 VERIFICATION_EMAIL_SEND_FAILED when the provider throws", async () => {
    const throwing = createHarness({ emailBehavior: { kind: "throws" } });

    const result = await register(throwing.service);

    expect(result).toMatchObject({
      status: 202,
      code: "VERIFICATION_EMAIL_SEND_FAILED",
    });
    expect(throwing.repository.snapshot().tokens).toHaveLength(1);
    expect(throwing.audit.entries[1]?.details.reason).toBe("delivery_failed");
  });

  test("answers 202 VERIFICATION_EMAIL_SEND_FAILED when delivery exceeds its deadline", async () => {
    const hanging = createHarness({
      emailBehavior: { kind: "hangs" },
      immediateDeadline: true,
    });

    const result = await register(hanging.service);

    expect(VERIFICATION_EMAIL_DEADLINE_MS).toBe(30_000);
    expect(result).toMatchObject({
      ok: true,
      status: 202,
      code: "VERIFICATION_EMAIL_SEND_FAILED",
      emailDelivery: "FAILED",
    });
    expect(hanging.audit.entries[1]).toMatchObject({
      action: "EMAIL_VERIFICATION_SEND_FAILED",
      details: { reason: "delivery_timeout" },
    });
    expect(hanging.email.abortReasons[0]).toBeInstanceOf(
      ProviderDeadlineExceededError
    );
    const state = hanging.repository.snapshot();
    expect(state.users).toHaveLength(1);
    expect(state.tokens).toHaveLength(1);
  });

  test("keeps a committed registration successful when the audit sink fails", async () => {
    harness.audit.failNext(true);

    const result = await register(harness.service);

    expect(result.ok).toBe(true);
    expect(harness.repository.snapshot().users).toHaveLength(1);
  });
});

describe("registration rejection ordering and side-effect freedom (requirements 1.2, 1.3, 1.11, 1.12)", () => {
  test("evaluates the reserved development identity before the uniqueness check", async () => {
    const production = createHarness({
      identityEnvironment: PRODUCTION_RUNTIME,
    });
    production.repository.seedUser({ email: "dev@arabclue.local" });

    const result = await register(production.service, {
      email: "Dev@Arabclue.Local",
    });

    expect(result).toEqual({
      ok: false,
      status: 400,
      code: "RESERVED_IDENTITY",
    });
    expect(production.repository.snapshot().users).toHaveLength(1);
    expect(production.repository.createAccountCalls).toHaveLength(0);
    expect(production.audit.entries).toHaveLength(0);
  });

  test("admits a reserved development identity outside a production runtime", async () => {
    const development = createHarness({
      identityEnvironment: DEVELOPMENT_RUNTIME,
    });

    const result = await register(development.service, {
      email: "dev@arabclue.local",
    });

    expect(result).toMatchObject({ ok: true, code: "REGISTRATION_CREATED" });
  });

  test("rejects a duplicate normalized address with 409 and changes nothing", async () => {
    const harness = createHarness();
    const seeded = harness.repository.seedUser({ email: "Owner@Example.com" });
    const before = harness.repository.snapshot();

    const result = await register(harness.service, {
      email: "  OWNER@EXAMPLE.COM  ",
    });

    expect(result).toEqual({
      ok: false,
      status: 409,
      code: "EMAIL_ALREADY_REGISTERED",
    });
    expect(harness.repository.snapshot()).toEqual(before);
    expect(harness.repository.snapshot().users[0].id).toBe(seeded.id);
    expect(harness.repository.createAccountCalls).toHaveLength(0);
    expect(harness.email.messages).toHaveLength(0);
  });

  test("maps a unique-index race during the transaction to 409", async () => {
    const harness = createHarness();
    const service = createAccountService({
      repository: {
        findUserIdByNormalizedEmail: async () => null,
        createAccountRecords: harness.repository.createAccountRecords,
        findVerificationTokenByHash:
          harness.repository.findVerificationTokenByHash,
        consumeVerificationToken: harness.repository.consumeVerificationToken,
      },
      email: harness.email,
      audit: harness.audit,
      rateLimiter: permissiveAccountRateLimiter,
      clock: harness.clock,
      baseUrl: BASE_URL,
      identityEnvironment: DEVELOPMENT_RUNTIME,
    });
    harness.repository.seedUser({ email: "buyer@example.com" });

    const result = await service.register({
      payload: VALID_PAYLOAD,
      sourceAddress: "203.0.113.11",
    });

    expect(result).toEqual({
      ok: false,
      status: 409,
      code: "EMAIL_ALREADY_REGISTERED",
    });
    expect(harness.repository.snapshot().workspaces).toHaveLength(0);
  });

  test("rejects an invalid payload with 400 and creates nothing", async () => {
    const harness = createHarness();

    const result = await register(harness.service, {
      email: "not-an-address",
      password: "tiny",
    });

    expect(result).toEqual({
      ok: false,
      status: 400,
      code: "REGISTRATION_INVALID",
      fieldPaths: ["email", "password"],
    });
    expect(harness.repository.isEmpty()).toBe(true);
    expect(harness.audit.entries).toHaveLength(0);
  });

  test("persists nothing when any write inside the transaction fails", async () => {
    const boundaries: readonly AccountWriteBoundary[] = [
      "user",
      "workspace",
      "member",
      "token",
    ];

    for (const boundary of boundaries) {
      const harness = createHarness();
      harness.repository.failNextWriteAt(boundary);

      await expect(register(harness.service)).rejects.toBeInstanceOf(
        InjectedWriteFailure
      );

      expect(harness.repository.isEmpty()).toBe(true);
      expect(harness.audit.entries).toHaveLength(0);
      expect(harness.email.messages).toHaveLength(0);
    }
  });
});

describe("email verification (requirements 1.6, 1.7)", () => {
  test("verifies once, then rejects every later submission of the same token", async () => {
    const harness = createHarness();
    await register(harness.service);
    const rawToken = rawTokenFromLastMessage(harness.email);

    harness.clock.advanceBy(60_000);
    const first = await harness.service.verifyEmail({
      token: rawToken,
      sourceAddress: "203.0.113.20",
    });

    expect(first).toEqual({
      ok: true,
      status: 200,
      code: "EMAIL_VERIFIED",
      userId: harness.repository.snapshot().users[0].id,
      verifiedAt: "2026-03-01T09:01:00.000Z",
    });
    const verified = harness.repository.snapshot();
    expect(verified.users[0]).toMatchObject({
      emailVerified: true,
      emailVerifiedAt: new Date("2026-03-01T09:01:00.000Z"),
    });
    expect(verified.tokens[0].consumedAt).toEqual(
      new Date("2026-03-01T09:01:00.000Z")
    );
    expect(harness.audit.entries.at(-1)).toMatchObject({
      action: "EMAIL_VERIFIED",
      details: { email: "buyer@example.com" },
    });

    const replay = await harness.service.verifyEmail({
      token: rawToken,
      sourceAddress: "203.0.113.20",
    });

    expect(replay).toEqual({
      ok: false,
      status: 400,
      code: "VERIFICATION_TOKEN_INVALID",
    });
    expect(harness.repository.snapshot()).toEqual(verified);
  });

  test("rejects an expired token and leaves the verification state unchanged", async () => {
    const harness = createHarness();
    await register(harness.service);
    const rawToken = rawTokenFromLastMessage(harness.email);
    const before = harness.repository.snapshot();

    harness.clock.advanceBy(VERIFICATION_TOKEN_TTL_MS + 1);
    const result = await harness.service.verifyEmail({
      token: rawToken,
      sourceAddress: "203.0.113.21",
    });

    expect(result).toEqual({
      ok: false,
      status: 400,
      code: "VERIFICATION_TOKEN_INVALID",
    });
    expect(harness.repository.snapshot()).toEqual(before);
  });

  test("rejects unknown, malformed, and non-string submissions without a read-through", async () => {
    const harness = createHarness();
    await register(harness.service);
    const before = harness.repository.snapshot();
    const unknownToken = createTokenDigest({
      randomness: new DeterministicRandomSource(0xbeef),
    }).rawToken;

    for (const token of [unknownToken, "short", "", null, 42, { token: "x" }]) {
      expect(
        await harness.service.verifyEmail({
          token,
          sourceAddress: "203.0.113.22",
        })
      ).toEqual({
        ok: false,
        status: 400,
        code: "VERIFICATION_TOKEN_INVALID",
      });
    }

    expect(harness.repository.consumeCalls).toHaveLength(0);
    expect(harness.repository.snapshot()).toEqual(before);
  });

  test("rejects a token whose stored digest does not match the submission", async () => {
    const harness = createHarness();
    await register(harness.service);
    const foreign = createTokenDigest({
      randomness: new DeterministicRandomSource(0xfeed),
    });
    const [user] = harness.repository.snapshot().users;
    harness.repository.seedVerificationToken({
      userId: user.id,
      // Stored under a digest the submitted token cannot reproduce.
      tokenHash: foreign.tokenHash,
      hashSalt: "not-the-issued-salt",
      hashVersion: 1,
      createdAt: harness.clock.now(),
      expiresAt: new Date(harness.clock.now().getTime() + VERIFICATION_TOKEN_TTL_MS),
    });

    const result = await harness.service.verifyEmail({
      token: foreign.rawToken,
      sourceAddress: "203.0.113.23",
    });

    expect(result).toEqual({
      ok: false,
      status: 400,
      code: "VERIFICATION_TOKEN_INVALID",
    });
    expect(harness.repository.snapshot().users[0].emailVerified).toBe(false);
  });
});

describe("rolling source-address rate limits (requirements 1.8, 1.12)", () => {
  test("denies the sixth registration in the window and recovers after it", async () => {
    const harness = createHarness({ rollingRateLimit: true });
    const source = "198.51.100.7";

    for (let attempt = 0; attempt < REGISTRATION_RATE_LIMIT.limit; attempt += 1) {
      const accepted = await register(
        harness.service,
        { email: `buyer${attempt}@example.com` },
        source
      );
      expect(accepted.ok).toBe(true);
      harness.clock.advanceBy(1_000);
    }

    const denied = await register(
      harness.service,
      { email: "buyer-over-limit@example.com" },
      source
    );

    expect(denied).toMatchObject({
      ok: false,
      status: 429,
      code: "REGISTRATION_RATE_LIMITED",
    });
    if (denied.ok || denied.code !== "REGISTRATION_RATE_LIMITED") {
      throw new Error("Expected a rate-limited registration");
    }
    expect(denied.retryAfterSeconds).toBeGreaterThan(0);
    expect(harness.repository.snapshot().users).toHaveLength(
      REGISTRATION_RATE_LIMIT.limit
    );
    expect(harness.repository.createAccountCalls).toHaveLength(
      REGISTRATION_RATE_LIMIT.limit
    );

    // Another source address is unaffected inside the same window.
    const otherSource = await register(
      harness.service,
      { email: "other-source@example.com" },
      "198.51.100.8"
    );
    expect(otherSource.ok).toBe(true);

    harness.clock.advanceBy(REGISTRATION_RATE_LIMIT.windowMs);
    const afterWindow = await register(
      harness.service,
      { email: "buyer-after-window@example.com" },
      source
    );
    expect(afterWindow.ok).toBe(true);
  });

  test("denies the twenty-first verification submission and consumes no token", async () => {
    const harness = createHarness({ rollingRateLimit: true });
    await register(harness.service, {}, "198.51.100.9");
    const rawToken = rawTokenFromLastMessage(harness.email);
    const source = "198.51.100.10";

    for (let attempt = 0; attempt < VERIFICATION_RATE_LIMIT.limit; attempt += 1) {
      const rejected = await harness.service.verifyEmail({
        token: "ac.v1.unknown.token-value",
        sourceAddress: source,
      });
      expect(rejected).toMatchObject({ code: "VERIFICATION_TOKEN_INVALID" });
    }

    const denied = await harness.service.verifyEmail({
      token: rawToken,
      sourceAddress: source,
    });

    expect(denied).toMatchObject({
      ok: false,
      status: 429,
      code: "VERIFICATION_RATE_LIMITED",
    });
    expect(harness.repository.consumeCalls).toHaveLength(0);
    expect(harness.repository.snapshot().users[0].emailVerified).toBe(false);
    expect(harness.repository.snapshot().tokens[0].consumedAt).toBeNull();

    const otherSource = await harness.service.verifyEmail({
      token: rawToken,
      sourceAddress: "198.51.100.11",
    });
    expect(otherSource).toMatchObject({ code: "EMAIL_VERIFIED" });
  });
});

describe("verification email content (requirements 1.4, 1.10)", () => {
  test("renders the persisted locale first and escapes interpolated values", () => {
    const content = buildVerificationEmailContent({
      to: "buyer@example.com",
      locale: "ar",
      workspaceName: '<script>alert("x")</script>',
      verificationUrl: buildVerificationUrl(BASE_URL, "ac.v1.salt.secret"),
    });

    expect(content.html.indexOf('lang="ar"')).toBeLessThan(
      content.html.indexOf('lang="en"')
    );
    expect(content.html).not.toContain("<script>");
    expect(content.html).toContain("&lt;script&gt;");
    expect(content.text).toContain("24");
    expect(content.subject.split("—")).toHaveLength(2);
  });

  test("builds a verification URL that encodes the token exactly once", () => {
    const url = buildVerificationUrl(`${BASE_URL}/`, "ac.v1.a+b/c=");
    expect(url).toBe(
      `${BASE_URL}/verify-email?token=${encodeURIComponent("ac.v1.a+b/c=")}`
    );
    expect(new URL(url).searchParams.get("token")).toBe("ac.v1.a+b/c=");
  });
});
