/**
 * Fourteen English literals on the workspace's own identity and track record.
 *
 * `/api/brand` is four handlers behind one path: read the brand profile, patch
 * it, add a past project, and edit/approve/revoke one. Every rejection across
 * all four was a bare English string, and three of them are the ones a bidder
 * hits most — a colour that is not hex, a logo URL that points somewhere else,
 * a past project missing its summary.
 *
 * The knowledge-decision failures matter for a different reason. Approving a
 * past project as evidence is the step that lets it be cited in a live bid, and
 * refusing that step in English tells an Arabic-reading reviewer nothing about
 * whether the fix is "ask an admin" or "upload a document with a checksum".
 * `APPROVAL_FORBIDDEN` and the two new evidence codes keep those three answers
 * distinct instead of flattening them into one 403.
 *
 * `validateBrandPatchForWorkspace` answers `null` for two unrelated reasons, so
 * the PATCH tests below pin both: a schema rejection has to name the field that
 * broke, and a well-formed body whose logo lives in another workspace has to
 * name `logoUrl`. "Invalid brand update" named neither.
 */

import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

type Handlers = typeof import("@/app/api/brand/route");

const EXISTING_PROJECT = {
  id: "proj-1",
  workspaceId: "ws-1",
  brandProfileId: "brand-1",
  title: "Riyadh metro fit-out",
  titleAr: null,
  clientName: null,
  clientNameAr: null,
  sector: null,
  contractValue: null,
  currency: "SAR",
  startDate: null,
  endDate: null,
  outcome: "SUCCESSFUL",
  summary: "Delivered on schedule.",
  summaryAr: null,
  tags: null,
  approved: false,
  reviewStatus: "UNREVIEWED",
  contentHash: null,
  evidenceRef: null,
  revocationReason: null,
  reviewedById: null,
  approvedAt: null,
  revokedById: null,
};

let hasSession = true;
let platformRole = "BIDDER";
let membershipRole = "OWNER";
let brandProfile: { id: string } | null = { id: "brand-1" };
let project: Record<string, unknown> | null = EXISTING_PROJECT;

let route: Handlers;

beforeAll(async () => {
  // `@/lib/knowledge-approval` is deliberately real: the two evidence failures
  // below are the ones worth proving, and a mocked resolver would only prove
  // that the route catches whatever it was told to throw.
  mock.module("@/lib/db", () => ({
    db: {
      user: { findUnique: mock(async () => ({ emailVerified: new Date() })) },
      brandProfile: { update: mock(async () => ({ id: "brand-1" })) },
      pastProject: {
        findMany: mock(async () => []),
        findFirst: mock(async () => project),
        create: mock(async () => EXISTING_PROJECT),
        update: mock(async () => EXISTING_PROJECT),
      },
      // An absent evidence document is what makes approval unresolvable.
      uploadedDocument: { findUnique: mock(async () => null) },
      documentVersion: { findUnique: mock(async () => null) },
      auditLog: { create: mock(async (args: unknown) => args) },
    },
  }));

  const auth = await import("@/lib/auth");
  mock.module("@/lib/auth", () => ({
    ...auth,
    requireSession: mock(async () =>
      hasSession
        ? { user: { id: "user-1", role: platformRole, emailVerified: new Date() } }
        : null
    ),
  }));

  const workspaceContext = await import("@/lib/workspace-context");
  mock.module("@/lib/workspace-context", () => ({
    ...workspaceContext,
    getTenantContext: mock(async () => ({
      workspace: { id: "ws-1", name: "Arabclue", nameAr: null, crNumber: null, vatNumber: null },
      brandProfile,
      userId: "user-1",
      membershipRole,
    })),
  }));

  route = await import("@/app/api/brand/route");
});

beforeEach(() => {
  hasSession = true;
  platformRole = "BIDDER";
  membershipRole = "OWNER";
  brandProfile = { id: "brand-1" };
  project = EXISTING_PROJECT;
});

