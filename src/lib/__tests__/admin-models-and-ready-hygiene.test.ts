/**
 * Three small holes from the audit, each with a one-line consequence:
 *
 * - `POST /api/admin/ai-providers/models` spends a stored credential against
 *   an external provider on every call and was the only AI-adjacent route
 *   with no rate limit and no audit row.
 * - `GET /api/ready` is public and echoed 120 characters of the raw database
 *   error to anonymous callers; a driver message can name a host, a table or
 *   a file path.
 * - Every response advertised `x-powered-by: Next.js`; the header buys
 *   nothing and narrows an attacker's guesswork.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
// The default export is the Workflow DevKit wrapper (an async config function);
// the plain object the tests read is the named export.
import { nextConfig } from "../../../next.config";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");
function read(path: string): string {
  return readFileSync(join(REPO_ROOT, path), "utf8");
}

describe("admin model fetch is rate-limited and audited", () => {
  const src = read("src/app/api/admin/ai-providers/models/route.ts");
  test("it goes through checkAiRateLimit", () => {
    expect(/checkAiRateLimit\(\{[\s\S]*?route:\s*"admin\.ai-providers\.models"/.test(src)).toBe(true);
  });
  test("a successful fetch leaves an audit row without the credential", () => {
    expect(/audit\(\{[\s\S]*?action:\s*AUDIT_ACTIONS\.AI_PROVIDER_MODELS_FETCH/.test(src)).toBe(true);
    expect(/apiKey[^E]/.test(src.slice(src.indexOf("audit({")))).toBe(false);
  });
  test("the audit action exists", () => {
    expect(/AI_PROVIDER_MODELS_FETCH:\s*"AI_PROVIDER_MODELS_FETCH"/.test(read("src/lib/audit.ts"))).toBe(true);
  });
});

describe("readiness does not narrate the database to strangers", () => {
  test("the database check answers a fixed detail, and logs the real one", () => {
    const src = read("src/app/api/ready/route.ts");
    expect(/detail:\s*err instanceof Error \? err\.message\.slice\(0, 120\)/.test(src)).toBe(false);
    expect(/detail:\s*"database_unavailable"/.test(src)).toBe(true);
    expect(/console\.error\("\[ready\] database probe failed"/.test(src)).toBe(true);
  });
});

describe("no framework banner", () => {
  test("poweredByHeader is off", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });
});
