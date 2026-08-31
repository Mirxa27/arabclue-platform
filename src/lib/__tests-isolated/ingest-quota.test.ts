/**
 * Storage accounting at the upload funnel.
 *
 * `ingestDocumentForWorkspace` is the single path every uploaded document takes,
 * so it is the only place the storage allowance can be both enforced and
 * recorded. Enforcement has to happen before the bytes are written — a check
 * that runs after `saveUpload` has already landed the file on disk is not a
 * limit, it is a log line.
 *
 * The real `quotas` module runs here, driven through the database mock, because
 * mocking it would prove only that two functions are called and not that the
 * allowance actually binds.
 */

import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mock } from "bun:test";

type Increment = { field: string; amount: number };

let increments: Increment[] = [];
let saveUploadCalls = 0;
let storageUsedBytes = 0;

const STORED_BYTES = 4096;
const MAX_STORAGE_GB = 5;
const MAX_BYTES = MAX_STORAGE_GB * 1024 * 1024 * 1024;

type IngestModule = typeof import("../agents/platform/ingest-document");
type QuotasModule = typeof import("../quotas");
let ingestDocumentForWorkspace: IngestModule["ingestDocumentForWorkspace"];
let QuotaExceededError: QuotasModule["QuotaExceededError"];

beforeAll(async () => {
  mock.module("@/lib/db", () => ({
    db: {
      subscription: {
        findUnique: mock(() =>
          Promise.resolve({
            id: "sub-1",
            userId: "user-1",
            status: "ACTIVE",
            documentsUsed: 0,
            proposalsUsed: 0,
            tokensUsed: 0,
            storageUsedBytes,
            plan: {
              maxDocuments: 100,
              maxProposals: 100,
              maxStorageGb: MAX_STORAGE_GB,
              maxTokensPerMonth: 1_000_000,
            },
          })
        ),
        updateMany: mock((args: { data: Record<string, { increment: number }> }) => {
          const field = Object.keys(args.data)[0];
          increments.push({ field, amount: args.data[field].increment });
          return Promise.resolve({ count: 1 });
        }),
        update: mock(() => Promise.resolve({})),
      },
      user: { findUnique: mock(() => Promise.resolve(null)) },
      tenderProject: { findFirst: mock(() => Promise.resolve(null)) },
      uploadedDocument: {
        create: mock(() => Promise.resolve({ id: "doc-1" })),
        update: mock(() => Promise.resolve({ id: "doc-1" })),
      },
      documentVersion: { create: mock(() => Promise.resolve({ id: "ver-1" })) },
      auditLog: { create: mock(() => Promise.resolve({ id: "audit-1" })) },
    },
  }));

  mock.module("@/lib/storage", () => ({
    saveUpload: mock(() => {
      saveUploadCalls += 1;
      return Promise.resolve({
        storagePath: "ws-1/doc.txt",
        sizeBytes: STORED_BYTES,
        checksum: "abc123",
      });
    }),
  }));

  mock.module("@/lib/agents/ingestion", () => ({
    extractTextFromBuffer: mock(() => Promise.resolve("Tender scope text.")),
    parseTenderText: mock(() => ({ scope: "scope" })),
    buildIngestionSummary: mock(() => ({ ar: "ملخص", en: "summary" })),
    sanitizeText: (s: string) => s,
  }));

  mock.module("@/lib/agents/ocr-image", () => ({
    isImageMime: () => false,
  }));

  mock.module("@/lib/document-chunks", () => ({
    indexDocumentChunks: mock(() => Promise.resolve(3)),
  }));

  ({ ingestDocumentForWorkspace } = await import(
    "../agents/platform/ingest-document"
  ));
  ({ QuotaExceededError } = await import("../quotas"));
});

beforeEach(() => {
  increments = [];
  saveUploadCalls = 0;
  storageUsedBytes = 0;
});

function ingest() {
  return ingestDocumentForWorkspace({
    workspaceId: "ws-1",
    userId: "user-1",
    originalName: "tender.txt",
    mimeType: "text/plain",
    bytes: Buffer.from("tender scope"),
    docCategory: "TENDER",
  });
}

describe("ingestDocumentForWorkspace storage accounting", () => {
  test("records the stored size against the workspace allowance", async () => {
    await ingest();
    expect(increments).toContainEqual({
      field: "storageUsedBytes",
      amount: STORED_BYTES,
    });
  });

  test("still counts the document itself", async () => {
    await ingest();
    expect(increments).toContainEqual({ field: "documentsUsed", amount: 1 });
  });

  test("refuses before writing when the workspace is out of storage", async () => {
    storageUsedBytes = MAX_BYTES;
    await expect(ingest()).rejects.toThrow(QuotaExceededError);
    expect(saveUploadCalls).toBe(0);
    expect(increments).toEqual([]);
  });

  test("a workspace with headroom is not blocked", async () => {
    storageUsedBytes = MAX_BYTES - 1024 * 1024;
    await expect(ingest()).resolves.toBeDefined();
    expect(saveUploadCalls).toBe(1);
  });
});
