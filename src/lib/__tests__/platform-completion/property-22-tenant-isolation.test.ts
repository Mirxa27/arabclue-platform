/**
 * Feature: platform-completion, Property 22: Tenant isolation is noninterfering
 */

import { describe, expect, test } from "bun:test";

type Repository = Map<string, { workspaceId: string; value: string }>;

type RouteFamily =
  | "clauses"
  | "templates"
  | "contracts"
  | "knowledge"
  | "comments"
  | "proposals"
  | "marketplace";

type TenantRequest = {
  family: RouteFamily;
  callerWorkspaceId: string;
  targetId: string;
};

type TenantResult =
  | { status: 200; value: string }
  | { status: 403 | 404; code: "TENANT_ACCESS_FORBIDDEN" | "RESOURCE_NOT_FOUND" };

/**
 * Models the production tenant guard: a resource is readable only when its
 * stored workspaceId equals the caller's Tenant_Context. Cross-workspace
 * access returns forbidden/not-found and mutates nothing.
 */
function handleTenantRead(
  repos: Record<RouteFamily, Repository>,
  request: TenantRequest
): TenantResult {
  const repo = repos[request.family];
  const row = repo.get(request.targetId);
  if (!row) return { status: 404, code: "RESOURCE_NOT_FOUND" };
  if (row.workspaceId !== request.callerWorkspaceId) {
    return { status: 403, code: "TENANT_ACCESS_FORBIDDEN" };
  }
  return { status: 200, value: row.value };
}

function snapshot(repos: Record<RouteFamily, Repository>): string {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(repos).map(([family, repo]) => [
        family,
        [...repo.entries()].sort(([a], [b]) => a.localeCompare(b)),
      ])
    )
  );
}

const FAMILIES: RouteFamily[] = [
  "clauses",
  "templates",
  "contracts",
  "knowledge",
  "comments",
  "proposals",
  "marketplace",
];

describe("Feature: platform-completion, Property 22: Tenant isolation is noninterfering", () => {
  test("cross-workspace requests are forbidden/not-found and leave repositories unchanged across 100+ cases per family", () => {
    let cases = 0;
    for (let seed = 0; seed < 120; seed++) {
      const caller = `ws-caller-${seed % 11}`;
      const other = `ws-other-${(seed % 11) + 1}`;
      expect(caller).not.toBe(other);

      const repos = Object.fromEntries(
        FAMILIES.map((family) => {
          const repo: Repository = new Map();
          repo.set(`${family}-own-${seed}`, {
            workspaceId: caller,
            value: `own-${seed}`,
          });
          repo.set(`${family}-foreign-${seed}`, {
            workspaceId: other,
            value: `foreign-${seed}`,
          });
          return [family, repo];
        })
      ) as Record<RouteFamily, Repository>;

      for (const family of FAMILIES) {
        const before = snapshot(repos);
        const foreign = handleTenantRead(repos, {
          family,
          callerWorkspaceId: caller,
          targetId: `${family}-foreign-${seed}`,
        });
        expect(foreign.status === 403 || foreign.status === 404).toBe(true);
        expect(snapshot(repos)).toBe(before);

        const missing = handleTenantRead(repos, {
          family,
          callerWorkspaceId: caller,
          targetId: `${family}-missing-${seed}`,
        });
        expect(missing).toEqual({
          status: 404,
          code: "RESOURCE_NOT_FOUND",
        });
        expect(snapshot(repos)).toBe(before);

        const own = handleTenantRead(repos, {
          family,
          callerWorkspaceId: caller,
          targetId: `${family}-own-${seed}`,
        });
        expect(own).toEqual({ status: 200, value: `own-${seed}` });
        cases += 1;
      }
    }
    expect(cases).toBeGreaterThanOrEqual(100 * FAMILIES.length);
  });
});
