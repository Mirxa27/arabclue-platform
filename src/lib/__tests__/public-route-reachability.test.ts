/**
 * Guard test: a handler declared public must actually be reachable.
 *
 * `withPublicRoute` says "this endpoint serves callers without a session", but
 * reachability is decided earlier, by the PUBLIC_PATHS set in src/proxy.ts. The
 * two drifted: /api/invitations/accept is a withPublicRoute handler that
 * explicitly tolerates a null session and can create an account, yet the proxy
 * rejected the unauthenticated invitee before it ran — so the primary
 * invitation flow could not complete.
 *
 * This asserts the two stay in agreement.
 */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");
const API_ROOT = join(REPO_ROOT, "src", "app", "api");

const proxySource = readFileSync(join(REPO_ROOT, "src", "proxy.ts"), "utf8");

/** Route paths whose handler body calls `withPublicRoute`. */
function findPublicRouteHandlers(dir: string, prefix = ""): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...findPublicRouteHandlers(full, `${prefix}/${entry}`));
      continue;
    }
    if (entry !== "route.ts") continue;
    const source = readFileSync(full, "utf8");
    if (source.includes("withPublicRoute(")) found.push(`/api${prefix}`);
  }
  return found;
}

/**
 * A path is reachable unauthenticated when it is in PUBLIC_PATHS or matched by
 * one of the prefix rules in `isPublicPath`.
 */
function proxyAllowsUnauthenticated(routePath: string): boolean {
  if (proxySource.includes(`"${routePath}"`)) return true;
  const prefixRules = ["/api/auth", "/api/cron"];
  return prefixRules.some(
    (prefix) =>
      routePath.startsWith(prefix) && proxySource.includes(`"${prefix}"`)
  );
}

describe("withPublicRoute handlers are reachable without a session", () => {
  const publicHandlers = findPublicRouteHandlers(API_ROOT);

  test("at least one public handler exists to check", () => {
    expect(publicHandlers.length).toBeGreaterThan(0);
  });

  test.each(publicHandlers)(
    "%s is not blocked by the proxy",
    (routePath) => {
      expect(proxyAllowsUnauthenticated(routePath)).toBe(true);
    }
  );
});

describe("invitation acceptance specifically", () => {
  test("is listed in the proxy's public paths", () => {
    expect(proxySource).toContain('"/api/invitations/accept"');
  });

  test("the handler still tolerates an absent session", () => {
    const source = readFileSync(
      join(API_ROOT, "invitations", "accept", "route.ts"),
      "utf8"
    );
    expect(source).toContain("withPublicRoute");
    // The null-session branch is what lets a brand-new invitee accept.
    expect(source).toMatch(/sessionUser\s*=[\s\S]{0,200}?:\s*null/);
  });
});
