/**
 * Feature: platform-completion — task 2.2: unverified-session gating and safe
 * public account routes (requirements 1.5, 1.6, 1.7, 1.10, 18.4, 19.4).
 *
 * These tests drive the real public route handlers with an in-memory
 * Account_Service (fakes for persistence, email, audit, rate limiting, clock,
 * and randomness), so no test performs network I/O or a shared-database
 * mutation. The route wiring is exercised end to end: the request boundary maps
 * every typed domain result to the shared bilingual `ApiFailure`/success
 * contract, and the verification-gating allowlist is asserted directly.
 */

import { describe, expect, test } from "bun:test";
import { NextRequest } from "next/server";
import {
  handleRegister,
} from "../../../app/api/auth/register/route";
import { handleVerifyEmail } from "../../../app/api/auth/verify-email/route";
import {
  createAccountService,
  type AccountService,
} from "../../account-service";
import { getCompletionErrorContract } from "../../i18n";
import {
  VERIFICATION_ALLOWLIST,
  isVerificationAllowedPath,
} from "../../auth";
import {
  isApiFailure,
  selectApiFailureCode,
  selectApiFailureMessage,
} from "../../api-failure-message";
import {
  DeterministicClock,
  DeterministicRandomSource,
  createFakeAccountEmailProvider,
  createFakeAccountRateLimiter,
  createFakeAccountRepository,
  createRecordingAccountAuditSink,
  permissiveAccountRateLimiter,
  type AccountRateLimiter,
  type FakeAccountEmailProvider,
  type FakeAccountRepository,
} from "../support";

const BASE_URL = "https://app.arabclue.test";
const PRODUCTION_RUNTIME = Object.freeze({ NODE_ENV: "production" });
const DEVELOPMENT_RUNTIME = Object.freeze({ NODE_ENV: "development" });
const ARABIC = /[\u0600-\u06ff]/u;

const VALID_BODY = Object.freeze({
  email: "buyer@example.com",
  password: "correct horse battery",
  name: "Nora Al Qahtani",
  workspaceName: "Riyadh Bid Team",
  locale: "en",
});

type Harness = Readonly<{
  service: AccountService;
  repository: FakeAccountRepository;
  email: FakeAccountEmailProvider;
  clock: DeterministicClock;
}>;

function buildService(
  options: Readonly<{
    emailBehavior?: Parameters<typeof createFakeAccountEmailProvider>[0];
    rateLimiter?: AccountRateLimiter;
    identityEnvironment?: Readonly<{ NODE_ENV?: string; VERCEL?: string }>;
  }> = {}
): Harness {
  const clock = new DeterministicClock("2026-03-01T09:00:00.000Z");
  const repository = createFakeAccountRepository();
  const email = createFakeAccountEmailProvider(options.emailBehavior);
  const service = createAccountService({
    repository,
    email,
    audit: createRecordingAccountAuditSink(),
    rateLimiter: options.rateLimiter ?? permissiveAccountRateLimiter,
    clock,
    randomness: new DeterministicRandomSource(0x51ee1),
    randomUuid: new DeterministicRandomSource(0x9a17).randomUUID,
    identityEnvironment: options.identityEnvironment ?? DEVELOPMENT_RUNTIME,
    baseUrl: BASE_URL,
  });
  return { service, repository, email, clock };
}

