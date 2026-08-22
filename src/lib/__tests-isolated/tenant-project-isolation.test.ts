/**
 * Guard tests for the tenant predicate on client-supplied project identifiers.
 *
 * Regression cover for the cross-tenant path where `activeProjectId` arrived
 * from a request body / tool argument and reached `tenderProject` and
 * `uploadedDocument` queries with no `workspaceId` filter. These assert on the
 * *query shape* as well as the return value, so removing the predicate fails
 * here rather than silently reopening the hole.
 */
import { beforeAll, beforeEach, describe, expect, test, mock } from "bun:test";

type ProjectRow = { id: string; workspaceId: string };

const PROJECTS: ProjectRow[] = [
  { id: "proj-own", workspaceId: "ws-self" },
  { id: "proj-foreign", workspaceId: "ws-other" },
];

let findFirstCalls: Array<Record<string, unknown>> = [];

type WorkspaceContextModule = typeof import("../workspace-context");
let resolveOwnedProjectId: WorkspaceContextModule["resolveOwnedProjectId"];

beforeAll(async () => {
  mock.module("../db", () => ({
    db: {
      tenderProject: {
        findFirst: mock((args: { where: Record<string, unknown> }) => {
          findFirstCalls.push(args.where);
          const row = PROJECTS.find(
            (p) =>
              p.id === args.where.id && p.workspaceId === args.where.workspaceId
          );
          return Promise.resolve(row ? { id: row.id } : null);
        }),
      },
    },
  }));

  ({ resolveOwnedProjectId } = await import("../workspace-context"));
});

beforeEach(() => {
  findFirstCalls = [];
});

describe("resolveOwnedProjectId", () => {
  test("returns the identifier for a project inside the tenant workspace", async () => {
    await expect(resolveOwnedProjectId("proj-own", "ws-self")).resolves.toBe(
      "proj-own"
    );
  });

  test("returns null for a project owned by another workspace", async () => {
    await expect(
      resolveOwnedProjectId("proj-foreign", "ws-self")
    ).resolves.toBeNull();
  });

  test("returns null for an unknown identifier", async () => {
    await expect(
      resolveOwnedProjectId("proj-does-not-exist", "ws-self")
    ).resolves.toBeNull();
  });

  test("always constrains the lookup by workspaceId", async () => {
    await resolveOwnedProjectId("proj-own", "ws-self");
    expect(findFirstCalls).toHaveLength(1);
    expect(findFirstCalls[0]).toMatchObject({
      id: "proj-own",
      workspaceId: "ws-self",
    });
  });

  test.each([null, undefined, "", "   "])(
    "short-circuits on empty input (%p) without querying",
    async (value) => {
      await expect(
        resolveOwnedProjectId(value as string | null | undefined, "ws-self")
      ).resolves.toBeNull();
      expect(findFirstCalls).toHaveLength(0);
    }
  );

  test("trims surrounding whitespace before lookup", async () => {
    await expect(
      resolveOwnedProjectId("  proj-own  ", "ws-self")
    ).resolves.toBe("proj-own");
    expect(findFirstCalls[0]).toMatchObject({ id: "proj-own" });
  });

  test("does not leak a project across workspaces when ids collide in intent", async () => {
    // Same identifier, two different tenants asking. Only the owner resolves.
    await expect(
      resolveOwnedProjectId("proj-foreign", "ws-other")
    ).resolves.toBe("proj-foreign");
    await expect(
      resolveOwnedProjectId("proj-foreign", "ws-self")
    ).resolves.toBeNull();
  });
});
