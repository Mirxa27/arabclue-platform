/**
 * A bare-English `error: "..."` literal in a route is a silent Arabic bug.
 *
 * `selectApiFailureMessage` accepts a plain-string `error` and returns it
 * verbatim (api-failure-message.ts:76-78), so a non-empty English string looks
 * like a real answer and no locale fallback ever fires. An Arabic-first bidder
 * reads the English sentence. Nothing logs, nothing throws, nothing is red.
 *
 * `agent-run-bilingual-failure.test.ts` proved this one route at a time. That
 * does not scale to the 38 routes still carrying literals, and worse, it leaves
 * every *converted* route free to grow a new one tomorrow.
 *
 * So this is a ratchet, not a pass/fail sweep:
 *
 *   - A route outside `REMAINING` may carry no literal at all. Converted stays
 *     converted; a new violation anywhere else fails immediately.
 *   - A route inside `REMAINING` that has been cleaned must be deleted from the
 *     list. The list can only shrink, and the diff that shrinks it is the diff
 *     that did the work.
 *
 * `REMAINING` is therefore an honest debt register, not an exemption. It is
 * expected to reach `[]`; until it does, its length is the exact size of the
 * gap between this codebase and a bilingual failure contract.
 *
 * Not every literal here is prose. Some are machine codes a client compares
 * against — `EMAIL_VERIFICATION_REQUIRED`, `payment_cancelled_or_failed`. Those
 * cannot be translated in place: the fix is to move the token to `code` and let
 * the bilingual pair own `error`, which means changing the client in the same
 * diff. They stay on the list because they are still unread by an Arabic user.
 *
 * `auth/precheck`'s `invalid_credentials` looked like one of those and was not.
 * Nothing read it — the login page branched on `rate_limit_service_unavailable`,
 * a different token — so it was untranslated prose wearing a machine code's
 * clothes, and `INVALID_CREDENTIALS` replaced it with no client contract to
 * keep. Check for an actual reader before assuming a token has one.
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/** Routes still returning at least one untranslated `error:` string literal. */
const REMAINING: readonly string[] = [
  "src/app/api/admin/ai-providers/[id]/route.ts",
  "src/app/api/admin/ai-providers/models/route.ts",
  "src/app/api/admin/ai-providers/route.ts",
  "src/app/api/admin/billing/reconcile/route.ts",
  "src/app/api/admin/env/[key]/route.ts",
  "src/app/api/admin/env/route.ts",
  "src/app/api/admin/users/[id]/route.ts",
  "src/app/api/ai/compliance-analyze/route.ts",
  "src/app/api/ai/contract-draft/route.ts",
  "src/app/api/ai/proposal-optimize/route.ts",
  "src/app/api/ai/vendor-match/route.ts",
  "src/app/api/billing/callback/route.ts",
  "src/app/api/brand/logo/route.ts",
  "src/app/api/brand/route.ts",
  "src/app/api/business-profile/export/route.ts",
  "src/app/api/business-profile/route.ts",
  "src/app/api/collaboration/presence/route.ts",
  "src/app/api/contracts/instances/[id]/versions/[revision]/route.ts",
  "src/app/api/contracts/templates/[key]/preview/route.ts",
  "src/app/api/contracts/templates/route.ts",
  "src/app/api/files/route.ts",
  "src/app/api/projects/[id]/route.ts",
  "src/proxy.ts",
];

const ROOT = process.cwd();

function routeFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) routeFiles(full, found);
    else if (entry === "route.ts") found.push(full);
  }
  return found;
}

/** Repo-relative path with forward slashes, so the list reads the same on any OS. */
function repoPath(absolute: string): string {
  return relative(ROOT, absolute).split(sep).join("/");
}

/**
 * The same literal shape `agent-run-bilingual-failure.test.ts` asserts against.
 *
 * `\s*` rather than a single space: Prettier wraps a long literal onto its own
 * line, so `error:\n  "..."` is the *most* likely form for exactly the sentences
 * worth translating. Matching only `error: "` made the longest messages in the
 * tree invisible to the ratchet.
 *
 * The `{`/`,`/line-start prefix keeps it to object properties. Without it,
 * `console.error("[x] notification error:", err)` matches — the `error:` ends a
 * string, and the capture then runs from the comma to whatever quote comes
 * next, reporting a violation in a route that has none.
 */
function bareErrorLiterals(source: string): string[] {
  return [...source.matchAll(/(?:^\s*|[{,]\s*)error:\s*"([^"]+)"/gm)].map(
    (match) => match[1]!,
  );
}

/**
 * Every file that can answer a caller with a failure body.
 *
 * `src/proxy.ts` is not a route and was therefore invisible to this scan, but
 * it refuses before any route runs — so its two English literals reach more
 * callers than most of the routes listed above. A scan scoped to a directory
 * measures the directory, not the surface.
 */
function failureSources(): string[] {
  return [...routeFiles(join(ROOT, "src/app/api")), join(ROOT, "src/proxy.ts")];
}

const violations = new Map<string, string[]>();
for (const file of failureSources()) {
  const literals = bareErrorLiterals(readFileSync(file, "utf8"));
  if (literals.length > 0) violations.set(repoPath(file), literals);
}

describe("api routes fail bilingually", () => {
  test("the scan actually reaches the route tree", () => {
    // Anti-vacuous. A broken cwd or a moved directory would make every
    // assertion below pass against an empty set.
    const total = routeFiles(join(ROOT, "src/app/api")).length;
    expect(total).toBeGreaterThan(100);
  });

  test("no route outside the debt register carries an English error literal", () => {
    const known = new Set(REMAINING);
    const regressions = [...violations.keys()].filter((f) => !known.has(f));
    expect(
      regressions,
      `these routes must use mappedApiFailure/jsonApiFailure instead of a bare English string:\n${regressions
        .map((f) => `  ${f}: ${violations.get(f)!.join(", ")}`)
        .join("\n")}`,
    ).toEqual([]);
  });

  test("the debt register lists nothing that is already clean", () => {
    const stale = REMAINING.filter((f) => !violations.has(f));
    expect(
      stale,
      `converted — delete these lines from REMAINING:\n${stale
        .map((f) => `  ${f}`)
        .join("\n")}`,
    ).toEqual([]);
  });

  test("the register is sorted and free of duplicates", () => {
    // Keeps the shrinking diff readable and stops the same path being removed
    // twice while a second copy silently keeps the debt alive.
    expect(REMAINING).toEqual([...new Set(REMAINING)].sort());
  });
});
