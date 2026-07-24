import { describe, expect, test } from "bun:test";
import { NextRequest } from "next/server";
import {
  handleContractDraftList,
  handleContractDraftPost,
  type ContractDraftRouteDependencies,
} from "../../app/api/contracts/drafts/route";
import {
  handleContractDraftDelete,
  handleContractDraftRead,
  type ContractDraftReadRouteDependencies,
} from "../../app/api/contracts/drafts/[id]/route";
import {
  ContractDraftPersistenceError,
  MAX_CONTRACT_DRAFT_BODY_BYTES,
  prepareContractDraft,
  type ContractDraftReadResult,
  type ContractDraftSummary,
} from "../contract-template-persistence";
import { getContractTemplate } from "../document-templates/contract-templates";

const REQUEST_ID = "22222222-2222-4222-8222-222222222222";

function body(overrides: Record<string, unknown> = {}) {
  const template = getContractTemplate("nda-v1");
  if (!template) throw new Error("NDA test template is missing.");
  return {
    templateKey: template.key,
    expectedVersionId: template.versionId,
    expectedCanonicalHash: template.canonicalHash,
    clientRequestId: REQUEST_ID,
    mode: "PREVIEW",
    bindings: {},
    projectId: "project-1",
    ...overrides,
  };
}

function postRequest(
  value: unknown = body(),
  headers: Record<string, string> = {}
): Request {
  return new Request("http://localhost/api/contracts/drafts", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(value),
  });
}

function summary(
  prepared: ReturnType<typeof prepareContractDraft>
): ContractDraftSummary {
  return {
    id: "draft-1",
    projectId: prepared.projectId,
    templateKey: prepared.template.key,
    templateVersionId: prepared.template.versionId,
    templateCanonicalHash: prepared.template.canonicalHash,
    canonicalHash: prepared.canonicalHash,
    mode: prepared.mode,
    title: prepared.title,
    titleAr: prepared.titleAr,
    diagnosticCount: prepared.diagnostics.length,
    legalReviewStatus: "UNREVIEWED",
    counselReviewRequired: true,
    isExecutable: false,
    status: "draft",
    createdAt: "2026-07-24T12:00:00.000Z",
    updatedAt: "2026-07-24T12:00:00.000Z",
  };
}

function harness(): {
  readonly dependencies: ContractDraftRouteDependencies;
  readonly state: {
    prepareCalls: number;
    persistCalls: number;
    admitCalls: number;
    listInputs: Array<{
      workspaceId: string;
      projectId?: string;
      limit: number;
      cursor?: string;
    }>;
  };
} {
  const state = {
    prepareCalls: 0,
    persistCalls: 0,
    admitCalls: 0,
    listInputs: [] as Array<{
      workspaceId: string;
      projectId?: string;
      limit: number;
      cursor?: string;
    }>,
  };
  return {
    state,
    dependencies: {
      getWriter: async () => ({ userId: "user-1" }),
      getReader: async () => ({ userId: "user-1" }),
      getWorkspace: async () => ({ id: "workspace-1" }),
      projectExists: async (workspaceId, projectId) =>
        workspaceId === "workspace-1" && projectId === "project-1",
      admit: async (input) => {
        state.admitCalls += 1;
        expect(input).toEqual({
          workspaceId: "workspace-1",
          userId: "user-1",
        });
        return { ok: true };
      },
      prepare: (input) => {
        state.prepareCalls += 1;
        return prepareContractDraft(input);
      },
      persist: async (input) => {
        state.persistCalls += 1;
        expect(input.workspaceId).toBe("workspace-1");
        expect(input.userId).toBe("user-1");
        return { created: true, draft: summary(input.prepared) };
      },
      list: async (input) => {
        state.listInputs.push(input);
        return {
          drafts: [],
          integrityFailures: 0,
          nextCursor: null,
        };
      },
    },
  };
}

