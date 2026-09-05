/**
 * Members could not be managed: no route changed or removed a WorkspaceMember,
 * so a departed colleague kept access and a wrong role stayed wrong.
 *
 * PATCH/DELETE /api/workspaces/members/[id] now exist; every guard behind them
 * lives in `workspace-members.ts` and is driven here against an in-memory
 * client and a recording audit sink — no database, no network.
 */

import { describe, expect, test } from "bun:test";
import { ApiError, WorkspaceRoleForbiddenError } from "../api-failure";
import type { AuditContext } from "../audit";
import {
  changeWorkspaceMemberRole,
  removeWorkspaceMember,
  type MembershipActor,
  type WorkspaceMemberClient,
} from "../workspace-members";

const WS = "ws-1";

type Member = {
  id: string;
  workspaceId: string;
  userId: string;
  role: string;
  user: { id: string; name: string; email: string };
};

type User = { id: string; activeWorkspaceId: string | null };

function createFakeClient(seedMembers: Member[], seedUsers: User[]) {
  const members = seedMembers.map((m) => ({ ...m }));
  const users = seedUsers.map((u) => ({ ...u }));
  const client = {
    workspaceMember: {
      async findFirst({ where }: { where: { id: string; workspaceId: string } }) {
        return members.find((m) => m.id === where.id && m.workspaceId === where.workspaceId) ?? null;
      },
      async count({ where }: { where: { workspaceId: string; role: string } }) {
        return members.filter((m) => m.workspaceId === where.workspaceId && m.role === where.role).length;
      },
      async update({ where, data }: { where: { id: string }; data: { role: string } }) {
        const member = members.find((m) => m.id === where.id)!;
        member.role = data.role;
        return member;
      },
      async delete({ where }: { where: { id: string } }) {
        const index = members.findIndex((m) => m.id === where.id);
        const [removed] = members.splice(index, 1);
        return removed;
      },
    },
    user: {
      async updateMany({
        where,
        data,
      }: {
        where: { id: string; activeWorkspaceId: string };
        data: { activeWorkspaceId: null };
      }) {
        let count = 0;
        for (const user of users) {
          if (user.id === where.id && user.activeWorkspaceId === where.activeWorkspaceId) {
            user.activeWorkspaceId = data.activeWorkspaceId;
            count += 1;
          }
        }
        return { count };
      },
    },
  };
  return { members, users, client: client as unknown as WorkspaceMemberClient };
}

function member(id: string, userId: string, role: string, workspaceId = WS): Member {
  return {
    id,
    workspaceId,
    userId,
    role,
    user: { id: userId, name: userId.toUpperCase(), email: `${userId}@example.com` },
  };
}

const OWNER_ACTOR: MembershipActor = {
  userId: "owner",
  membershipRole: "OWNER",
  platformRole: "BIDDER",
};
const ADMIN_ACTOR: MembershipActor = {
  userId: "admin",
  membershipRole: "ADMIN",
  platformRole: "BIDDER",
};
const MEMBER_ACTOR: MembershipActor = {
  userId: "plain",
  membershipRole: "MEMBER",
  platformRole: "BIDDER",
};

function harness(extra: Member[] = []) {
  const fake = createFakeClient(
    [
      member("m-owner", "owner", "OWNER"),
      member("m-admin", "admin", "ADMIN"),
      member("m-plain", "plain", "MEMBER"),
      ...extra,
    ],
    [
      { id: "owner", activeWorkspaceId: WS },
      { id: "admin", activeWorkspaceId: WS },
      { id: "plain", activeWorkspaceId: WS },
      { id: "other", activeWorkspaceId: "ws-2" },
    ]
  );
  const audits: AuditContext[] = [];
  const deps = {
    client: fake.client,
    audit: async (ctx: AuditContext) => {
      audits.push(ctx);
    },
  };
  return { ...fake, audits, deps };
}

async function failure(run: () => Promise<unknown>): Promise<ApiError> {
  try {
    await run();
  } catch (error) {
    if (error instanceof ApiError) return error;
    throw error;
  }
  throw new Error("expected the call to be refused");
}

