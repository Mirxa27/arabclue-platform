/**
 * Guard: every admin route goes through withAdmin and no longer answers
 * unauthenticated callers with a hand-rolled `{ error: "Forbidden" }`.
 *
 * Eleven of the fourteen handlers predated the controller: they called
 * requireAdmin, returned that string 403, skipped Zod, and let Prisma
 * errors escape as raw 500s. N9 wraps each exported method so auth,
 * validation, and Prisma mapping stay on one path.
 */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");
const ADMIN_ROOT = join(REPO_ROOT, "src", "app", "api", "admin");

function collectAdminRoutes(dir: string, prefix = ""): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...collectAdminRoutes(full, `${prefix}/${entry}`));
      continue;
    }
    if (entry === "route.ts") found.push(`${prefix}/route.ts`);
  }
  return found.sort();
}

describe("admin handlers use the controller", () => {
  const routes = collectAdminRoutes(ADMIN_ROOT);

  test("the admin tree is not empty", () => {
    expect(routes.length).toBeGreaterThanOrEqual(14);
  });

  test.each(routes)("%s wraps every exported method with withAdmin", (rel) => {
    const source = readFileSync(join(ADMIN_ROOT, rel), "utf8");
    const methods = [
      ...source.matchAll(/export async function (GET|POST|PATCH|PUT|DELETE)\b/g),
    ];
    const wraps = [...source.matchAll(/withAdmin\(/g)];
    expect(methods.length).toBeGreaterThan(0);
    expect(wraps.length).toBe(methods.length);
    expect(source).toContain("withAdmin");
    expect(source).not.toContain("requireAdmin");
    expect(source).not.toContain('{ error: "Forbidden" }');
  });
});
