/**
 * One origin could mail-bomb every account on the platform.
 *
 * `forgot-password` limited on `recovery:req:${email}` alone — 5 per hour per
 * address. The limit is real, but the key is the wrong axis: an attacker does
 * not need six resets for one mailbox, they need one reset for six thousand
 * mailboxes. Fanning out across distinct addresses meant every bucket stayed at
 * 1/5 and nothing ever tripped, so the ceiling was however fast the loop ran.
 *
 * Every *existing* address in that loop receives a real recovery email. So the
 * damage is not an enumeration side channel, it is outbound: real inboxes, a
 * sending domain's reputation, and a support queue full of customers who did not
 * ask for a password reset.
 *
 * The route already computed `getClientIp(req)` and handed it to the service as
 * `sourceAddress` for the audit trail. It was one argument away from being a
 * limit key and nobody had connected the two.
 *
 * OWASP API2:2023 is the guidance that names the missing axis: credential
 * recovery is a login endpoint, and its limits belong "by API method (e.g.
 * authentication), by client (e.g. IP address), and by property (e.g.
 * username)". This route had only the third.
 * https://owasp.org/API-Security/editions/2023/en/0xa2-broken-authentication/
 *
 * Both denials answer the same `RECOVERY_RATE_LIMITED`, which the last test
 * pins. An attacker who could tell "your IP is capped" from "that mailbox is
 * capped" would have been handed the enumeration oracle the 202 body exists to
 * deny.
 */

import { describe, expect, test } from "bun:test";
import { NextRequest } from "next/server";
import { handleForgotPassword } from "../../app/api/auth/forgot-password/route";
import {
  RECOVERY_REQUEST_RATE_LIMIT,
  RECOVERY_SOURCE_RATE_LIMIT,
  type RecoveryService,
} from "../recovery-service";

/**
 * `rateLimitAsync` counts in a process-level Map shared by the whole suite, so
 * every key a test touches has to be unique to that test. A fixed IP would make
 * these cases contaminate each other and pass or fail by file order.
 */
let nonce = 0;
function uniqueSuffix(): string {
  nonce += 1;
  return `${nonce}-${process.pid}`;
}

/** Counts what actually reached the service, which is what "refused" means. */
function countingService(): RecoveryService & { readonly calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async requestRecovery(command) {
      const payload = command.payload as { email?: unknown };
      calls.push(typeof payload?.email === "string" ? payload.email : "?");
      return { ok: true, status: 202, code: "RECOVERY_REQUEST_ACCEPTED" };
    },
    async resetPassword() {
      throw new Error("not exercised by these tests");
    },
  };
}

function request(email: string, sourceAddress: string): NextRequest {
  return new NextRequest("http://localhost/api/auth/forgot-password", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": sourceAddress,
    },
    body: JSON.stringify({ email }),
  });
}

async function post(
  email: string,
  sourceAddress: string,
  service: RecoveryService,
): Promise<{ status: number; code: unknown }> {
  const response = await handleForgotPassword(request(email, sourceAddress), {
    service,
  });
  const body = (await response.json()) as { code?: unknown };
  return { status: response.status, code: body.code };
}