describe("changing a member's role", () => {
  test("a plain member is refused before any read", async () => {
    const h = harness();

    const error = await failure(() =>
      changeWorkspaceMemberRole({
        actor: MEMBER_ACTOR,
        workspaceId: WS,
        memberId: "m-admin",
        payload: { role: "MEMBER" },
        deps: h.deps,
      })
    );

    expect(error).toBeInstanceOf(WorkspaceRoleForbiddenError);
    expect(h.members.find((m) => m.id === "m-admin")!.role).toBe("ADMIN");
    expect(h.audits).toHaveLength(0);
  });

  test("a member of another workspace is not found, not touched", async () => {
    const h = harness([member("m-foreign", "other", "MEMBER", "ws-2")]);

    const error = await failure(() =>
      changeWorkspaceMemberRole({
        actor: OWNER_ACTOR,
        workspaceId: WS,
        memberId: "m-foreign",
        payload: { role: "ADMIN" },
        deps: h.deps,
      })
    );

    expect(error.status).toBe(404);
    expect(error.code).toBe("WORKSPACE_MEMBER_NOT_FOUND");
    expect(h.members.find((m) => m.id === "m-foreign")!.role).toBe("MEMBER");
  });

  test("nobody changes their own role", async () => {
    const h = harness();

    const error = await failure(() =>
      changeWorkspaceMemberRole({
        actor: ADMIN_ACTOR,
        workspaceId: WS,
        memberId: "m-admin",
        payload: { role: "OWNER" },
        deps: h.deps,
      })
    );

    expect(error.status).toBe(400);
    expect(error.code).toBe("CANNOT_CHANGE_OWN_MEMBERSHIP");
  });

  test("the last owner cannot be demoted", async () => {
    const h = harness();
    const platformAdmin: MembershipActor = {
      userId: "root",
      membershipRole: "MEMBER",
      platformRole: "SUPER_ADMIN",
    };

    const error = await failure(() =>
      changeWorkspaceMemberRole({
        actor: platformAdmin,
        workspaceId: WS,
        memberId: "m-owner",
        payload: { role: "ADMIN" },
        deps: h.deps,
      })
    );

    expect(error.status).toBe(409);
    expect(error.code).toBe("WORKSPACE_LAST_OWNER");
    expect(h.members.find((m) => m.id === "m-owner")!.role).toBe("OWNER");
  });

  test("an admin may not hand out the owner role", async () => {
    const h = harness();

    const error = await failure(() =>
      changeWorkspaceMemberRole({
        actor: ADMIN_ACTOR,
        workspaceId: WS,
        memberId: "m-plain",
        payload: { role: "OWNER" },
        deps: h.deps,
      })
    );

    expect(error.status).toBe(403);
    expect(error.code).toBe("MEMBER_ROLE_FORBIDDEN");
  });

  test("a malformed role is a validation failure naming the field", async () => {
    const h = harness();

    const error = await failure(() =>
      changeWorkspaceMemberRole({
        actor: OWNER_ACTOR,
        workspaceId: WS,
        memberId: "m-plain",
        payload: { role: "SUPER_ADMIN" },
        deps: h.deps,
      })
    );

    expect(error.code).toBe("REQUEST_VALIDATION_FAILED");
    expect(error.fieldPaths).toEqual(["role"]);
  });

  test("an owner promotes a member and the change is audited", async () => {
    const h = harness();

    const updated = await changeWorkspaceMemberRole({
      actor: OWNER_ACTOR,
      workspaceId: WS,
      memberId: "m-plain",
      payload: { role: "ADMIN" },
      deps: h.deps,
    });

    expect(updated).toEqual({
      id: "m-plain",
      role: "ADMIN",
      user: { id: "plain", name: "PLAIN", email: "plain@example.com" },
    });
    expect(h.audits).toHaveLength(1);
    const row = h.audits[0]!;
    expect(row.action).toBe("ROLE_CHANGE");
    expect(row.resource).toBe("WorkspaceMember");
    expect(row.resourceId).toBe("m-plain");
    expect(row.userId).toBe("owner");
    expect(row.details?.before).toEqual({ role: "MEMBER" });
    expect(row.details?.after).toEqual({ role: "ADMIN" });
  });

  test("an unchanged role is a no-op with no audit row", async () => {
    const h = harness();

    const result = await changeWorkspaceMemberRole({
      actor: OWNER_ACTOR,
      workspaceId: WS,
      memberId: "m-plain",
      payload: { role: "MEMBER" },
      deps: h.deps,
    });

    expect(result.role).toBe("MEMBER");
    expect(h.audits).toHaveLength(0);
  });
});

describe("removing a member", () => {
  test("removes the membership, detaches the active workspace, and audits", async () => {
    const h = harness();

    const result = await removeWorkspaceMember({
      actor: ADMIN_ACTOR,
      workspaceId: WS,
      memberId: "m-plain",
      deps: h.deps,
    });

    expect(result).toEqual({ removedMemberId: "m-plain", removedUserId: "plain" });
    expect(h.members.some((m) => m.id === "m-plain")).toBe(false);
    expect(h.users.find((u) => u.id === "plain")!.activeWorkspaceId).toBeNull();
    // Someone whose active workspace is elsewhere is left alone.
    expect(h.users.find((u) => u.id === "other")!.activeWorkspaceId).toBe("ws-2");
    const row = h.audits[0]!;
    expect(row.action).toBe("WORKSPACE_MEMBER_REMOVE");
    expect(row.resourceId).toBe("m-plain");
    expect(row.details?.memberUserId).toBe("plain");
    expect(row.details?.role).toBe("MEMBER");
  });

  test("nobody removes themselves", async () => {
    const h = harness();

    const error = await failure(() =>
      removeWorkspaceMember({
        actor: OWNER_ACTOR,
        workspaceId: WS,
        memberId: "m-owner",
        deps: h.deps,
      })
    );

    expect(error.code).toBe("CANNOT_CHANGE_OWN_MEMBERSHIP");
    expect(h.members.some((m) => m.id === "m-owner")).toBe(true);
  });

  test("the last owner cannot be removed, even by a platform admin", async () => {
    const h = harness();
    const platformAdmin: MembershipActor = {
      userId: "root",
      membershipRole: "MEMBER",
      platformRole: "ADMIN",
    };

    const error = await failure(() =>
      removeWorkspaceMember({
        actor: platformAdmin,
        workspaceId: WS,
        memberId: "m-owner",
        deps: h.deps,
      })
    );

    expect(error.code).toBe("WORKSPACE_LAST_OWNER");
  });

  test("a second owner can be removed by an owner but not by an admin", async () => {
    const h = harness([member("m-owner2", "owner2", "OWNER")]);

    const refused = await failure(() =>
      removeWorkspaceMember({
        actor: ADMIN_ACTOR,
        workspaceId: WS,
        memberId: "m-owner2",
        deps: h.deps,
      })
    );
    expect(refused.code).toBe("MEMBER_ROLE_FORBIDDEN");

    const result = await removeWorkspaceMember({
      actor: OWNER_ACTOR,
      workspaceId: WS,
      memberId: "m-owner2",
      deps: h.deps,
    });
    expect(result.removedUserId).toBe("owner2");
  });
});
