/**
 * A 202 that takes longer for a real address tells you the address is real.
 *
 * `requestRecovery` answers every caller with the same 202 body, and four
 * separate comments in the service say that is deliberate. The body is not the
 * only channel. An unknown address costs one indexed lookup and returns. A
 * known one costs that lookup *plus* a token-write transaction, *plus* an
 * awaited SMTP round trip bounded only by `RECOVERY_EMAIL_DEADLINE_MS` — thirty
 * seconds — *plus* an audit write.
 *
 * Measured against production before this fix, unknown addresses answered in
 * 0.44-0.51s warm. One request and a stopwatch is the whole attack: no body to
 * parse, no error code to read, and the response built to reveal nothing
 * reveals it anyway.
 *
 * OWASP's Forgot Password Cheat Sheet asks for this and names the remedy:
 * "Ensure that responses return in a consistent amount of time to prevent an
 * attacker enumerating which accounts exist [...] This can be achieved via
 * asynchronous calls or by following the same logic path rather than a
 * quick-exit method."
 * https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html
 *
 * Asynchronous is the option this repo already owns. `schedule-pipeline.ts`
 * hands post-response work to `after()` from `next/server`, which forwards it
 * to the platform's `waitUntil`. Put the token, the send and the audit behind
 * that and both branches cost exactly one lookup.
 *
 * These tests never measure elapsed time. A stopwatch assertion on a shared
 * runner is a flake generator, and worse, it would go green for a fix that
 * merely made the slow path quicker rather than making the two paths the same.
 * What is asserted instead is the property that actually closes the channel:
 * nothing observable happens before the response, and everything that
 * distinguishes a known address from an unknown one happens after it.
 */

import { describe, expect, test } from "bun:test";
import {
  createRecoveryService,
  type AfterResponseDispatcher,
  type RecoveryService,
} from "../recovery-service";
import {
  DeterministicClock,
  DeterministicRandomSource,
  createFakeRecoveryEmailProvider,
  createFakeRecoveryRepository,
  type FakeRecoveryEmailBehavior,
  type FakeRecoveryEmailProvider,
  type FakeRecoveryRepository,
  type RecordingRecoveryAuditSink,
  createRecordingRecoveryAuditSink,
} from "./support";

const BASE_URL = "https://app.arabclue.test";
const SOURCE = "203.0.113.10";

/**
 * Holds deferred work instead of running it, which is the only way to observe
 * the seam: with a dispatcher that runs inline, a deferred implementation and
 * the original one are indistinguishable from outside.
 */
function heldWork(): Readonly<{
  dispatch: AfterResponseDispatcher;
  pending: ReadonlyArray<() => Promise<void>>;
  drain(): Promise<void>;
}> {
  const pending: Array<() => Promise<void>> = [];
  return Object.freeze({
    pending,
    dispatch: async (work: () => Promise<void>) => {
      pending.push(work);
    },
    drain: async () => {
      // Splice rather than iterate: draining must not re-run work if a test
      // drains twice, and a job that queues another job still gets run.
      while (pending.length > 0) await pending.shift()!();
    },
  });
}

type Harness = Readonly<{
  service: RecoveryService;
  repository: FakeRecoveryRepository;
  email: FakeRecoveryEmailProvider;
  audit: RecordingRecoveryAuditSink;
  held: ReturnType<typeof heldWork>;
}>;

function createHarness(
  options: Readonly<{
    emailBehavior?: FakeRecoveryEmailBehavior;
    /** Omit the dispatcher entirely to exercise the production default. */
    hold?: boolean;
  }> = {}
): Harness {
  const repository = createFakeRecoveryRepository();
  const email = createFakeRecoveryEmailProvider(options.emailBehavior);
  const audit = createRecordingRecoveryAuditSink();
  const held = heldWork();
  const service = createRecoveryService({
    repository,
    email,
    audit,
    clock: new DeterministicClock("2026-03-01T09:00:00.000Z"),
    randomness: new DeterministicRandomSource(0x51ee2),
    passwordHasher: Object.freeze({
      hash: async (password: string) => `hash:${password}`,
    }),
    baseUrl: BASE_URL,
    ...(options.hold === false ? {} : { afterResponse: held.dispatch }),
  });
  return { service, repository, email, audit, held };
}

