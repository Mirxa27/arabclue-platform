import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { resolveFailureStatus } from "@/lib/api-failure";
import { QUOTA_FAILURE_CODES } from "@/lib/quotas";

/**
 * An exhausted allowance answers 402, whichever handler catches it.
 *
 * There are two ways a `QuotaExceededError` becomes a response, and they pick
 * the status differently:
 *
 *   - `toErrorResponse` (api-controller.ts:107-116) hardcodes 402.
 *   - `jsonApiFailure(quotaFailureCode(err))` resolves it from the code, which
 *     means the code must be registered in `EXPLICIT_FAILURE_STATUS` —
 *     `resolveFailureStatus`'s suffix rules match none of the quota codes, so
 *     an unregistered one silently falls through to 400.
 *
 * Three routes use the second form: `platform-agent/extension/ingest`,
 * `platform-agent/missions/[id]/attachments`, and
 * `platform-agent/missions/[id]/autopilot`. A 400 there reads as "your request
 * was malformed" — a client cannot tell it apart from a validation failure, so
 * it retries the same request instead of surfacing the upgrade prompt that a
 * 402 triggers.
 *
 * Driven off `QUOTA_FAILURE_CODES` rather than a hand-copied list, so a sixth
 * quota kind added to the map is covered without anyone remembering this file.
 */
describe("every quota failure code resolves to 402", () => {
  const entries = Object.entries(QUOTA_FAILURE_CODES);

  test("the map still has every quota kind in it", () => {
    // Without this, narrowing the map turns the loop below into zero
    // assertions, which looks exactly like the check passing.
    expect(entries.map(([kind]) => kind).sort()).toEqual([
      "DOCUMENTS",
      "INACTIVE",
      "PROPOSALS",
      "STORAGE",
      "TOKENS",
    ]);
  });

  for (const [kind, code] of entries) {
    test(`${kind} -> ${code} is payment-required, not a client fault`, () => {
      expect(resolveFailureStatus(code)).toBe(402);
    });
  }
});

/**
 * No route builds its own 402 body.
 *
 * `documents POST` and `agents/run` both used to catch `QuotaExceededError`
 * locally and answer `{ error: e.message, code: e.code }`. Both fields were
 * wrong in the same way: `message` is internal English prose, and `code` is the
 * *internal* enum (`"DOCUMENTS"`), not a registry key — so an Arabic bid writer
 * who filled their plan was told nothing in their own language, and a client
 * matching on the contract code matched nothing.
 *
 * Both fixes were deletions: `toErrorResponse` already answers 402 through
 * `quotaFailureCode`. A deletion is exactly the kind of fix a later edit
 * re-adds without noticing, and it would not fail any other test — the status
 * would still be 402, only the body would go back to being unreadable.
 *
 * So the ratchet is on the literal that only a hand-rolled body needs. Every
 * legitimate 402 in the tree comes from `resolveFailureStatus`, which is what
 * the tests above cover; none of them names the number.
 */
describe("payment-required bodies come from the failure contract", () => {
  const ROOT = process.cwd();

  function routeFiles(dir: string, found: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) routeFiles(full, found);
      else if (entry === "route.ts") found.push(full);
    }
    return found;
  }

  const routes = routeFiles(join(ROOT, "src/app/api"));

  test("the scan actually reaches the route tree", () => {
    // Anti-vacuous. A moved directory would make the assertion below pass
    // against an empty set, which reads identically to "nothing is wrong".
    expect(routes.length).toBeGreaterThan(100);
  });

  test("no route hardcodes a 402 status", () => {
    const offenders = routes
      .filter((file) => /status:\s*402/.test(readFileSync(file, "utf8")))
      .map((file) => relative(ROOT, file).split(sep).join("/"));
    expect(
      offenders,
      `these routes must let toErrorResponse/jsonApiFailure own the 402 body:\n${offenders
        .map((f) => `  ${f}`)
        .join("\n")}`,
    ).toEqual([]);
  });
});
