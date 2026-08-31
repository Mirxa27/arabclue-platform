/**
 * Every API route that can reach a paid provider call must go through
 * `checkAiRateLimit`.
 *
 * Plan quotas are not a substitute. A quota stops a workspace at month end; a
 * rate limit stops a runaway client — or a leaked session cookie — inside a
 * minute. That is the difference between a surprising invoice and a ruinous
 * one, and only one of the two is the caller's fault.
 *
 * Candidates are found by walking imports rather than by listing route paths,
 * because a route rarely calls the model itself: `missions/[id]/attachments`
 * reaches it two hops away via `stage-attachment` → `classify-attachment`. A
 * list of routes that *need* the limiter would have to be updated by the same
 * person who forgot it, so it would never catch the case it exists for.
 *
 * The walk is module-level, so it over-approximates: importing one function
 * from a module makes every call in that module look reachable. The exceptions
 * below carry the evidence for each over-approximation. Keeping only the
 * exceptions by hand is the point — they are rare and each needs a reason,
 * whereas a new AI route is common and must fail by default.
 */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");
const SRC = join(REPO_ROOT, "src");
const API_DIR = join(SRC, "app", "api");

/** Calls that spend provider credit. Matched as calls, not as bare names. */
const LLM_ENTRYPOINT =
  /\b(generateCompletion|embedText|streamText|generateText|generateObject)\s*\(/;

/**
 * Routes whose only path to a spending module is through a deterministic
 * export. Each entry names the function that is actually imported and why it
 * cannot reach the provider, so a reviewer can re-check it in one step.
 */
const NO_REACHABLE_SPEND: Readonly<Record<string, string>> = {
  // These four reach `agents/law-contract` only through `contract-review.ts`,
  // which imports the synchronous `validateContractDraft` (law-contract.ts:387).
  // The provider call lives in `draftLawContract` (law-contract.ts:333), which
  // contract-review neither imports nor re-exports.
  "src/app/api/proposals/[id]/download/route.ts": "contract-review → validateContractDraft (sync)",
  "src/app/api/proposals/[id]/submit/route.ts": "contract-review → validateContractDraft (sync)",
  "src/app/api/proposals/[id]/validate/route.ts": "contract-review → validateContractDraft (sync)",
  "src/app/api/reviews/[id]/route.ts": "contract-review → validateContractDraft (sync)",
};

/**
 * Comments are stripped first: `provider-unavailable.ts` documents what it
 * guards by naming `generateCompletion` in prose, and counting that would
 * demand a limiter on every route that merely handles the provider-down case.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

function importSpecifiers(source: string): string[] {
  return [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
}

/** Resolve a repo-internal specifier to a file on disk, or null if external. */
function resolveModule(specifier: string, importerFile: string): string | null {
  const base = specifier.startsWith("@/")
    ? join(SRC, specifier.slice(2))
    : specifier.startsWith(".")
      ? resolve(dirname(importerFile), specifier)
      : null;
  if (!base) return null;
  for (const candidate of [
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

const knownToSpend = new Map<string, boolean>();

function reachesProvider(file: string, seen: Set<string> = new Set()): boolean {
  const cached = knownToSpend.get(file);
  if (cached !== undefined) return cached;
  if (seen.has(file)) return false; // cycle: this path adds nothing
  seen.add(file);

  const source = stripComments(readFileSync(file, "utf8"));
  const hit =
    LLM_ENTRYPOINT.test(source) ||
    importSpecifiers(source).some((spec) => {
      const target = resolveModule(spec, file);
      return target ? reachesProvider(target, seen) : false;
    });

  // Only a positive is memoized: a negative may be an artifact of cutting a
  // cycle on this particular path, and caching it would poison a later walk
  // that would have found the call.
  if (hit) knownToSpend.set(file, true);
  return hit;
}

function routeFiles(): string[] {
  return readdirSync(API_DIR, { recursive: true, encoding: "utf8" })
    .filter((entry) => entry.endsWith("route.ts"))
    .map((entry) => join(API_DIR, entry));
}

const relative = (file: string) => file.slice(REPO_ROOT.length + 1);

describe("routes that spend provider credit are rate limited", () => {
  const routes = routeFiles();
  const candidates = routes.filter((file) => reachesProvider(file));

  test("the API surface is actually being scanned", () => {
    // Without this, a changed directory layout turns the suite green silently.
    expect(routes.length).toBeGreaterThan(100);
  });

  test("the walk still recognises routes that reach a provider", () => {
    // Without this, a rename of `generateCompletion` turns the suite green
    // silently — the worst outcome, since it looks like the check passed.
    expect(candidates.length).toBeGreaterThan(10);
  });

  test("every route that can spend provider credit calls checkAiRateLimit", () => {
    const unlimited = candidates
      .map(relative)
      .filter((path) => !(path in NO_REACHABLE_SPEND))
      .filter(
        (path) =>
          !readFileSync(join(REPO_ROOT, path), "utf8").includes(
            "checkAiRateLimit"
          )
      )
      .sort();

    expect(unlimited).toEqual([]);
  });

  test("no exception is stale", () => {
    // An exception for a route that no longer imports the module — or that has
    // since gained a limiter anyway — is a stale claim about the code. Drop it,
    // so the list stays short enough that each entry is still worth reading.
    const stale = Object.keys(NO_REACHABLE_SPEND).filter((path) => {
      const full = join(REPO_ROOT, path);
      if (!existsSync(full)) return true;
      if (readFileSync(full, "utf8").includes("checkAiRateLimit")) return true;
      return !candidates.map(relative).includes(path);
    });

    expect(stale).toEqual([]);
  });
});