describe("contract draft writer and list routes", () => {
  test("authenticates a writer before reading or compiling the body", async () => {
    const { dependencies, state } = harness();
    const response = await handleContractDraftPost(postRequest(), {
      ...dependencies,
      getWriter: async () => null,
    });

    expect(response.status).toBe(403);
    expect(state.prepareCalls).toBe(0);
    expect(state.persistCalls).toBe(0);
  });

  test("rejects oversized and unknown-field requests before persistence", async () => {
    const { dependencies, state } = harness();
    const oversized = await handleContractDraftPost(
      postRequest(body(), {
        "Content-Length": String(MAX_CONTRACT_DRAFT_BODY_BYTES + 1),
      }),
      dependencies
    );
    expect(oversized.status).toBe(413);

    const invalid = await handleContractDraftPost(
      postRequest(body({ injected: true })),
      dependencies
    );
    expect(invalid.status).toBe(400);
    expect(state.persistCalls).toBe(0);
  });

  test("requires an explicit JSON media type", async () => {
    const { dependencies, state } = harness();
    const request = new Request("http://localhost/api/contracts/drafts", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(body()),
    });
    const response = await handleContractDraftPost(request, dependencies);

    expect(response.status).toBe(415);
    expect((await response.json()).code).toBe(
      "CONTRACT_DRAFT_CONTENT_TYPE_UNSUPPORTED"
    );
    expect(state.prepareCalls).toBe(0);
    expect(state.persistCalls).toBe(0);
  });

  test("rejects a project outside the active workspace", async () => {
    const { dependencies, state } = harness();
    const response = await handleContractDraftPost(
      postRequest(body({ projectId: "cross-tenant-project" })),
      dependencies
    );

    expect(response.status).toBe(404);
    expect(state.prepareCalls).toBe(0);
    expect(state.persistCalls).toBe(0);
  });

  test("persists a PREVIEW result with immutable draft safety state", async () => {
    const { dependencies, state } = harness();
    const response = await handleContractDraftPost(
      postRequest(),
      dependencies
    );
    const payload = (await response.json()) as {
      created: boolean;
      executionAllowed: boolean;
      legalReviewStatus: string;
      counselReviewRequired: boolean;
      draft: ContractDraftSummary;
    };

    expect(response.status).toBe(201);
    expect(payload.created).toBe(true);
    expect(payload.executionAllowed).toBe(false);
    expect(payload.legalReviewStatus).toBe("UNREVIEWED");
    expect(payload.counselReviewRequired).toBe(true);
    expect(payload.draft.isExecutable).toBe(false);
    expect(payload.draft.templateVersionId).toBe("nda-v1@1");
    expect(state.prepareCalls).toBe(1);
    expect(state.persistCalls).toBe(1);
    expect(state.admitCalls).toBe(1);
  });

  test("fails closed when distributed admission is unavailable and returns Retry-After", async () => {
    const { dependencies, state } = harness();
    const response = await handleContractDraftPost(postRequest(), {
      ...dependencies,
      admit: async () => ({
        ok: false,
        code: "CONTRACT_DRAFT_RATE_LIMIT_UNAVAILABLE",
        status: 503,
        retryAfterSeconds: 5,
        message: "Distributed admission unavailable.",
      }),
    });

    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("5");
    expect((await response.json()).code).toBe(
      "CONTRACT_DRAFT_RATE_LIMIT_UNAVAILABLE"
    );
    expect(state.prepareCalls).toBe(0);
    expect(state.persistCalls).toBe(0);
  });

  test("returns 429 before compilation when the user or workspace rate limit is exhausted", async () => {
    const { dependencies, state } = harness();
    const response = await handleContractDraftPost(postRequest(), {
      ...dependencies,
      admit: async () => ({
        ok: false,
        code: "CONTRACT_DRAFT_RATE_LIMITED",
        status: 429,
        retryAfterSeconds: 60,
        message: "Rate limit exhausted.",
      }),
    });

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect((await response.json()).code).toBe(
      "CONTRACT_DRAFT_RATE_LIMITED"
    );
    expect(state.prepareCalls).toBe(0);
    expect(state.persistCalls).toBe(0);
  });

  test("maps workspace quota and compiled-output budgets without persisting", async () => {
    for (const expected of [
      {
        code: "CONTRACT_DRAFT_QUOTA_EXCEEDED",
        status: 429,
      },
      {
        code: "CONTRACT_DRAFT_OUTPUT_TOO_LARGE",
        status: 413,
      },
    ] as const) {
      const { dependencies, state } = harness();
      const response = await handleContractDraftPost(postRequest(), {
        ...dependencies,
        ...(expected.status === 413
          ? {
              prepare: () => {
                throw new ContractDraftPersistenceError(
                  "Compiled output is too large.",
                  expected.code,
                  expected.status
                );
              },
            }
          : {
              persist: async () => {
                throw new ContractDraftPersistenceError(
                  "Workspace quota is exhausted.",
                  expected.code,
                  expected.status
                );
              },
            }),
      });
      expect(response.status).toBe(expected.status);
      expect((await response.json()).code).toBe(expected.code);
      expect(state.persistCalls).toBe(0);
    }
  });

  test("returns idempotent retries without claiming a second creation", async () => {
    const { dependencies } = harness();
    const response = await handleContractDraftPost(postRequest(), {
      ...dependencies,
      persist: async (input) => ({
        created: false,
        draft: summary(input.prepared),
      }),
    });

    expect(response.status).toBe(200);
    expect((await response.json()).created).toBe(false);
  });

  test("fails stale catalog identities and incomplete FINAL bindings closed", async () => {
    const { dependencies } = harness();
    const stale = await handleContractDraftPost(
      postRequest(
        body({ expectedCanonicalHash: `sha256:${"0".repeat(64)}` })
      ),
      dependencies
    );
    expect(stale.status).toBe(409);
    expect((await stale.json()).code).toBe("CONTRACT_TEMPLATE_STALE");

    const incompleteFinal = await handleContractDraftPost(
      postRequest(body({ mode: "FINAL" })),
      dependencies
    );
    const finalPayload = await incompleteFinal.json();
    expect(incompleteFinal.status).toBe(422);
    expect(finalPayload.code).toBe("CONTRACT_TEMPLATE_BLOCKED");
    expect(finalPayload.executionAllowed ?? finalPayload.isExecutable).toBe(
      false
    );
  });

  test("passes only the active tenant and validated filters to the list service", async () => {
    const { dependencies, state } = harness();
    const response = await handleContractDraftList(
      new NextRequest(
        "http://localhost/api/contracts/drafts?projectId=project-1&limit=10&cursor=draft-cursor"
      ),
      dependencies
    );

    expect(response.status).toBe(200);
    expect(state.listInputs).toEqual([
      {
        workspaceId: "workspace-1",
        projectId: "project-1",
        limit: 10,
        cursor: "draft-cursor",
      },
    ]);
    expect((await response.json()).executionAllowed).toBe(false);
  });
});

