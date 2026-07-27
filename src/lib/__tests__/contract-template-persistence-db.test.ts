import { describe, expect, test } from "bun:test";
import { Prisma, type PrismaClient } from "@prisma/client";
import {
  ContractDraftPersistenceError,
  contractDraftWriteSchema,
  deletePersistedContractDraft,
  listPersistedContractDrafts,
  loadPersistedContractDraft,
  persistPreparedContractDraft,
  prepareContractDraft,
  type ContractDraftSafetyRecord,
} from "../contract-template-persistence";
import { getContractTemplate } from "../document-templates/contract-templates";

function prepare(
  clientRequestId: string,
  bindings: Record<string, unknown> = {}
) {
  const template = getContractTemplate("nda-v1");
  if (!template) throw new Error("NDA test template is missing.");
  return prepareContractDraft(
    contractDraftWriteSchema.parse({
      templateKey: template.key,
      expectedVersionId: template.versionId,
      expectedCanonicalHash: template.canonicalHash,
      clientRequestId,
      mode: "PREVIEW",
      bindings,
      projectId: "project-1",
    })
  );
}

interface FakeState {
  template: Record<string, unknown> | null;
  version: Record<string, unknown> | null;
  generated: ContractDraftSafetyRecord | null;
  extraRecords: ContractDraftSafetyRecord[];
  audits: Array<Record<string, unknown>>;
  transactionOptions: unknown[];
  transactionErrors: unknown[];
  projectExists: boolean;
  workspacePlan: string;
  quotaActiveDrafts: number;
  quotaStorageBytes: number;
  findManyArgs: Array<Record<string, unknown>>;
}

