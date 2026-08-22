/**
 * Guard test: route handlers must not echo a thrown message to the client.
 *
 * A raw `err.message` from a generic catch carries Prisma constraint names,
 * column paths, provider URLs and file paths. The repository already has a
 * central bilingual mapper (`toErrorResponse` / `api-failure.ts`) that redacts
 * before logging and never echoes; fifteen handlers bypassed it.
 *
 * A typed error's message is a different thing — it is authored by us and safe
 * — so this checks the generic-catch shape specifically.
 */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");
const API_ROOT = join(REPO_ROOT, "src", "app", "api");

function routeFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) routeFiles(full, out);
    else if (entry === "route.ts") out.push(full);
  }
  return out;
}

const ROUTES = routeFiles(API_ROOT);

/**
 * A generic thrown message reaching the caller unprotected.
 *
 * Two forms are acceptable and are excluded: the value wrapped in
 * `redactSensitiveText(...)` — which strips SQL, credentials and paths while
 * keeping a diagnostic an operator needs — and a message written to an internal
 * column that no response selects.
 */
const GENERIC_ECHO = /\b(?:err|error)\s+instanceof\s+Error\s*\?\s*(?:err|error)\.message\s*:/g;

const INTERNAL_ONLY = new Set([
  // Written to PaymentWebhookEvent.errorMessage; the admin panel's webhook
  // list does not select that column.
  "src/app/api/billing/webhook/route.ts",
]);

describe("no route echoes a generic thrown message", () => {
  test("there are routes to scan", () => {
    expect(ROUTES.length).toBeGreaterThan(50);
  });

  const offenders: string[] = [];
  for (const file of ROUTES) {
    const rel = file.replace(`${REPO_ROOT}/`, "");
    if (INTERNAL_ONLY.has(rel)) continue;
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(GENERIC_ECHO)) {
      const before = source.slice(Math.max(0, match.index - 160), match.index);
      // Redacted values are fine.
      if (before.includes("redactSensitiveText(")) continue;
      // A message passed to console.* is a server-side log, not a response.
      if (/console\.(error|warn|log|info)\([^)]*$/s.test(before)) continue;
      offenders.push(`${rel}:${source.slice(0, match.index).split("\n").length}`);
    }
  }

  test("every surviving echo is redacted first", () => {
    expect(offenders).toEqual([]);
  });
});

describe("document ingestion reports client faults as typed errors", () => {
  const source = readFileSync(
    join(REPO_ROOT, "src/lib/agents/platform/ingest-document.ts"),
    "utf8"
  );

  test.each([
    ["UPLOAD_EMPTY", 400],
    ["UPLOAD_TOO_LARGE", 400],
    ["UPLOAD_TYPE_REJECTED", 400],
    ["PROJECT_NOT_FOUND", 404],
  ])("%s is thrown as a typed ApiError with status %i", (code, status) => {
    expect(source).toContain(code);
    expect(source).toMatch(new RegExp(`${status},\\s*"${code}"`));
  });

  test("no client fault is a bare Error any more", () => {
    // A bare Error forced the caller to recover the status by regex over the
    // English message, so a rephrasing silently became a 500.
    expect(source).not.toContain('throw new Error("empty file")');
    expect(source).not.toContain('throw new Error("project not found")');
  });
});

describe("the documents route no longer picks status by regex", () => {
  const source = readFileSync(
    join(REPO_ROOT, "src/app/api/documents/route.ts"),
    "utf8"
  );

  test("the message-sniffing branch is gone", () => {
    expect(source).not.toMatch(/rejected\|empty file\|too large/);
  });

  test("it maps through the shared failure mapper", () => {
    expect(source).toContain("toErrorResponse(err");
  });
});
