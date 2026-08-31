/**
 * Feature: platform-completion — reissuing a verification email.
 *
 * Without this path a failed send or a lapsed 24-hour token is a permanent
 * lockout: `requireSession` refuses every gated route until `emailVerified` is
 * true, and the only issuance point was registration itself.
 *
 * The endpoint answers identically for a registered address, an already-verified
 * address, and an address that was never registered, so it cannot be used to
 * enumerate accounts. Every test drives the real domain service with in-memory
 * persistence and provider fakes: no network call, no database mutation.
 */

import { describe, expect, test } from "bun:test";
import { NextRequest } from "next/server";
import { handleResendVerification } from "../../../app/api/auth/resend-verification/route";
import {
  isApiFailure,
  selectApiFailureCode,
  selectApiFailureMessage,
} from "../../api-failure-message";
import {
  VERIFICATION_RESEND_RATE_LIMIT,
  VERIFICATION_TOKEN_TTL_MS,
  createAccountService,
  type AccountService,
  type RegistrationResult,
} from "../../account-service";
import {
  DeterministicClock,
  DeterministicRandomSource,
  createFakeAccountEmailProvider,
  createFakeAccountRateLimiter,
  createFakeAccountRepository,
  createRecordingAccountAuditSink,
  permissiveAccountRateLimiter,
  type FakeAccountEmailProvider,
  type FakeAccountRepository,
  type RecordingAccountAuditSink,
} from "../support";

const BASE_URL = "https://app.arabclue.test";
const SOURCE = "203.0.113.44";

const VALID_PAYLOAD = Object.freeze({
  email: "owner@example.com",
  password: "correct horse battery",
  name: "Nora Al Qahtani",
  workspaceName: "Riyadh Bid Team",
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
    identityEnvironment: Object.freeze({ NODE_ENV: "development" }),
    baseUrl: BASE_URL,
  });

  return { service, repository, email, audit, clock };
}

function register(service: AccountService): Promise<RegistrationResult> {
  return service.register({ payload: VALID_PAYLOAD, sourceAddress: SOURCE });
}

