/**
 * Every route that lets the client name a mission has to resolve it.
 *
 * The resolver in `mission.ts` is only a fix where it is called. Three sites
 * built their mission id with `body.missionId || mission.id` — a client value
 * winning over the server's — and one of them fed a `deleteMany`. This test
 * holds the line: the pattern may not come back, and each site has to go
 * through `resolveOwnedMissionId`. Source-text on purpose: the routes need a
 * session, a tenant and a database to run, and the property under test is
 * which function the id passes through, not what the route answers.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");

const SITES = [
  "src/app/api/platform-agent/chat/route.ts",
  "src/app/api/platform-agent/extension/copilot/route.ts",
  "src/lib/agents/platform/realtime.ts",
];

function read(path: string): string {
  return readFileSync(join(REPO_ROOT, path), "utf8");
}

describe("client-supplied mission ids are resolved against ownership", () => {
  for (const path of SITES) {
    test(`${path} resolves the requested mission`, () => {
      const src = read(path);
      expect(
        /resolveOwnedMissionId\(/.test(src),
        `${path} — missing the ownership resolver call`,
      ).toBe(true);
    });

    test(`${path} no longer lets the client value win outright`, () => {
      const src = read(path);
      expect(
        /missionId\s*\|\|\s*mission\.id/.test(src),
        `${path} — 'body.missionId || mission.id' is the hole`,
      ).toBe(false);
    });
  }

  test("the resolver is real and scoped, not a passthrough", () => {
    // Anti-vacuous: a resolver that returned the requested id would satisfy
    // the call-site tests above while changing nothing.
    const src = read("src/lib/agents/platform/mission.ts");
    expect(/export async function resolveOwnedMissionId\(/.test(src)).toBe(true);
    expect(/copilotMission\.findFirst\(/.test(src)).toBe(true);
    expect(/userId:\s*opts\.userId/.test(src)).toBe(true);
    expect(/workspaceId:\s*opts\.workspaceId/.test(src)).toBe(true);
  });
});
