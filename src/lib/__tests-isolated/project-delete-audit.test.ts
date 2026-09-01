/**
 * Deleting a project has to be recorded as a deletion.
 *
 * The DELETE handler wrote `AUDIT_ACTIONS.PROJECT_CREATE` — the constant one
 * line up in the same object as the right one, which is exactly why it read as
 * correct. `PROJECT_DELETE` existed and was referenced nowhere in the tree.
 *
 * So the audit log said a project had been created at the moment it was
 * destroyed, and `details: { deleted: true }` sat underneath contradicting it.
 * On a product that sells its audit trail to bidders who have to answer for
 * what happened to a submission, a delete that logs as a create is worse than
 * no entry at all: it is a confident wrong answer, and reconstructing the truth
 * means knowing to distrust the field.
 *
 * The 404 test is here for the same handler's other half — a missing project
 * answered `{ error: "not found" }`, untranslated and with no `code` for a
 * client to branch on.
 */

import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

type AuditRow = { action: string; resourceId: string | null };

let auditRows: AuditRow[] = [];
let project: Record<string, unknown> | null = null;

let routeDelete: typeof import("@/app/api/projects/[id]/route").DELETE;

beforeAll(async () => {
  // Observed at `db.auditLog.create` rather than by mocking `@/lib/audit`.
  //
  // `mock.module` is process-wide, so replacing the audit module here also
  // replaced it for `audit.test.ts` and the billing-callback contract running in
  // the same `bun test` process — ten unrelated failures, none of them about
  // this route. Reading the row the real `audit()` writes costs nothing and
  // proves more: the constant has to survive the function, not just reach it.
  mock.module("@/lib/db", () => ({
    db: {
      tenderProject: {
        findUnique: mock(async () => project),
        delete: mock(async () => ({ id: "proj-1" })),
        update: mock(async () => ({ id: "proj-1" })),
      },
      user: {
        findUnique: mock(async () => ({ emailVerified: new Date() })),
      },
      auditLog: {
        create: mock(async ({ data }: { data: AuditRow }) => {
          auditRows.push(data);
          return data;
        }),
      },
    },
  }));

  const auth = await import("@/lib/auth");
  const session = {
    user: {
      id: "owner-1",
      role: "OWNER",
      emailVerified: new Date(),
    },
  };
  mock.module("@/lib/auth", () => ({
    ...auth,
    // Both, so the test reads the same before and after the handler moves onto
    // the shared controller stack: `requireWriter` is the old entry point,
    // `requireSession` the one `withTenant` uses.
    requireSession: mock(async () => session),
    requireWriter: mock(async () => session),
  }));

  const workspaceContext = await import("@/lib/workspace-context");
  mock.module("@/lib/workspace-context", () => ({
    ...workspaceContext,
    getTenantContext: mock(async () => ({
      workspace: { id: "ws-1" },
      brandProfile: null,
      userId: "owner-1",
      membershipRole: "OWNER",
    })),
  }));

  ({ DELETE: routeDelete } = await import("@/app/api/projects/[id]/route"));
});

beforeEach(() => {
  auditRows = [];
  project = { id: "proj-1", workspaceId: "ws-1", title: "Riyadh Metro Bid" };
});

function del() {
  return routeDelete(
    new NextRequest("http://localhost:3000/api/projects/proj-1", {
      method: "DELETE",
    }),
    { params: Promise.resolve({ id: "proj-1" }) }
  );
}

describe("DELETE /api/projects/[id]", () => {
  test("records the deletion as a deletion", async () => {
    const res = await del();
    expect(res.status).toBe(200);
    expect(auditRows.map((row) => row.action)).toEqual(["PROJECT_DELETE"]);
  });

  test("names the project it deleted", async () => {
    // Guards the pairing rather than the constant alone: an action with the
    // wrong resourceId is just as unusable for reconstructing what happened.
    await del();
    expect(auditRows[0]?.resourceId).toBe("proj-1");
  });

  test("a missing project fails bilingually", async () => {
    project = null;
    const res = await del();
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.code).toBe("RESOURCE_NOT_FOUND");
    expect(body.message.ar).not.toBe(body.message.en);
  });

  test("a project in another workspace is not deleted", async () => {
    project = { id: "proj-1", workspaceId: "ws-other", title: "Someone else" };
    const res = await del();
    expect(res.status).toBe(404);
    expect(auditRows).toEqual([]);
  });
});