describe("contract draft read route", () => {
  const prepared = prepareContractDraft(
    body({ projectId: "project-1" }) as Parameters<
      typeof prepareContractDraft
    >[0]
  );
  const readResult: ContractDraftReadResult = {
    summary: summary(prepared),
    bindings: prepared.data.bindings,
    diagnostics: prepared.diagnostics,
    boundClauses: prepared.boundClauses,
    documentSpec: prepared.documentSpec,
    contentHtml: prepared.contentHtml,
  };
  const dependencies: ContractDraftReadRouteDependencies = {
    getReader: async () => ({ userId: "user-1" }),
    getWriter: async () => ({ userId: "user-1" }),
    getWorkspace: async () => ({ id: "workspace-1" }),
    load: async (input) =>
      input.workspaceId === "workspace-1" && input.id === "draft-1"
        ? readResult
        : null,
    deleteDraft: async (input) => {
      expect(input).toMatchObject({
        workspaceId: "workspace-1",
        userId: "user-1",
        id: "draft-1",
      });
      return {
        deletedId: input.id,
        releasedStorageBytes: prepared.storageBytes,
      };
    },
  };

  test("does not load a draft for an unauthenticated caller", async () => {
    let loadCalls = 0;
    const response = await handleContractDraftRead("draft-1", {
      ...dependencies,
      getReader: async () => null,
      load: async () => {
        loadCalls += 1;
        return readResult;
      },
    });
    expect(response.status).toBe(401);
    expect(loadCalls).toBe(0);
  });

  test("returns the tenant-scoped immutable source response", async () => {
    const response = await handleContractDraftRead("draft-1", dependencies);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.executionAllowed).toBe(false);
    expect(payload.draft.summary.isExecutable).toBe(false);
    expect(payload.draft.contentHtml).toContain("UNREVIEWED");
    expect(payload.draft.documentSpec).toBeDefined();
  });

  test("maps integrity failures without returning corrupted source", async () => {
    const response = await handleContractDraftRead("draft-1", {
      ...dependencies,
      load: async () => {
        throw new ContractDraftPersistenceError(
          "Stored contract draft failed its integrity check.",
          "CONTRACT_DRAFT_INTEGRITY_FAILED",
          409
        );
      },
    });
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe(
      "CONTRACT_DRAFT_INTEGRITY_FAILED"
    );
  });

  test("requires a writer and tenant-scopes quota-recovery deletion", async () => {
    let deleteCalls = 0;
    const forbidden = await handleContractDraftDelete(
      "draft-1",
      new Request("http://localhost/api/contracts/drafts/draft-1", {
        method: "DELETE",
      }),
      {
        ...dependencies,
        getWriter: async () => null,
        deleteDraft: async () => {
          deleteCalls += 1;
          return { deletedId: "draft-1", releasedStorageBytes: 1 };
        },
      }
    );
    expect(forbidden.status).toBe(403);
    expect(deleteCalls).toBe(0);

    const deleted = await handleContractDraftDelete(
      "draft-1",
      new Request("http://localhost/api/contracts/drafts/draft-1", {
        method: "DELETE",
        headers: { "x-forwarded-for": "203.0.113.8", "user-agent": "Bun" },
      }),
      dependencies
    );
    const payload = await deleted.json();
    expect(deleted.status).toBe(200);
    expect(payload.deletedId).toBe("draft-1");
    expect(payload.releasedStorageBytes).toBe(prepared.storageBytes);
  });
});