describe("forgot-password limits the source, not just the target", () => {
  test("one origin cannot fan out across unlimited addresses", async () => {
    const suffix = uniqueSuffix();
    const source = `203.0.113.${(nonce % 250) + 1}-fanout-${suffix}`;
    const service = countingService();

    // Each address is distinct, so the per-email bucket sits at 1 of 5 for all
    // of them and can never be the limit that trips. Only the source axis can.
    const accepted: number[] = [];
    for (let i = 0; i < RECOVERY_SOURCE_RATE_LIMIT.limit; i += 1) {
      const { status } = await post(
        `victim-${i}-${suffix}@example.com`,
        source,
        service,
      );
      accepted.push(status);
    }
    expect(new Set(accepted)).toEqual(new Set([202]));

    const overflow = await post(
      `victim-overflow-${suffix}@example.com`,
      source,
      service,
    );
    expect(overflow.status).toBe(429);
    expect(overflow.code).toBe("RECOVERY_RATE_LIMITED");

    // The point of the limit: no email was sent for the refused request.
    expect(service.calls).toHaveLength(RECOVERY_SOURCE_RATE_LIMIT.limit);
  });

  test("a refused source does not refuse everyone else", async () => {
    // Anti-vacuous. A limiter keyed on a constant — or on nothing, denying
    // outright past a global counter — passes the test above and takes password
    // recovery down for the whole platform. OWASP Top 10:2025 A07 asks for the
    // limit "while avoiding a denial-of-service scenario"; this is that clause.
    const suffix = uniqueSuffix();
    const exhausted = `198.51.100.7-exhausted-${suffix}`;
    const service = countingService();

    for (let i = 0; i <= RECOVERY_SOURCE_RATE_LIMIT.limit; i += 1) {
      await post(`flood-${i}-${suffix}@example.com`, exhausted, service);
    }
    const alsoRefused = await post(
      `flood-again-${suffix}@example.com`,
      exhausted,
      service,
    );
    expect(alsoRefused.status).toBe(429);

    const bystander = await post(
      `bystander-${suffix}@example.com`,
      `198.51.100.8-bystander-${suffix}`,
      service,
    );
    expect(bystander.status).toBe(202);
    expect(bystander.code).toBe("RECOVERY_REQUEST_ACCEPTED");
  });

  test("the per-address limit still holds on its own", async () => {
    // Anti-vacuous the other way: deleting the original per-email limit would
    // leave both tests above green while restoring the single-inbox flood.
    const suffix = uniqueSuffix();
    const target = `single-target-${suffix}@example.com`;
    const service = countingService();

    // A distinct source each time, so the source bucket stays at 1 and only the
    // per-address axis can be what refuses.
    for (let i = 0; i < RECOVERY_REQUEST_RATE_LIMIT.limit; i += 1) {
      const { status } = await post(
        target,
        `192.0.2.${i + 1}-spread-${suffix}`,
        service,
      );
      expect(status).toBe(202);
    }

    const overflow = await post(
      target,
      `192.0.2.99-spread-${suffix}`,
      service,
    );
    expect(overflow.status).toBe(429);
    expect(service.calls).toHaveLength(RECOVERY_REQUEST_RATE_LIMIT.limit);
  });

  test("both refusals are indistinguishable to the caller", async () => {
    // The 202 body is uniform for known and unknown addresses on purpose. A 429
    // that said which axis tripped would undo that: "your IP is capped" reveals
    // nothing, but "that mailbox is capped" confirms the mailbox exists in the
    // one flow built to never confirm it.
    const suffix = uniqueSuffix();
    const service = countingService();

    const sourceCapped = `sourcecap-${suffix}`;
    for (let i = 0; i < RECOVERY_SOURCE_RATE_LIMIT.limit; i += 1) {
      await post(`sc-${i}-${suffix}@example.com`, sourceCapped, service);
    }
    const bySource = await handleForgotPassword(
      request(`sc-final-${suffix}@example.com`, sourceCapped),
      { service },
    );

    const addressCapped = `addrcap-${suffix}@example.com`;
    for (let i = 0; i < RECOVERY_REQUEST_RATE_LIMIT.limit; i += 1) {
      await post(addressCapped, `addrcap-${i}-${suffix}`, service);
    }
    const byAddress = await handleForgotPassword(
      request(addressCapped, `addrcap-final-${suffix}`),
      { service },
    );

    expect(bySource.status).toBe(byAddress.status);
    const [sourceBody, addressBody] = await Promise.all([
      bySource.json(),
      byAddress.json(),
    ]);
    expect(sourceBody).toEqual(addressBody);

    // Retry-After proves the denial went through the shared failure owner
    // rather than a hand-rolled response that forgot the countdown.
    expect(bySource.headers.get("Retry-After")).toBeTruthy();
    expect(bySource.headers.get("Cache-Control")).toBe("no-store");
  });
});
