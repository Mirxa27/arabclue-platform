/**
 * Deleting a document has to give the bytes back.
 *
 * A storage allowance that only counts up is not a limit, it is a ratchet: a
 * workspace that clears every file it owns would still be refused the next
 * upload, with nothing in the product able to unstick it. The release belongs
 * on the delete path for the same reason the charge belongs on the ingest path
 * — they are the two ends of one number.
 *
 * The credit goes to the uploader's subscription, not the caller's. Quotas hang
 * off a user while documents hang off a workspace, so a colleague deleting your
 * file must not be paid for it.
 */

import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

type Increment = { userId: string; field: string; amount: number };

let increments: Increment[] = [];
let doc: Record<string, unknown> | null = null;
let evidenceReferences = 0;

let routeDelete: typeof import("@/app/api/documents/[id]/route").DELETE;

beforeAll(async () => {
  mock.module("@/lib/db", () => ({
    db: {
      $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
      uploadedDocument: {
        findUnique: mock(async () => doc),
        delete: mock(async () => ({ id: "doc-1" })),
      },
      pastProject: { count: mock(async () => evidenceReferences) },
      certificate: { count: mock(async () => 0) },
      methodologyAsset: { count: mock(async () => 0) },
      contentLibraryItem: { count: mock(async () => 0) },
      subscription: {
        updateMany: mock(
          (args: {
            where: { userId: string };
            data: Record<string, { increment: number }>;
          }) => {
            const field = Object.keys(args.data)[0];
            increments.push({
              userId: args.where.userId,
              field,
              amount: args.data[field].increment,
            });
            return Promise.resolve({ count: 1 });
          }
        ),
      },
      auditLog: { create: mock(async () => ({ id: "audit-1" })) },
    },
  }));

  const auth = await import("@/lib/auth");
  mock.module("@/lib/auth", () => ({
    ...auth,
    requireWriter: mock(async () => ({
      user: { id: "deleter-1", emailVerified: true },
    })),
  }));

  const workspaceContext = await import("@/lib/workspace-context");
  mock.module("@/lib/workspace-context", () => ({
    ...workspaceContext,
    getTenantContext: mock(async () => ({
      workspace: { id: "ws-1" },
      membershipRole: "OWNER",
    })),
  }));

  ({ DELETE: routeDelete } = await import("@/app/api/documents/[id]/route"));
});

beforeEach(() => {
  increments = [];
  evidenceReferences = 0;
  doc = {
    id: "doc-1",
    workspaceId: "ws-1",
    uploadedById: "uploader-1",
    sizeBytes: 4096,
    versions: [],
  };
});

function del() {
  return routeDelete(
    new NextRequest("http://localhost:3000/api/documents/doc-1", {
      method: "DELETE",
    }),
    { params: Promise.resolve({ id: "doc-1" }) }
  );
}

describe("DELETE /api/documents/[id] storage release", () => {
  test("credits the deleted bytes back to the uploader", async () => {
    const res = await del();
    expect(res.status).toBe(200);
    expect(increments).toContainEqual({
      userId: "uploader-1",
      field: "storageUsedBytes",
      amount: -4096,
    });
  });

  test("releases nothing when the delete was refused", async () => {
    evidenceReferences = 1;
    const res = await del();
    expect(res.status).toBe(409);
    expect(increments).toEqual([]);
  });
});