function rawTokenFromMessage(
  email: FakeAccountEmailProvider,
  index: number
): string {
  const message = email.messages.at(index);
  if (!message) throw new Error(`No verification message at index ${index}`);
  const match = /token=([^"&\s<]+)/u.exec(message.text);
  if (!match) throw new Error("No verification token was present in the message");
  return decodeURIComponent(match[1]);
}

describe("resending a verification email", () => {
  test("issues a fresh message for a registered but unverified address", async () => {
    const { service, email } = createHarness();
    await register(service);
    expect(email.messages).toHaveLength(1);

    const result = await service.resendVerificationEmail({
      email: VALID_PAYLOAD.email,
      sourceAddress: SOURCE,
    });

    expect(result).toEqual({
      ok: true,
      status: 202,
      code: "VERIFICATION_EMAIL_RESEND_ACCEPTED",
    });
    expect(email.messages).toHaveLength(2);
    expect(email.messages[1].to).toBe(VALID_PAYLOAD.email);
    // The reissued link must not repeat the first token.
    expect(rawTokenFromMessage(email, 1)).not.toBe(rawTokenFromMessage(email, 0));
  });

  test("normalizes the submitted address before looking the account up", async () => {
    const { service, email } = createHarness();
    await register(service);

    const result = await service.resendVerificationEmail({
      email: "  OWNER@Example.COM  ",
      sourceAddress: SOURCE,
    });

    expect(result.ok).toBe(true);
    expect(email.messages).toHaveLength(2);
  });

  test("the reissued token verifies and the superseded token stops working", async () => {
    const { service, email } = createHarness();
    await register(service);
    const firstToken = rawTokenFromMessage(email, 0);

    await service.resendVerificationEmail({
      email: VALID_PAYLOAD.email,
      sourceAddress: SOURCE,
    });
    const secondToken = rawTokenFromMessage(email, 1);

    // A superseded token is a live credential until it is invalidated, so the
    // reissue must retire it rather than leaving two usable links.
    const stale = await service.verifyEmail({
      token: firstToken,
      sourceAddress: SOURCE,
    });
    expect(stale).toEqual({
      ok: false,
      status: 400,
      code: "VERIFICATION_TOKEN_INVALID",
    });

    const verified = await service.verifyEmail({
      token: secondToken,
      sourceAddress: SOURCE,
    });
    expect(verified.ok).toBe(true);
    expect(verified.code).toBe("EMAIL_VERIFIED");
  });

  test("the reissued token carries a full lifetime from the reissue instant", async () => {
    const { service, repository, clock } = createHarness();
    await register(service);
    clock.advanceBy(23 * 60 * 60 * 1000);

    await service.resendVerificationEmail({
      email: VALID_PAYLOAD.email,
      sourceAddress: SOURCE,
    });

    const live = repository
      .snapshot()
      .tokens.filter((token) => token.consumedAt === null);
    expect(live).toHaveLength(1);
    expect(live[0].expiresAt.getTime() - live[0].createdAt.getTime()).toBe(
      VERIFICATION_TOKEN_TTL_MS
    );
    expect(live[0].createdAt.toISOString()).toBe(clock.now().toISOString());
  });

  test("answers identically for an address that was never registered", async () => {
    const { service, email } = createHarness();

    const result = await service.resendVerificationEmail({
      email: "stranger@example.com",
      sourceAddress: SOURCE,
    });

    expect(result).toEqual({
      ok: true,
      status: 202,
      code: "VERIFICATION_EMAIL_RESEND_ACCEPTED",
    });
    expect(email.messages).toHaveLength(0);
  });

  test("answers identically for an address that is already verified", async () => {
    const { service, email } = createHarness();
    await register(service);
    await service.verifyEmail({
      token: rawTokenFromMessage(email, 0),
      sourceAddress: SOURCE,
    });

    const result = await service.resendVerificationEmail({
      email: VALID_PAYLOAD.email,
      sourceAddress: SOURCE,
    });

    expect(result).toEqual({
      ok: true,
      status: 202,
      code: "VERIFICATION_EMAIL_RESEND_ACCEPTED",
    });
    expect(email.messages).toHaveLength(1);
  });

  test("rejects a submission that cannot be an address", async () => {
    const { service, email } = createHarness();

    for (const candidate of ["", "   ", "not-an-address", 42, null, undefined]) {
      const result = await service.resendVerificationEmail({
        email: candidate,
        sourceAddress: SOURCE,
      });
      expect(result).toEqual({
        ok: false,
        status: 400,
        code: "VERIFICATION_RESEND_INVALID",
      });
    }
    expect(email.messages).toHaveLength(0);
  });

  test("denies the request once the rolling per-address limit is exhausted", async () => {
    const { service, email } = createHarness({ rollingRateLimit: true });
    await register(service);

    for (let attempt = 0; attempt < VERIFICATION_RESEND_RATE_LIMIT.limit; attempt += 1) {
      const allowed = await service.resendVerificationEmail({
        email: VALID_PAYLOAD.email,
        sourceAddress: SOURCE,
      });
      expect(allowed.ok).toBe(true);
    }

    const denied = await service.resendVerificationEmail({
      email: VALID_PAYLOAD.email,
      sourceAddress: SOURCE,
    });
    expect(denied.ok).toBe(false);
    expect(denied.status).toBe(429);
    expect(denied.code).toBe("VERIFICATION_RESEND_RATE_LIMITED");
    if (denied.code === "VERIFICATION_RESEND_RATE_LIMITED") {
      expect(denied.retryAfterSeconds).toBeGreaterThan(0);
    }
    // The denial must not have produced a message.
    expect(email.messages).toHaveLength(
      1 + VERIFICATION_RESEND_RATE_LIMIT.limit
    );
  });

  test("limits an unknown address too, so a miss cannot be probed for free", async () => {
    const { service } = createHarness({ rollingRateLimit: true });

    for (let attempt = 0; attempt < VERIFICATION_RESEND_RATE_LIMIT.limit; attempt += 1) {
      const allowed = await service.resendVerificationEmail({
        email: "stranger@example.com",
        sourceAddress: SOURCE,
      });
      expect(allowed.ok).toBe(true);
    }

    const denied = await service.resendVerificationEmail({
      email: "stranger@example.com",
      sourceAddress: SOURCE,
    });
    expect(denied.code).toBe("VERIFICATION_RESEND_RATE_LIMITED");
  });

  test("records a reissue in the audit trail", async () => {
    const { service, audit } = createHarness();
    await register(service);

    await service.resendVerificationEmail({
      email: VALID_PAYLOAD.email,
      sourceAddress: SOURCE,
    });

    const resent = audit.entries.filter(
      (entry) => entry.action === "EMAIL_VERIFICATION_RESENT"
    );
    expect(resent).toHaveLength(1);
    expect(resent[0].severity).toBe("INFO");
    expect(resent[0].sourceAddress).toBe(SOURCE);
    expect(resent[0].details.email).toBe(VALID_PAYLOAD.email);
    expect(resent[0].resource).toBe("VerificationToken");
  });

  test("records a delivery failure and still answers 202", async () => {
    const { service, audit, email } = createHarness();
    await register(service);
    email.setBehavior({ kind: "failed" });

    const result = await service.resendVerificationEmail({
      email: VALID_PAYLOAD.email,
      sourceAddress: SOURCE,
    });

    // The caller must not learn that this address exists, even on failure.
    expect(result).toEqual({
      ok: true,
      status: 202,
      code: "VERIFICATION_EMAIL_RESEND_ACCEPTED",
    });
    const failures = audit.entries.filter(
      (entry) => entry.action === "EMAIL_VERIFICATION_SEND_FAILED"
    );
    expect(failures).toHaveLength(1);
    expect(failures[0].severity).toBe("WARN");
    expect(failures[0].details.reason).toBe("delivery_failed");
  });

  test("records an unconfigured transport without pretending it sent", async () => {
    const { service, audit } = createHarness({
      emailBehavior: { kind: "unconfigured" },
    });
    await register(service);

    const result = await service.resendVerificationEmail({
      email: VALID_PAYLOAD.email,
      sourceAddress: SOURCE,
    });

    expect(result.ok).toBe(true);
    const pending = audit.entries.filter(
      (entry) => entry.action === "EMAIL_VERIFICATION_PENDING"
    );
    expect(pending.length).toBeGreaterThanOrEqual(1);
  });
});

function resendRequest(body: unknown, ip = SOURCE): NextRequest {
  return new NextRequest("http://localhost/api/auth/resend-verification", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("resend route maps domain results to the shared contract", () => {
  test("answers 202 with a bilingual accepted body", async () => {
    const { service } = createHarness();
    await register(service);

    const res = await handleResendVerification(
      resendRequest({ email: VALID_PAYLOAD.email }),
      { service }
    );
    const body = await res.json();

    expect(res.status).toBe(202);
    expect(body.ok).toBe(true);
    expect(body.code).toBe("VERIFICATION_EMAIL_RESEND_ACCEPTED");
    expect(body.message.ar.trim().length).toBeGreaterThan(0);
    expect(body.message.en.trim().length).toBeGreaterThan(0);
  });

  test("maps a malformed address to the shared bilingual failure", async () => {
    const { service } = createHarness();

    const res = await handleResendVerification(
      resendRequest({ email: "not-an-address" }),
      { service }
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(isApiFailure(body)).toBe(true);
    expect(selectApiFailureCode(body)).toBe("VERIFICATION_RESEND_INVALID");
    expect(selectApiFailureMessage(body, "ar").trim().length).toBeGreaterThan(0);
    expect(selectApiFailureMessage(body, "en").trim().length).toBeGreaterThan(0);
  });

  test("an unreadable body is a 400, not a crash", async () => {
    const { service } = createHarness();

    const res = await handleResendVerification(resendRequest("{ broken"), {
      service,
    });

    expect(res.status).toBe(400);
    expect(selectApiFailureCode(await res.json())).toBe(
      "VERIFICATION_RESEND_INVALID"
    );
  });

  test("a denied reissue answers 429 and tells the caller when to retry", async () => {
    const { service } = createHarness({ rollingRateLimit: true });
    await register(service);

    for (let attempt = 0; attempt < VERIFICATION_RESEND_RATE_LIMIT.limit; attempt += 1) {
      await handleResendVerification(
        resendRequest({ email: VALID_PAYLOAD.email }),
        { service }
      );
    }

    const res = await handleResendVerification(
      resendRequest({ email: VALID_PAYLOAD.email }),
      { service }
    );
    const body = await res.json();

    expect(res.status).toBe(429);
    expect(selectApiFailureCode(body)).toBe("VERIFICATION_RESEND_RATE_LIMITED");
    expect(body.retryAfterSeconds).toBeGreaterThan(0);
    expect(res.headers.get("Retry-After")).toBe(String(body.retryAfterSeconds));
  });
});
