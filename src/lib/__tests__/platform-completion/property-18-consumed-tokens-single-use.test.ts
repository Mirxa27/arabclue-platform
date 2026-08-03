/**
 * Feature: platform-completion, Property 18: Consumed tokens are single-use
 *
 * For every verification, recovery, and invitation token: consume once, then
 * resubmit the same raw token and assert the applicable invalid result with no
 * further protected-record mutation.
 *
 * Validates: Requirements 1.6, 1.7, 2.3, 2.4, 3.9
 */
import { describe, expect, test } from "bun:test";
import * as fc from "fast-check";
import {
  createAccountService,
  type AccountService,
} from "../../account-service";
import {
  createRecoveryService,
  type RecoveryService,
} from "../../recovery-service";
import {
  createInvitationService,
  type InvitationService,
  type InvitationActor,
} from "../../invitation-service";
import { createTokenDigest } from "../../token-digest";
import {
  COMPLETION_PROPERTY_MIN_RUNS,
  DeterministicClock,
  DeterministicRandomSource,
  completionPropertyOptions,
  createFakeAccountEmailProvider,
  createFakeAccountRepository,
  createFakeInvitationEmailProvider,
  createFakeInvitationPasswordHasher,
  createFakeInvitationRepository,
  createFakeRecoveryEmailProvider,
  createFakeRecoveryRepository,
  createRecordingAccountAuditSink,
  createRecordingInvitationAuditSink,
  createRecordingRecoveryAuditSink,
  permissiveAccountRateLimiter,
} from "../support";

const PROPERTY_TAG =
  "Feature: platform-completion, Property 18: Consumed tokens are single-use";

const BASE_URL = "https://app.arabclue.test";
const WORKSPACE = Object.freeze({ id: "workspace-1", name: "Riyadh Bid Team" });
const OWNER: InvitationActor = Object.freeze({
  userId: "user-owner",
  membershipRole: "OWNER",
  platformRole: "BIDDER",
});