function createFakeDatabase(): {
  readonly database: PrismaClient;
  readonly state: FakeState;
} {
  const state: FakeState = {
    template: null,
    version: null,
    generated: null,
    extraRecords: [],
    audits: [],
    transactionOptions: [],
    transactionErrors: [],
    projectExists: true,
    workspacePlan: "STARTER",
    quotaActiveDrafts: 0,
    quotaStorageBytes: 0,
    findManyArgs: [],
  };
  const now = new Date("2026-07-24T12:00:00.000Z");

  const templateRelation = () => {
    if (!state.template) throw new Error("Template was not synchronized.");
    return {
      id: state.template.id as string,
      workspaceId: state.template.workspaceId as string,
      catalogKey: state.template.catalogKey as string,
      canonicalHash: state.template.canonicalHash as string,
      lifecycle: state.template.lifecycle as string,
      legalReviewStatus: state.template.legalReviewStatus as string,
      counselReviewRequired:
        state.template.counselReviewRequired as boolean,
      isApproved: state.template.isApproved as boolean,
    };
  };
  const versionRelation = () => {
    if (!state.version) throw new Error("Version was not synchronized.");
    return {
      id: state.version.id as string,
      templateId: state.version.templateId as string,
      version: state.version.version as string,
      canonicalHash: state.version.canonicalHash as string,
      lifecycle: state.version.lifecycle as string,
      legalReviewStatus: state.version.legalReviewStatus as string,
      counselReviewRequired:
        state.version.counselReviewRequired as boolean,
    };
  };

  const transaction = {
    workspace: {
      findUnique: async () => ({
        id: "workspace-1",
        plan: state.workspacePlan,
      }),
    },
    tenderProject: {
      findFirst: async () => (state.projectExists ? { id: "project-1" } : null),
    },
    contractTemplate: {
      upsert: async (args: {
        create: Record<string, unknown>;
      }) => {
        if (!state.template) {
          state.template = {
            id: "template-db-1",
            ...args.create,
            approvedBy: null,
            approvedAt: null,
            createdAt: now,
            updatedAt: now,
          };
        }
        return state.template;
      },
    },
    contractTemplateVersion: {
      upsert: async (args: {
        create: Record<string, unknown>;
      }) => {
        if (!state.version) {
          state.version = {
            id: "version-db-1",
            ...args.create,
            createdAt: now,
          };
        }
        return state.version;
      },
    },
    generatedContract: {
      findUnique: async (args: {
        where: {
          workspaceId_clientRequestId: {
            workspaceId: string;
            clientRequestId: string;
          };
        };
      }) =>
        state.generated?.workspaceId ===
          args.where.workspaceId_clientRequestId.workspaceId &&
        state.generated.clientRequestId ===
          args.where.workspaceId_clientRequestId.clientRequestId
          ? state.generated
          : null,
      findFirst: async (args: {
        where: { id: string; workspaceId: string };
      }) =>
        state.generated?.id === args.where.id &&
        state.generated.workspaceId === args.where.workspaceId
          ? {
              id: state.generated.id,
              storageBytes: state.generated.storageBytes,
            }
          : null,
      aggregate: async () => ({
        _count: { _all: state.quotaActiveDrafts },
        _sum: { storageBytes: state.quotaStorageBytes },
      }),
      create: async (args: { data: Record<string, unknown> }) => {
        state.generated = {
          ...(args.data as unknown as Omit<
            ContractDraftSafetyRecord,
            "id" | "createdAt" | "updatedAt" | "template" | "templateVersion"
          >),
          id: "draft-db-1",
          createdAt: now,
          updatedAt: now,
          template: templateRelation(),
          templateVersion: versionRelation(),
        };
        return state.generated;
      },
      deleteMany: async (args: {
        where: { id: string; workspaceId: string };
      }) => {
        if (
          state.generated?.id === args.where.id &&
          state.generated.workspaceId === args.where.workspaceId
        ) {
          state.generated = null;
          state.quotaActiveDrafts = Math.max(
            0,
            state.quotaActiveDrafts - 1
          );
          return { count: 1 };
        }
        return { count: 0 };
      },
    },
    auditLog: {
      create: async (args: { data: Record<string, unknown> }) => {
        state.audits.push(args.data);
        return { id: `audit-${state.audits.length}`, ...args.data };
      },
    },
    generatedContractVersion: {
      aggregate: async () => ({ _max: { revision: null } }),
      create: async (args: { data: Record<string, unknown>; select?: unknown }) => ({
        id: "version-1",
        contractId: args.data.contractId,
        revision: 1,
        canonicalHash: args.data.canonicalHash,
        createdBy: args.data.createdBy,
        createdAt: now,
      }),
    },
  };

  const database = {
    $transaction: async (
      operation: (tx: typeof transaction) => Promise<unknown>,
      options: unknown
    ) => {
      state.transactionOptions.push(options);
      const queuedError = state.transactionErrors.shift();
      if (queuedError) throw queuedError;
      return operation(transaction);
    },
    generatedContract: {
      findUnique: async (args: {
        where: {
          workspaceId_clientRequestId: {
            workspaceId: string;
            clientRequestId: string;
          };
        };
      }) =>
        state.generated?.workspaceId ===
          args.where.workspaceId_clientRequestId.workspaceId &&
        state.generated.clientRequestId ===
          args.where.workspaceId_clientRequestId.clientRequestId
          ? state.generated
          : null,
      findMany: async (args: Record<string, unknown>) => {
        state.findManyArgs.push(args);
        return [
          ...(state.generated ? [state.generated] : []),
          ...state.extraRecords,
        ];
      },
      findFirst: async (args: {
        where: { id: string; workspaceId: string };
      }) => {
        const candidates = [
          ...(state.generated ? [state.generated] : []),
          ...state.extraRecords,
        ];
        return (
          candidates.find(
            (record) =>
              record.id === args.where.id &&
              record.workspaceId === args.where.workspaceId
          ) ?? null
        );
      },
    },
  } as unknown as PrismaClient;

  return { database, state };
}

