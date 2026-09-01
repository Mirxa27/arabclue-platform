/**
 * A route that calls the platform agent model must budget for it.
 *
 * `maxDuration` is the wall clock Vercel gives the function before it kills it
 * mid-response. For a route that streams, being killed is silent: the status
 * line and the first frames already went out, so the client sees a well-formed
 * stream that simply stops. Nothing throws, nothing logs, and the failure is
 * indistinguishable from "the model had nothing to say".
 *
 * Observed against production on 2026-09-01, before this was raised:
 *
 *     POST /api/proposals/<id>/copilot   (14-line document)
 *     -> 200 application/x-ndjson (+582ms to headers)
 *        [+   604ms] frame 1  meta  {"provider":"openai_compatible","model":"deepseek-v4-pro"}
 *        stream closed after 60481ms, 1 frames total
 *
 *     POST /api/proposals/<id>/copilot   (one sentence)
 *        [+  1797ms] meta
 *        [+ 29479ms] suggestion  anchor="The vendor shall provide TBD services."
 *        closed +29486ms
 *
 * 29s to the first suggestion on one sentence, and zero suggestions inside 60s
 * on a short document. The route was the only caller of
 * `resolvePlatformAgentModel` still declaring the 60s default, while
 * `/api/platform-agent/chat` — the same model, reached the same way — declares
 * 300.
 *
 * So the rule is the one the codebase already follows everywhere else: reach
 * that model, budget like the route that was built for it.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");
const API_ROOT = join(REPO_ROOT, "src/app/api");
const LIB_ROOT = join(REPO_ROOT, "src/lib");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const TS = [...walk(API_ROOT), ...walk(LIB_ROOT)].filter(
  (f) => f.endsWith(".ts") && !f.includes("__tests")
);

/**
 * Comments removed, so a module that only *talks* about the resolver does not
 * read as one that calls it. `src/lib/llm/index.ts` names it in a comment and
 * is imported by most of the API, which made the first version of this test
 * flag four unrelated routes. The `[^:]` guard keeps `https://` intact.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const SOURCE = new Map(TS.map((f) => [f, stripComments(readFileSync(f, "utf8"))]));

/** Local imports a file makes, resolved to absolute paths under src/. */
function localImports(file: string): string[] {
  const src = SOURCE.get(file) ?? "";
  const out: string[] = [];
  for (const m of src.matchAll(/from\s+"(@\/[^"]+)"/g)) {
    const base = join(REPO_ROOT, "src", m[1].slice(2));
    for (const candidate of [`${base}.ts`, join(base, "index.ts")]) {
      if (SOURCE.has(candidate)) out.push(candidate);
    }
  }
  return out;
}

/** Every route file whose import graph reaches `resolvePlatformAgentModel`. */
function routesReachingPlatformModel(): string[] {
  const reaches = new Map<string, boolean>();
  const visit = (file: string, stack: Set<string>): boolean => {
    const cached = reaches.get(file);
    if (cached !== undefined) return cached;
    if (stack.has(file)) return false;
    stack.add(file);
    const src = SOURCE.get(file) ?? "";
    const hit =
      /resolvePlatformAgentModel/.test(src) ||
      localImports(file).some((dep) => visit(dep, stack));
    stack.delete(file);
    reaches.set(file, hit);
    return hit;
  };
  return TS.filter(
    (f) => f.startsWith(API_ROOT) && f.endsWith("route.ts") && visit(f, new Set())
  );
}

function declaredMaxDuration(file: string): number | null {
  const m = (SOURCE.get(file) ?? "").match(/export const maxDuration\s*=\s*(\d+)/);
  return m ? Number(m[1]) : null;
}

const rel = (f: string) => f.slice(REPO_ROOT.length + 1);

describe("time budget for routes that call the platform agent model", () => {
  const chat = join(API_ROOT, "platform-agent/chat/route.ts");
  const reference = declaredMaxDuration(chat);

  test("the reference route declares a budget to compare against", () => {
    // Anti-vacuous: if chat ever drops its declaration the rule below would
    // pass trivially against NaN.
    expect(reference).toBeGreaterThanOrEqual(300);
  });

  test("routes reaching that model are found by import graph, not by name", () => {
    const routes = routesReachingPlatformModel().map(rel);
    // The copilot route names neither the model resolver nor the provider — it
    // reaches both two hops away, through `@/lib/ai/copilot-suggestions`. A
    // grep for `resolvePlatformAgentModel` under src/app finds nothing.
    expect(routes).toContain("src/app/api/proposals/[id]/copilot/route.ts");
    expect(routes).toContain("src/app/api/platform-agent/chat/route.ts");
    // …and does not sweep in every route that merely imports `@/lib/llm`,
    // which mentions the resolver in prose. Brand upload runs no agent.
    expect(routes).not.toContain("src/app/api/brand/route.ts");
  });

  test("none of them is given less time than the model needs", () => {
    const short = routesReachingPlatformModel()
      .map((f) => ({ file: rel(f), max: declaredMaxDuration(f) }))
      .filter((r) => r.max === null || r.max < (reference ?? 300));
    expect(short).toEqual([]);
  });
});
