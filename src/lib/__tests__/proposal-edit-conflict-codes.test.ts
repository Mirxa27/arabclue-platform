/**
 * A locked or stale proposal must say so, not "an internal error".
 *
 * The proposal write routes rejected with three hand-rolled lowercase codes:
 * `status_locked`, `proposal_concurrent_update` and `proposal_revision_conflict`.
 * None is registered, and an unregistered code takes `legacyFailureBody`'s fallback branch
 * (api-failure.ts:487-492), which substitutes the generic INTERNAL_ERROR pair.
 * So the bidder was told the server broke, in both languages, when in fact
 * their proposal was locked for editing or had moved on underneath them —
 * two states with a clear next action they were never shown.
 *
 * The registered `STATUS_LOCKED` and `PROPOSAL_VERSION_CONFLICT` say the real
 * thing. These assertions are what stops the lowercase pair coming back.
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  apiFailure,
  legacyFailureBody,
  resolveFailureStatus,
} from "@/lib/api-failure";

const LEGACY_CODES = [
  "status_locked",
  "proposal_concurrent_update",
  "proposal_revision_conflict",
] as const;

function sources(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sources(full, found);
    else if (entry.endsWith(".ts")) found.push(full);
  }
  return found;
}

const proposalRoutes = sources(
  join(process.cwd(), "src/app/api/proposals"),
).map((file) => [file, readFileSync(file, "utf8")] as const);

describe("proposal edit conflicts report their real cause", () => {
  test("the registered codes carry their own wording", () => {
    const generic = apiFailure("INTERNAL_ERROR").message;
    for (const code of [
      "STATUS_LOCKED",
      "PROPOSAL_VERSION_CONFLICT",
    ] as const) {
      const message = apiFailure(code).message;
      expect(message.ar.trim().length, `${code} has no Arabic`).toBeGreaterThan(
        0,
      );
      expect(
        message.en.trim().length,
        `${code} has no English`,
      ).toBeGreaterThan(0);
      // The whole point: distinguishable from the generic fallback.
      expect(message.en, `${code} fell back to the generic message`).not.toBe(
        generic.en,
      );
      expect(message.ar, `${code} fell back to the generic message`).not.toBe(
        generic.ar,
      );
    }
  });

  test("both resolve to 409 without being told", () => {
    // Every call site passes 409 by hand today. `PROPOSAL_VERSION_CONFLICT`
    // gets there on the `_CONFLICT` suffix; `STATUS_LOCKED` matches no suffix
    // rule, so left alone it would answer 400 — "your request was malformed"
    // for a request that was perfectly well formed.
    expect(resolveFailureStatus("STATUS_LOCKED")).toBe(409);
    expect(resolveFailureStatus("PROPOSAL_VERSION_CONFLICT")).toBe(409);
  });

  test("the lowercase codes are still indistinguishable from a crash", () => {
    // Anti-vacuous, and the reason the replacement was needed: this documents
    // the behaviour that made the old codes unusable. If registering them
    // later makes this fail, delete the test — do not re-add the codes.
    const generic = apiFailure("INTERNAL_ERROR").message;
    for (const code of LEGACY_CODES) {
      expect(legacyFailureBody(code).message.en).toBe(generic.en);
    }
  });

  test("no proposal route emits the lowercase codes any more", () => {
    const offenders = proposalRoutes
      .filter(([, source]) =>
        LEGACY_CODES.some((c) => source.includes(`"${c}"`)),
      )
      .map(([file]) => file.slice(process.cwd().length + 1));
    expect(
      offenders,
      `use STATUS_LOCKED / PROPOSAL_VERSION_CONFLICT instead:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  test("the scan actually reached the proposal routes", () => {
    // Without this, a moved directory would empty the list above and the
    // assertion would pass by finding nothing to check.
    expect(proposalRoutes.length).toBeGreaterThan(10);
    expect(
      proposalRoutes.some(([, s]) => s.includes("STATUS_LOCKED")),
      "no route uses the replacement code",
    ).toBe(true);
    expect(
      proposalRoutes.some(([, s]) => s.includes("PROPOSAL_VERSION_CONFLICT")),
      "no route uses the replacement code",
    ).toBe(true);
  });
});