/** Everything a stopwatch can price: work done before the caller is answered. */
function observableCost(
  harness: Harness
): Readonly<{ tokens: number; messages: number; auditEntries: number }> {
  return {
    tokens: harness.repository.snapshot().tokens.length,
    messages: harness.email.messages.length,
    auditEntries: harness.audit.entries.length,
  };
}

describe("a recovery request costs the same whether the address exists", () => {
  test("the response lands before the token, the email, and the audit entry", async () => {
    const harness = createHarness();
    harness.repository.seedUser({ email: "known@example.com" });

    const result = await harness.service.requestRecovery({
      payload: { email: "known@example.com" },
      sourceAddress: SOURCE,
    });

    expect(result.status).toBe(202);
    expect(result.code).toBe("RECOVERY_REQUEST_ACCEPTED");
    // The three writes that made a real address slower than a fake one.
    expect(observableCost(harness)).toEqual({
      tokens: 0,
      messages: 0,
      auditEntries: 0,
    });

    await harness.held.drain();

    // Anti-vacuous, and the point of the feature: deferred is not dropped.
    expect(observableCost(harness)).toEqual({
      tokens: 1,
      messages: 1,
      auditEntries: 1,
    });
  });

  test("a known and an unknown address are indistinguishable at response time", async () => {
    const known = createHarness();
    known.repository.seedUser({ email: "real@example.com" });
    const unknown = createHarness();

    await known.service.requestRecovery({
      payload: { email: "real@example.com" },
      sourceAddress: SOURCE,
    });
    await unknown.service.requestRecovery({
      payload: { email: "absent@example.com" },
      sourceAddress: SOURCE,
    });

    expect(observableCost(known)).toEqual(observableCost(unknown));

    // Anti-vacuous the other way. Two services that both did nothing at all
    // would satisfy the line above; only the drain proves the equality came
    // from moving the work rather than from deleting it.
    await Promise.all([known.held.drain(), unknown.held.drain()]);
    expect(observableCost(known)).not.toEqual(observableCost(unknown));
    expect(unknown.email.messages).toHaveLength(0);
  });

  test("the unconfigured-email branch defers its audit write too", async () => {
    // Smaller and easier to miss: with no transport configured the service
    // still writes one audit row for a known address and none for an unknown
    // one, so the branch built to hide a switched-off transport leaks the same
    // bit the branch below it does.
    const known = createHarness({ emailBehavior: { kind: "unconfigured" } });
    known.repository.seedUser({ email: "real@example.com" });
    const unknown = createHarness({ emailBehavior: { kind: "unconfigured" } });

    const knownResult = await known.service.requestRecovery({
      payload: { email: "real@example.com" },
      sourceAddress: SOURCE,
    });
    await unknown.service.requestRecovery({
      payload: { email: "absent@example.com" },
      sourceAddress: SOURCE,
    });

    expect(knownResult.code).toBe("RECOVERY_EMAIL_UNCONFIGURED");
    expect(observableCost(known)).toEqual(observableCost(unknown));

    await known.held.drain();
    expect(known.audit.entries).toHaveLength(1);
    expect(known.audit.entries[0]!.details.reason).toBe("email_unconfigured");
  });

  test("the work still runs when nothing is injected", async () => {
    // The guard against the cheapest possible false fix. Deleting the send
    // would turn every assertion above green and every password reset dead, and
    // this is the only test here that exercises the default dispatcher — the
    // one production actually gets.
    const harness = createHarness({ hold: false });
    harness.repository.seedUser({ email: "default@example.com" });

    await harness.service.requestRecovery({
      payload: { email: "default@example.com" },
      sourceAddress: SOURCE,
    });

    expect(harness.email.messages).toHaveLength(1);
    expect(harness.repository.snapshot().tokens).toHaveLength(1);
    expect(harness.held.pending).toHaveLength(0);
  });
});