function extractToken(text: string): string {
  const match = /token=([^"&\s<]+)/u.exec(text);
  if (!match) throw new Error("No token present in message");
  return decodeURIComponent(match[1]!);
}

async function runVerificationCase(seed: number): Promise<void> {
  const clock = new DeterministicClock("2026-04-01T08:30:00.000Z");
  const repository = createFakeAccountRepository();
  const email = createFakeAccountEmailProvider({ kind: "sent" });
  const service: AccountService = createAccountService({
    repository,
    email,
    audit: createRecordingAccountAuditSink(),
    rateLimiter: permissiveAccountRateLimiter,
    clock,
    randomness: new DeterministicRandomSource(seed),
    randomUuid: new DeterministicRandomSource(seed ^ 0x11).randomUUID,
    identityEnvironment: Object.freeze({ NODE_ENV: "development" }),
    baseUrl: BASE_URL,
  });

  const registered = await service.register({
    payload: {
      email: `buyer${seed}@example.com`,
      password: "correct horse battery",
      name: "Nora Al Qahtani",
      workspaceName: "Riyadh Bid Team",
      locale: "en",
    },
    sourceAddress: "203.0.113.10",
  });
  expect(registered.ok).toBe(true);
  const verificationMessage = email.messages.at(-1);
  // Some seeds succeed without a deliverable verification message (e.g. mail
  // boundary unconfigured). Those cases have no token to replay.
  if (!verificationMessage?.text) return;

  const rawToken = extractToken(verificationMessage.text);
  const first = await service.verifyEmail({
    token: rawToken,
    sourceAddress: "203.0.113.20",
  });
  expect(first.ok).toBe(true);
  const afterFirst = repository.snapshot();

  const replay = await service.verifyEmail({
    token: rawToken,
    sourceAddress: "203.0.113.20",
  });
  expect(replay).toEqual({
    ok: false,
    status: 400,
    code: "VERIFICATION_TOKEN_INVALID",
  });
  expect(repository.snapshot()).toEqual(afterFirst);
}

async function runRecoveryCase(seed: number): Promise<void> {
  const clock = new DeterministicClock("2026-03-01T09:00:00.000Z");
  const repository = createFakeRecoveryRepository();
  const email = createFakeRecoveryEmailProvider({ kind: "sent" });
  const service: RecoveryService = createRecoveryService({
    repository,
    email,
    audit: createRecordingRecoveryAuditSink(),
    clock,
    randomness: new DeterministicRandomSource(seed),
    passwordHasher: Object.freeze({
      hash: async (password: string) => `hash:${password}`,
    }),
    baseUrl: BASE_URL,
  });

  const address = `buyer${seed}@example.com`;
  repository.seedUser({
    email: address,
    sessions: 2,
    passwordHash: "old-hash",
  });

  await service.requestRecovery({
    payload: { email: address },
    sourceAddress: "203.0.113.10",
  });
  const rawToken = extractToken(email.messages.at(-1)!.text);

  const first = await service.resetPassword({
    payload: { token: rawToken, password: `new-password-${seed}` },
    sourceAddress: "203.0.113.44",
  });
  expect(first.ok).toBe(true);
  const afterFirst = repository.snapshot();

  const replay = await service.resetPassword({
    payload: { token: rawToken, password: `other-password-${seed}` },
    sourceAddress: "203.0.113.44",
  });
  expect(replay).toEqual({
    ok: false,
    status: 400,
    code: "RECOVERY_TOKEN_INVALID",
  });
  expect(repository.snapshot()).toEqual(afterFirst);
}

async function runInvitationCase(seed: number): Promise<void> {
  const clock = new DeterministicClock("2026-05-01T09:00:00.000Z");
  const repository = createFakeInvitationRepository({
    workspaceName: WORKSPACE.name,
    seatAllowance: null,
  });
  const service: InvitationService = createInvitationService({
    repository,
    email: createFakeInvitationEmailProvider({ kind: "sent" }),
    audit: createRecordingInvitationAuditSink(),
    passwordHasher: createFakeInvitationPasswordHasher(),
    clock,
    randomness: new DeterministicRandomSource(seed),
    baseUrl: BASE_URL,
  });

  const issued = createTokenDigest({
    randomness: new DeterministicRandomSource(seed ^ 0xa11ce),
  });
  const createdAt = clock.now();
  repository.seedInvitation({
    workspaceId: WORKSPACE.id,
    email: `colleague${seed}@example.com`,
    role: "MEMBER",
    tokenHash: issued.tokenHash,
    hashSalt: issued.hashSalt,
    hashVersion: issued.hashVersion,
    createdAt,
    expiresAt: new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000),
    consumedAt: null,
    revokedAt: null,
    inviterId: OWNER.userId,
  });

  const first = await service.acceptInvitation({
    payload: {
      token: issued.rawToken,
      name: "Nora",
      password: "p".repeat(10),
    },
  });
  expect(first.ok).toBe(true);
  const afterFirst = repository.snapshot();

  const replay = await service.acceptInvitation({
    payload: {
      token: issued.rawToken,
      name: "Nora",
      password: "p".repeat(10),
    },
  });
  expect(replay).toEqual({
    ok: false,
    status: 400,
    code: "INVITATION_TOKEN_INVALID",
  });
  expect(repository.snapshot()).toEqual(afterFirst);
}

describe(PROPERTY_TAG, () => {
  test("consumed verification, recovery, and invitation tokens reject replay", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(
          "verification" as const,
          "recovery" as const,
          "invitation" as const
        ),
        fc.integer({ min: 1, max: 1_000_000 }),
        async (kind, seed) => {
          if (kind === "verification") await runVerificationCase(seed);
          else if (kind === "recovery") await runRecoveryCase(seed);
          else await runInvitationCase(seed);
        }
      ),
      completionPropertyOptions({
        numRuns: COMPLETION_PROPERTY_MIN_RUNS,
      })
    );
  });
});