function send(method: "PATCH" | "POST" | "PUT", body: unknown) {
  const req = new NextRequest("http://localhost:3000/api/brand", {
    method,
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
  return route[method](req);
}

/** Every failure on this path reaches a bidder, so none of them may be one language. */
async function bilingualBody(res: Response) {
  const body = await res.json();
  expect(body.message.ar).not.toBe(body.message.en);
  expect(body.message.ar.length).toBeGreaterThan(0);
  return body;
}

describe("GET /api/brand failures", () => {
  test("an absent session is a bilingual 401", async () => {
    hasSession = false;
    const res = await route.GET();
    expect(res.status).toBe(401);
    expect((await bilingualBody(res)).code).toBe("AUTHENTICATION_REQUIRED");
  });
});

describe("PATCH /api/brand failures", () => {
  test("an absent session is 401, not 403", async () => {
    // `requireWriter` returned null both for no session and for a REVIEWER, so
    // every unauthenticated caller was told they lacked permission instead.
    hasSession = false;
    const res = await send("PATCH", { tagline: "x" });
    expect(res.status).toBe(401);
    expect((await bilingualBody(res)).code).toBe("AUTHENTICATION_REQUIRED");
  });

  test("a reviewer is 403", async () => {
    platformRole = "REVIEWER";
    const res = await send("PATCH", { tagline: "x" });
    expect(res.status).toBe(403);
    expect((await bilingualBody(res)).code).toBe("WORKSPACE_ROLE_FORBIDDEN");
  });

  test("a workspace with no brand profile fails on that", async () => {
    brandProfile = null;
    const res = await send("PATCH", { tagline: "x" });
    expect(res.status).toBe(400);
    expect((await bilingualBody(res)).code).toBe("NO_BRAND_PROFILE");
  });

  test("a malformed colour names the colour field", async () => {
    const res = await send("PATCH", { primaryColor: "cornflower" });
    expect(res.status).toBe(400);

    const body = await bilingualBody(res);
    expect(body.code).toBe("REQUEST_VALIDATION_FAILED");
    expect(body.message.en).toContain("primaryColor");
    expect(body.message.ar).toContain("primaryColor");
  });

  test("a logo hosted outside the workspace names logoUrl", async () => {
    // The schema accepts this string; only the workspace check rejects it. The
    // old code collapsed both reasons into "Invalid brand update".
    const res = await send("PATCH", { logoUrl: "https://elsewhere.example.com/logo.png" });
    expect(res.status).toBe(400);

    const body = await bilingualBody(res);
    expect(body.code).toBe("REQUEST_VALIDATION_FAILED");
    expect(body.message.en).toContain("logoUrl");
  });
});

describe("POST /api/brand failures", () => {
  test("a past project missing its summary names the field", async () => {
    const res = await send("POST", { title: "Metro fit-out" });
    expect(res.status).toBe(400);

    const body = await bilingualBody(res);
    expect(body.code).toBe("REQUEST_VALIDATION_FAILED");
    expect(body.message.en).toContain("summary");
  });

  test("a workspace with no brand profile fails on that", async () => {
    brandProfile = null;
    const res = await send("POST", { title: "x", summary: "y" });
    expect(res.status).toBe(400);
    expect((await bilingualBody(res)).code).toBe("NO_BRAND_PROFILE");
  });
});

describe("PUT /api/brand failures", () => {
  test("an unknown project is a bilingual 404", async () => {
    project = null;
    const res = await send("PUT", { id: "missing", title: "Renamed" });
    expect(res.status).toBe(404);
    expect((await bilingualBody(res)).code).toBe("RESOURCE_NOT_FOUND");
  });

  test("approving without manager authority says so specifically", async () => {
    // Not the generic WORKSPACE_ROLE_FORBIDDEN: the caller may write here, and
    // the only thing they cannot do is sign off evidence.
    membershipRole = "MEMBER";
    const res = await send("PUT", {
      id: "proj-1",
      approved: true,
      provenance: { sourceKind: "UPLOADED_DOCUMENT", sourceId: "doc-1" },
    });
    expect(res.status).toBe(403);
    expect((await bilingualBody(res)).code).toBe("APPROVAL_FORBIDDEN");
  });

  test("revoking without manager authority says so specifically", async () => {
    membershipRole = "MEMBER";
    const res = await send("PUT", {
      id: "proj-1",
      approved: false,
      reason: "Client asked for the reference to be withdrawn",
    });
    expect(res.status).toBe(403);
    expect((await bilingualBody(res)).code).toBe("APPROVAL_FORBIDDEN");
  });

  test("approval against a document this workspace does not hold is 400", async () => {
    const res = await send("PUT", {
      id: "proj-1",
      approved: true,
      provenance: { sourceKind: "UPLOADED_DOCUMENT", sourceId: "doc-nowhere" },
    });
    expect(res.status).toBe(400);
    expect((await bilingualBody(res)).code).toBe("KNOWLEDGE_EVIDENCE_INVALID");
  });

  test("revoking something never approved is 400, not a 500", async () => {
    const res = await send("PUT", {
      id: "proj-1",
      approved: false,
      reason: "Client asked for the reference to be withdrawn",
    });
    expect(res.status).toBe(400);
    expect((await bilingualBody(res)).code).toBe("KNOWLEDGE_REVOCATION_INVALID");
  });

  test("an unparseable update names the request", async () => {
    const res = await send("PUT", { id: "proj-1" });
    expect(res.status).toBe(400);
    expect((await bilingualBody(res)).code).toBe("REQUEST_VALIDATION_FAILED");
  });
});