function registerRequest(
  body: unknown,
  ip = "203.0.113.10"
): NextRequest {
  return new NextRequest("http://localhost/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

function verifyRequest(token: unknown, ip = "203.0.113.20"): NextRequest {
  return new NextRequest("http://localhost/api/auth/verify-email", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({ token }),
  });
}

function rawTokenFromLastMessage(email: FakeAccountEmailProvider): string {
  const message = email.messages.at(-1);
  if (!message) throw new Error("No verification message was produced");
  const match = /token=([^"&\s<]+)/u.exec(message.text);
  if (!match) throw new Error("No verification token was present");
  return decodeURIComponent(match[1]);
}

describe("register route maps domain results to the shared contract", () => {
  test("commits and answers 201 REGISTRATION_CREATED with a bilingual body", async () => {
    const harness = buildService();

    const res = await handleRegister(registerRequest(VALID_BODY), {
      service: harness.service,
    });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.ok).toBe(true);
    expect(body.code).toBe("REGISTRATION_CREATED");
    expect(body.message.ar.trim().length).toBeGreaterThan(0);
    expect(body.message.en.trim().length).toBeGreaterThan(0);
    expect(ARABIC.test(body.message.ar)).toBe(true);
    // Requirement 19.4 — the persisted state is read back and returned.
    expect(body.account).toMatchObject({
      email: "buyer@example.com",
      emailVerified: false,
      membershipRole: "OWNER",
    });
    expect(harness.repository.snapshot().users).toHaveLength(1);
  });

  test("never places the raw verification token in the response body", async () => {
    const harness = buildService();

    const res = await handleRegister(registerRequest(VALID_BODY), {
      service: harness.service,
    });
    const body = await res.json();
    const rawToken = rawTokenFromLastMessage(harness.email);

    expect(rawToken.length).toBeGreaterThan(20);
    expect(JSON.stringify(body)).not.toContain(rawToken);
  });

  test("answers 202 VERIFICATION_EMAIL_UNCONFIGURED when email is unset", async () => {
    const harness = buildService({ emailBehavior: { kind: "unconfigured" } });

    const res = await handleRegister(registerRequest(VALID_BODY), {
      service: harness.service,
    });
    const body = await res.json();

    expect(res.status).toBe(202);
    expect(body.code).toBe("VERIFICATION_EMAIL_UNCONFIGURED");
    expect(body.emailDelivery).toBe("UNCONFIGURED");
    // The account is still committed (criterion 1.9).
    expect(harness.repository.snapshot().users).toHaveLength(1);
  });

  test("answers 400 REGISTRATION_INVALID naming every offending field", async () => {
    const harness = buildService();

    const res = await handleRegister(
      registerRequest({ ...VALID_BODY, email: "not-an-address", password: "tiny" }),
      { service: harness.service }
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe("REGISTRATION_INVALID");
    expect(body.fieldPaths).toEqual(["email", "password"]);
    expect(isApiFailure(body)).toBe(true);
    // The offending field list is interpolated into both locales.
    expect(body.message.en).toContain("email, password");
    expect(harness.repository.isEmpty()).toBe(true);
  });

  test("answers 409 EMAIL_ALREADY_REGISTERED for a duplicate normalized email", async () => {
    const harness = buildService();
    harness.repository.seedUser({ email: "buyer@example.com" });

    const res = await handleRegister(
      registerRequest({ ...VALID_BODY, email: "  BUYER@EXAMPLE.COM  " }),
      { service: harness.service }
    );
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.code).toBe("EMAIL_ALREADY_REGISTERED");
    expect(isApiFailure(body)).toBe(true);
  });

  test("answers 400 RESERVED_IDENTITY before the uniqueness check in production", async () => {
    const harness = buildService({ identityEnvironment: PRODUCTION_RUNTIME });

    const res = await handleRegister(
      registerRequest({ ...VALID_BODY, email: "dev@arabclue.local" }),
      { service: harness.service }
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe("RESERVED_IDENTITY");
    expect(harness.repository.isEmpty()).toBe(true);
  });

  test("answers 429 REGISTRATION_RATE_LIMITED with a Retry-After header", async () => {
    const denyLimiter: AccountRateLimiter = {
      consume: async () => ({ ok: false, retryAfterSeconds: 42 }),
    };
    const harness = buildService({ rateLimiter: denyLimiter });

    const res = await handleRegister(registerRequest(VALID_BODY), {
      service: harness.service,
    });
    const body = await res.json();

    expect(res.status).toBe(429);
    expect(body.code).toBe("REGISTRATION_RATE_LIMITED");
    expect(res.headers.get("retry-after")).toBe("42");
    expect(harness.repository.isEmpty()).toBe(true);
  });

  test("treats an unreadable body as REGISTRATION_INVALID", async () => {
    const harness = buildService();
    const req = new NextRequest("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ not json",
    });

    const res = await handleRegister(req, { service: harness.service });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe("REGISTRATION_INVALID");
    expect(harness.repository.isEmpty()).toBe(true);
  });
});

describe("verify-email route maps domain results to the shared contract", () => {
  test("answers 200 EMAIL_VERIFIED for a valid, unexpired token (1.6)", async () => {
    const harness = buildService();
    await handleRegister(registerRequest(VALID_BODY), { service: harness.service });
    const rawToken = rawTokenFromLastMessage(harness.email);
    harness.clock.advanceBy(60_000);

    const res = await handleVerifyEmail(verifyRequest(rawToken), {
      service: harness.service,
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.code).toBe("EMAIL_VERIFIED");
    expect(body.message.ar.trim().length).toBeGreaterThan(0);
    expect(body.message.en.trim().length).toBeGreaterThan(0);
    expect(harness.repository.snapshot().users[0].emailVerified).toBe(true);
  });

  test("answers 400 VERIFICATION_TOKEN_INVALID and mutates nothing (1.7)", async () => {
    const harness = buildService();
    await handleRegister(registerRequest(VALID_BODY), { service: harness.service });
    const before = harness.repository.snapshot();

    const res = await handleVerifyEmail(verifyRequest("ac.v1.unknown.token"), {
      service: harness.service,
    });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe("VERIFICATION_TOKEN_INVALID");
    expect(isApiFailure(body)).toBe(true);
    expect(harness.repository.snapshot()).toEqual(before);
  });

  test("rejects a replayed token after it is consumed (1.6, 1.7)", async () => {
    const harness = buildService();
    await handleRegister(registerRequest(VALID_BODY), { service: harness.service });
    const rawToken = rawTokenFromLastMessage(harness.email);
    harness.clock.advanceBy(60_000);

    const first = await handleVerifyEmail(verifyRequest(rawToken), {
      service: harness.service,
    });
    expect(first.status).toBe(200);

    const replay = await handleVerifyEmail(verifyRequest(rawToken), {
      service: harness.service,
    });
    const replayBody = await replay.json();
    expect(replay.status).toBe(400);
    expect(replayBody.code).toBe("VERIFICATION_TOKEN_INVALID");
  });

  test("rate-limited verification returns 429 with a Retry-After header", async () => {
    const clock = new DeterministicClock("2026-03-01T09:00:00.000Z");
    const service = createAccountService({
      repository: createFakeAccountRepository(),
      email: createFakeAccountEmailProvider(),
      audit: createRecordingAccountAuditSink(),
      rateLimiter: { consume: async () => ({ ok: false, retryAfterSeconds: 15 }) },
      clock,
    });

    const res = await handleVerifyEmail(verifyRequest("ac.v1.a.b"), { service });
    const body = await res.json();

    expect(res.status).toBe(429);
    expect(body.code).toBe("VERIFICATION_RATE_LIMITED");
    expect(res.headers.get("retry-after")).toBe("15");
  });
});

describe("unverified-session gating allowlist (requirement 1.5)", () => {
  test("admits only the verification surface, its reissue, sign-out, and session refresh", () => {
    // The reissue endpoint belongs here: the signed-in-but-unverified session is
    // precisely the caller who needs a new link, and a 403 from the gate would
    // leave a failed send or a lapsed token unrecoverable.
    const allowedPaths = [
      "/verify-email",
      "/api/auth/verify-email",
      "/api/auth/resend-verification",
      "/api/auth/session",
      "/api/auth/signout",
      "/api/auth/csrf",
    ];

    expect([...VERIFICATION_ALLOWLIST].sort()).toEqual([...allowedPaths].sort());

    for (const allowed of allowedPaths) {
      expect(isVerificationAllowedPath(allowed)).toBe(true);
    }
  });

  test("denies every other authenticated API and page", () => {
    for (const denied of [
      "/app",
      "/app/projects",
      "/api/projects",
      "/api/documents",
      "/api/analytics/proposals",
      "/api/auth/avatar",
      "/api/auth/profile",
      "/api/invitations",
    ]) {
      expect(isVerificationAllowedPath(denied)).toBe(false);
    }
  });
});

describe("bilingual EMAIL_VERIFICATION_REQUIRED body (requirements 1.5, 18.4)", () => {
  test("carries a stable code and a non-empty Arabic and English message", () => {
    const contract = getCompletionErrorContract("EMAIL_VERIFICATION_REQUIRED");
    const body = { ...contract, error: contract.message };

    expect(isApiFailure(body)).toBe(true);
    expect(body.code).toBe("EMAIL_VERIFICATION_REQUIRED");
    expect(ARABIC.test(body.message.ar)).toBe(true);
    expect(body.message.en.trim().length).toBeGreaterThan(0);
    expect(selectApiFailureCode(body)).toBe("EMAIL_VERIFICATION_REQUIRED");
    expect(selectApiFailureMessage(body, "ar")).toBe(body.message.ar);
    expect(selectApiFailureMessage(body, "en")).toBe(body.message.en);
  });
});