describe("contract draft Prisma transaction integration", () => {
  test("syncs immutable catalog/version rows and atomically audits one creation", async () => {
    const { database, state } = createFakeDatabase();
    const prepared = prepare("33333333-3333-4333-8333-333333333333");
    const first = await persistPreparedContractDraft(
      {
        workspaceId: "workspace-1",
        userId: "user-1",
        prepared,
        ipAddress: "203.0.113.5",
        userAgent: "Bun test",
      },
      database
    );
    const retry = await persistPreparedContractDraft(
      {
        workspaceId: "workspace-1",
        userId: "user-1",
        prepared,
      },
      database
    );

    expect(first.created).toBe(true);
    expect(retry.created).toBe(false);
    expect(first.draft).toEqual(retry.draft);
    expect(state.template).toMatchObject({
      workspaceId: "workspace-1",
      catalogKey: "nda-v1",
      lifecycle: "DRAFT",
      legalReviewStatus: "UNREVIEWED",
      isApproved: false,
    });
    expect(state.version).toMatchObject({
      version: "nda-v1@1",
      lifecycle: "DRAFT",
      legalReviewStatus: "UNREVIEWED",
    });
    expect(state.generated).toMatchObject({
      templateVersionId: "version-db-1",
      canonicalHash: prepared.canonicalHash,
      legalReviewStatus: "UNREVIEWED",
      counselReviewRequired: true,
      isExecutable: false,
      contentPdfPath: null,
      status: "draft",
      generationSchemaVersion: 1,
      generationMode: "PREVIEW",
      diagnosticCount: prepared.diagnostics.length,
      storageBytes: prepared.storageBytes,
    });
    expect(state.audits).toHaveLength(1);
    expect(state.audits[0]).toMatchObject({
      action: "CONTRACT_DRAFT_CREATE",
      resource: "GeneratedContract",
      resourceId: "draft-db-1",
      success: true,
    });
    expect(state.transactionOptions).toHaveLength(2);
  });

  test("rejects a missing/cross-tenant project again inside the transaction", async () => {
    const { database, state } = createFakeDatabase();
    state.projectExists = false;

    await expect(
      persistPreparedContractDraft(
        {
          workspaceId: "workspace-1",
          userId: "user-1",
          prepared: prepare("44444444-4444-4444-8444-444444444444"),
        },
        database
      )
    ).rejects.toMatchObject({
      code: "CONTRACT_DRAFT_PROJECT_NOT_FOUND",
      status: 404,
    });
    expect(state.generated).toBeNull();
    expect(state.audits).toEqual([]);
  });

  test("retries serializable and unique-index races without duplicating a draft", async () => {
    for (const code of ["P2002", "P2034"] as const) {
      const { database, state } = createFakeDatabase();
      state.transactionErrors.push(
        new Prisma.PrismaClientKnownRequestError("simulated race", {
          code,
          clientVersion: "6.19.3",
        })
      );
      const result = await persistPreparedContractDraft(
        {
          workspaceId: "workspace-1",
          userId: "user-1",
          prepared: prepare(
            code === "P2002"
              ? "99999999-9999-4999-8999-999999999999"
              : "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
          ),
        },
        database
      );

      expect(result.created).toBe(true);
      expect(state.transactionOptions).toHaveLength(2);
      expect(state.audits).toHaveLength(1);
    }

    const committed = createFakeDatabase();
    const prepared = prepare(
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
    );
    await persistPreparedContractDraft(
      {
        workspaceId: "workspace-1",
        userId: "user-1",
        prepared,
      },
      committed.database
    );
    committed.state.transactionErrors.push(
      new Prisma.PrismaClientKnownRequestError("simulated committed race", {
        code: "P2002",
        clientVersion: "6.19.3",
      })
    );
    const idempotent = await persistPreparedContractDraft(
      {
        workspaceId: "workspace-1",
        userId: "user-1",
        prepared,
      },
      committed.database
    );
    expect(idempotent.created).toBe(false);
    expect(committed.state.audits).toHaveLength(1);
  });

  test("rejects catalog drift and request-id reuse with different content", async () => {
    const catalogDb = createFakeDatabase();
    await persistPreparedContractDraft(
      {
        workspaceId: "workspace-1",
        userId: "user-1",
        prepared: prepare("55555555-5555-4555-8555-555555555555"),
      },
      catalogDb.database
    );
    if (!catalogDb.state.template) throw new Error("Missing fake template.");
    catalogDb.state.template.canonicalHash = `sha256:${"0".repeat(64)}`;
    await expect(
      persistPreparedContractDraft(
        {
          workspaceId: "workspace-1",
          userId: "user-1",
          prepared: prepare("66666666-6666-4666-8666-666666666666"),
        },
        catalogDb.database
      )
    ).rejects.toMatchObject({
      code: "CONTRACT_TEMPLATE_PERSISTENCE_DRIFT",
      status: 409,
    });

    const idempotencyDb = createFakeDatabase();
    const requestId = "77777777-7777-4777-8777-777777777777";
    await persistPreparedContractDraft(
      {
        workspaceId: "workspace-1",
        userId: "user-1",
        prepared: prepare(requestId),
      },
      idempotencyDb.database
    );
    await expect(
      persistPreparedContractDraft(
        {
          workspaceId: "workspace-1",
          userId: "user-1",
          prepared: prepare(requestId, {
            "input.confidentialityPeriod": 12,
          }),
        },
        idempotencyDb.database
      )
    ).rejects.toMatchObject({
      code: "CONTRACT_DRAFT_IDEMPOTENCY_CONFLICT",
      status: 409,
    });
    expect(idempotencyDb.state.audits).toHaveLength(1);
  });

  test("enforces the active-draft plan quota inside the serializable transaction", async () => {
    const { database, state } = createFakeDatabase();
    state.workspacePlan = "STARTER";
    state.quotaActiveDrafts = 50;

    await expect(
      persistPreparedContractDraft(
        {
          workspaceId: "workspace-1",
          userId: "user-1",
          prepared: prepare("cccccccc-cccc-4ccc-8ccc-cccccccccccc"),
        },
        database
      )
    ).rejects.toMatchObject({
      code: "CONTRACT_DRAFT_QUOTA_EXCEEDED",
      status: 429,
    });
    expect(state.generated).toBeNull();
    expect(state.audits).toEqual([]);
  });

  test("recovers active-count and storage capacity through an audited tenant-scoped deletion", async () => {
    const { database, state } = createFakeDatabase();
    const first = prepare("dddddddd-dddd-4ddd-8ddd-dddddddddddd");
    await persistPreparedContractDraft(
      {
        workspaceId: "workspace-1",
        userId: "user-1",
        prepared: first,
      },
      database
    );
    state.quotaActiveDrafts = 50;
    state.quotaStorageBytes = first.storageBytes;

    await expect(
      persistPreparedContractDraft(
        {
          workspaceId: "workspace-1",
          userId: "user-1",
          prepared: prepare("eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"),
        },
        database
      )
    ).rejects.toMatchObject({
      code: "CONTRACT_DRAFT_QUOTA_EXCEEDED",
      status: 429,
    });

    const deleted = await deletePersistedContractDraft(
      {
        workspaceId: "workspace-1",
        userId: "user-1",
        id: "draft-db-1",
      },
      database
    );
    state.quotaStorageBytes -= deleted.releasedStorageBytes;
    const recovered = await persistPreparedContractDraft(
      {
        workspaceId: "workspace-1",
        userId: "user-1",
        prepared: prepare("ffffffff-ffff-4fff-8fff-ffffffffffff"),
      },
      database
    );

    expect(deleted).toEqual({
      deletedId: "draft-db-1",
      releasedStorageBytes: first.storageBytes,
    });
    expect(recovered.created).toBe(true);
    expect(state.audits.map((entry) => entry.action)).toEqual([
      "CONTRACT_DRAFT_CREATE",
      "CONTRACT_DRAFT_DELETE",
      "CONTRACT_DRAFT_CREATE",
    ]);
  });

  test("lists and reads only canonical rows and fails corrupted reads closed", async () => {
    const { database, state } = createFakeDatabase();
    const prepared = prepare("88888888-8888-4888-8888-888888888888");
    await persistPreparedContractDraft(
      {
        workspaceId: "workspace-1",
        userId: "user-1",
        prepared,
      },
      database
    );
    if (!state.generated) throw new Error("Missing generated fake record.");
    state.extraRecords.push({
      ...state.generated,
      id: "draft-corrupted",
      isExecutable: true,
    });

    const list = await listPersistedContractDrafts(
      { workspaceId: "workspace-1", projectId: "project-1", limit: 10 },
      database
    );
    const loaded = await loadPersistedContractDraft(
      { workspaceId: "workspace-1", id: "draft-db-1" },
      database
    );

    expect(list.drafts).toHaveLength(1);
    expect(list.integrityFailures).toBe(1);
    expect(list.nextCursor).toBeNull();
    expect(state.findManyArgs[0]).toMatchObject({ take: 11 });
    expect(
      (state.findManyArgs[0]?.select as Record<string, unknown>).dataJson
    ).toBeUndefined();
    expect(
      (state.findManyArgs[0]?.select as Record<string, unknown>).contentHtml
    ).toBeUndefined();
    expect(loaded?.summary.id).toBe("draft-db-1");
    expect(loaded?.contentHtml).toContain("UNREVIEWED");
    await expect(
      loadPersistedContractDraft(
        { workspaceId: "workspace-1", id: "draft-corrupted" },
        database
      )
    ).rejects.toBeInstanceOf(ContractDraftPersistenceError);
    expect(
      await loadPersistedContractDraft(
        { workspaceId: "workspace-2", id: "draft-db-1" },
        database
      )
    ).toBeNull();
  });
});
