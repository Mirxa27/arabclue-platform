/**
 * A mission id from the client is a claim, not a fact.
 *
 * `POST /api/platform-agent/chat` did `const missionId = body.missionId ||
 * mission.id` and handed the result to `syncMissionTranscript`, which starts
 * with `copilotMessage.deleteMany({ where: { missionId } })` and no workspace
 * predicate. So any signed-in user who learned another tenant's mission id —
 * cuids travel in URLs, logs and screenshots — could wipe that tenant's
 * conversation and write their own messages into it. The extension copilot
 * route and the realtime voice context builder had the same line.
 *
 * The fix is one resolver: the requested id is honoured only when it names a
 * mission this user owns in this workspace; anything else quietly becomes the
 * caller's own active mission. Quietly on purpose — a 404 here would be an
 * existence oracle for other tenants' mission ids.
 */

import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";

type FindFirstArgs = { where: Record<string, unknown>; select?: unknown };

let findFirstCalls: FindFirstArgs[] = [];
let ownedIds = new Set<string>();

let resolveOwnedMissionId: typeof import("@/lib/agents/platform/mission").resolveOwnedMissionId;

beforeAll(async () => {
  mock.module("@/lib/db", () => ({
    db: {
      copilotMission: {
        findFirst: async (args: FindFirstArgs) => {
          findFirstCalls.push(args);
          const id = args.where.id;
          return typeof id === "string" && ownedIds.has(id) ? { id } : null;
        },
        // The module under test also exports getOrCreateMission etc.; they are
        // not exercised here, but importing the module must not explode.
        findMany: async () => [],
        create: async () => {
          throw new Error("not expected");
        },
        update: async () => {
          throw new Error("not expected");
        },
      },
    },
  }));
  ({ resolveOwnedMissionId } = await import("@/lib/agents/platform/mission"));
});

beforeEach(() => {
  findFirstCalls = [];
  ownedIds = new Set(["mission_mine"]);
});

const base = { workspaceId: "ws_a", userId: "user_a", fallbackId: "mission_active" };

describe("resolveOwnedMissionId", () => {
  test("a non-string or empty request is the caller's own mission, without a query", async () => {
    for (const requested of [undefined, null, "", 42, {}, []]) {
      expect(await resolveOwnedMissionId({ ...base, requested })).toBe("mission_active");
    }
    expect(findFirstCalls).toHaveLength(0);
  });

  test("asking for the mission you already have costs no query", async () => {
    expect(
      await resolveOwnedMissionId({ ...base, requested: "mission_active" }),
    ).toBe("mission_active");
    expect(findFirstCalls).toHaveLength(0);
  });

  test("a foreign id degrades to the caller's own mission — the tenant hole", async () => {
    expect(
      await resolveOwnedMissionId({ ...base, requested: "mission_of_tenant_b" }),
    ).toBe("mission_active");
  });

  test("the ownership query is scoped by workspace AND user, not just id", async () => {
    await resolveOwnedMissionId({ ...base, requested: "mission_of_tenant_b" });
    expect(findFirstCalls).toHaveLength(1);
    expect(findFirstCalls[0].where).toEqual({
      id: "mission_of_tenant_b",
      workspaceId: "ws_a",
      userId: "user_a",
    });
  });

  test("an owned id is honoured", async () => {
    expect(await resolveOwnedMissionId({ ...base, requested: "mission_mine" })).toBe(
      "mission_mine",
    );
  });
});
