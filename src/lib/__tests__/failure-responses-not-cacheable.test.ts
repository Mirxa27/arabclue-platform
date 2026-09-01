/**
 * A failure answers one caller. It must not be stored and replayed to another.
 *
 * Production returns `cache-control: public, max-age=0, must-revalidate` on a
 * 401 from `/api/auth/precheck` — Next's default for a dynamic route, because
 * `jsonFailure` never set a header of its own. `must-revalidate` means nothing
 * is served stale today, so this is a shape problem rather than a live leak,
 * and that is exactly why it survived: the wrong directive on an auth refusal
 * looks fine until a CDN rule, a proxy, or a `s-maxage` somewhere upstream
 * decides `public` was an invitation.
 *
 * The bodies make the stakes concrete. `PROPOSAL_VERSION_CONFLICT` carries
 * `currentVersion`, `AGENT_RUN_IN_PROGRESS` carries a `runId`,
 * `ONBOARDING_INCOMPLETE` carries the caller's own missing steps. Replaying any
 * of those to a second caller is worse than a stale page: it is a confident
 * wrong answer about someone else's workspace.
 *
 * Four routes build failures by hand — `NextResponse.json({...apiFailure(code)},
 * ...)` — to attach those extra fields, which bypasses `jsonFailure` entirely.
 * `download` remembered the header on all twelve of its sites; the other three
 * files forgot it on all six of theirs. That is the drift a single owner plus a
 * scan is for, rather than trusting the next author to remember.
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import {
  ApiError,
  jsonApiFailure,
  jsonOk,
  jsonRateLimitFailure,
  toErrorResponse,
} from "../api-controller";

const ROOT = process.cwd();

function routeFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) routeFiles(full, found);
    else if (entry === "route.ts") found.push(full);
  }
  return found;
}

function repoPath(absolute: string): string {
  return relative(ROOT, absolute).split(sep).join("/");
}

/**
 * Each `NextResponse.json(...)` call, sliced at its matching close paren.
 *
 * Quotes are skipped rather than counted, so a `")"` inside a message or a
 * template literal cannot end the slice early — or, worse, extend it far enough
 * to swallow an unrelated `no-store` further down the file and hide a real
 * violation.
 */
function jsonResponseCalls(source: string): string[] {
  const MARKER = "NextResponse.json(";
  const calls: string[] = [];
  let from = 0;

  for (;;) {
    const start = source.indexOf(MARKER, from);
    if (start === -1) return calls;

    let depth = 1;
    let index = start + MARKER.length;
    let quote: string | null = null;

    while (index < source.length && depth > 0) {
      const char = source[index]!;
      if (quote) {
        if (char === "\\") index += 1;
        else if (char === quote) quote = null;
      } else if (char === '"' || char === "'" || char === "`") {
        quote = char;
      } else if (char === "(") {
        depth += 1;
      } else if (char === ")") {
        depth -= 1;
      }
      index += 1;
    }

    calls.push(source.slice(start, index));
    from = index;
  }
}

const handRolledFailures = new Map<string, number>();
for (const file of routeFiles(join(ROOT, "src/app/api"))) {
  const uncacheable = jsonResponseCalls(readFileSync(file, "utf8")).filter(
    (call) => call.includes("apiFailure(") && !call.includes("no-store"),
  );
  if (uncacheable.length > 0)
    handRolledFailures.set(repoPath(file), uncacheable.length);
}

describe("a failed API response is never cacheable", () => {
  test("a mapped failure answers no-store", () => {
    // The exact response observed as `public, max-age=0, must-revalidate` on
    // production.
    expect(jsonApiFailure("UNAUTHORIZED").headers.get("Cache-Control")).toBe(
      "no-store",
    );
  });

  test("a thrown error's mapped failure answers no-store", () => {
    // `toErrorResponse` is the catch arm of every `withTenant`/`withAdmin`
    // route, so it answers far more failures than any explicit call does.
    const response = toErrorResponse(
      new ApiError("Administrator role required", 403, "ADMIN_REQUIRED"),
      "test",
    );
    expect(response.status).toBe(403);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  test("a rate-limit denial still answers no-store", () => {
    // It set the header itself before `jsonFailure` did. Deleting the duplicate
    // must not delete the behaviour.
    const response = jsonRateLimitFailure(
      { status: 429, retryAfterSeconds: 42 },
      "LOGIN_RATE_LIMITED",
    );
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Retry-After")).toBe("42");
  });

  test("a success response is left alone", () => {
    // Anti-vacuous: blanket-tagging every response would pass all three tests
    // above while throwing away caching the app is entitled to.
    expect(jsonOk({ ok: true }).headers.get("Cache-Control")).toBeNull();
  });

  test("no route hand-rolls a cacheable failure", () => {
    const offenders = [...handRolledFailures.entries()].map(
      ([file, count]) => `  ${file}: ${count}`,
    );
    expect(
      offenders,
      `these NextResponse.json(apiFailure(...)) responses are missing Cache-Control: no-store:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  test("the scan actually reaches the hand-rolled responses", () => {
    // Anti-vacuous, and the reason the scanner skips quotes: a parser that
    // matched nothing — wrong cwd, changed call shape, a slice that ran past
    // its close paren — would report a clean tree either way.
    const withFailures = routeFiles(join(ROOT, "src/app/api")).filter((file) =>
      jsonResponseCalls(readFileSync(file, "utf8")).some((call) =>
        call.includes("apiFailure("),
      ),
    );
    expect(withFailures.length).toBeGreaterThanOrEqual(4);
  });
});
