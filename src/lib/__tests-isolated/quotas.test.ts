import { beforeAll, describe, expect, test } from "bun:test";
import { mock } from "bun:test";

// In-memory mock state for db
let mockSub: any = null; // subscription of the acting user ("user-1")
let mockOwnerSub: any = null; // subscription of the workspace owner ("owner-1")
let mockOwner: any = null; // workspaceMember.findFirst → the OWNER row
let mockUser: any = null;
let mockPaidRecords = 0; // PAID BillingRecord count for the legacy Starter rule
let updateManyCalls: Array<{ userId: string; field: string; amount: number }> = [];

type QuotasModule = typeof import("../quotas");
let assertWithinQuota: QuotasModule["assertWithinQuota"];
let bumpUsage: QuotasModule["bumpUsage"];
let quotaFailureCode: QuotasModule["quotaFailureCode"];
let QuotaExceededError: QuotasModule["QuotaExceededError"];
let assertExportFormatAllowed: QuotasModule["assertExportFormatAllowed"];

beforeAll(async () => {
mock.module("../db", () => ({
  db: {
    subscription: {
      findUnique: mock((args: any) =>
        Promise.resolve(args?.where?.userId === "owner-1" ? mockOwnerSub : mockSub)
      ),
      updateMany: mock((args: any) => {
        const field = Object.keys(args.data)[0];
        const amount = (args.data[field] as any).increment;
        updateManyCalls.push({ userId: args.where.userId, field, amount });
        return Promise.resolve({ count: 1 });
      }),
    },
    user: {
      findUnique: mock(() => Promise.resolve(mockUser)),
    },
    workspaceMember: {
      findFirst: mock(() => Promise.resolve(mockOwner)),
    },
    billingRecord: {
      count: mock(() => Promise.resolve(mockPaidRecords)),
    },
    paymentCheckout: {
      count: mock(() => Promise.resolve(0)),
    },
  },
}));

({
  assertWithinQuota,
  bumpUsage,
  quotaFailureCode,
  QuotaExceededError,
  assertExportFormatAllowed,
} = await import("../quotas"));
});

function resetMockState() {
  mockSub = null;
  mockOwnerSub = null;
  mockOwner = null;
  mockUser = null;
  mockPaidRecords = 0;
  updateManyCalls = [];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const inDays = (days: number) => new Date(Date.now() + days * DAY_MS);

function makePlan(overrides: any = {}) {
  return {
    id: "plan-1",
    name: "STARTER",
    maxDocuments: 10,
    maxProposals: 10,
    maxStorageGb: 5,
    maxTokensPerMonth: 100000,
    ...overrides,
  };
}

function makeSub(overrides: any = {}) {
  return {
    id: "sub-1",
    userId: "user-1",
    status: "ACTIVE",
    planId: "plan-1",
    // A period still running: without it an unpaid ACTIVE Starter row reads
    // as a lapsed legacy trial, which is exactly the case tested further down.
    currentPeriodEnd: inDays(20),
    trialEndsAt: null,
    documentsUsed: 0,
    proposalsUsed: 0,
    storageUsedBytes: 0,
    tokensUsed: 0,
    plan: makePlan(),
    ...overrides,
  };
}

describe("assertWithinQuota", () => {
  test("allows admin user without subscription", async () => {
    resetMockState();
    mockSub = null;
    mockUser = { id: "user-1", role: "SUPER_ADMIN" };
    await expect(assertWithinQuota("user-1", "document")).resolves.toBeUndefined();
  });

  test("allows ADMIN user without subscription", async () => {
    resetMockState();
    mockSub = null;
    mockUser = { id: "user-1", role: "ADMIN" };
    await expect(assertWithinQuota("user-1", "proposal")).resolves.toBeUndefined();
  });

  test("throws INACTIVE for non-admin without subscription", async () => {
    resetMockState();
    mockSub = null;
    mockUser = { id: "user-1", role: "MEMBER" };
    await expect(assertWithinQuota("user-1", "document")).rejects.toThrow(
      QuotaExceededError
    );
    try {
      await assertWithinQuota("user-1", "document");
    } catch (e: any) {
      expect(e.code).toBe("INACTIVE");
    }
  });

  test("throws INACTIVE when subscription status is not ACTIVE/TRIALING", async () => {
    resetMockState();
    mockSub = makeSub({ status: "CANCELED" });
    await expect(assertWithinQuota("user-1", "document")).rejects.toThrow();
    try {
      await assertWithinQuota("user-1", "document");
    } catch (e: any) {
      expect(e.code).toBe("INACTIVE");
    }
  });

  test("allows TRIALING subscription", async () => {
    resetMockState();
    mockSub = makeSub({ status: "TRIALING", trialEndsAt: inDays(10) });
    await expect(assertWithinQuota("user-1", "document")).resolves.toBeUndefined();
  });

  test("a TRIALING subscription past trialEndsAt throws TRIAL_ENDED", async () => {
    // Arrange: the 30-day trial lapsed yesterday; the row was never renewed.
    resetMockState();
    mockSub = makeSub({
      status: "TRIALING",
      trialEndsAt: inDays(-1),
      currentPeriodEnd: inDays(-1),
    });
    // Act / Assert
    try {
      await assertWithinQuota("user-1", "document");
      throw new Error("expected TRIAL_ENDED");
    } catch (e: any) {
      expect(e).toBeInstanceOf(QuotaExceededError);
      expect(e.code).toBe("TRIAL_ENDED");
      expect(quotaFailureCode(e)).toBe("TRIAL_ENDED");
    }
  });

  test("a legacy ACTIVE Starter row that never paid ends with its period", async () => {
    // Arrange: written before trials carried a status, period long gone, no
    // PAID record anywhere. Under the old gate this was free forever.
    resetMockState();
    mockPaidRecords = 0;
    mockSub = makeSub({ status: "ACTIVE", currentPeriodEnd: inDays(-3) });
    try {
      await assertWithinQuota("user-1", "proposal");
      throw new Error("expected TRIAL_ENDED");
    } catch (e: any) {
      expect(e.code).toBe("TRIAL_ENDED");
    }
  });

  test("a paid ACTIVE Starter row is entitled even when its period date passed", async () => {
    // A settled payment means it is a customer, not a trial; period lapse is
    // the renewal machinery's business, not the quota gate's.
    resetMockState();
    mockPaidRecords = 1;
    mockSub = makeSub({ status: "ACTIVE", currentPeriodEnd: inDays(-3) });
    await expect(assertWithinQuota("user-1", "proposal")).resolves.toBeUndefined();
  });

  test("the bootstrap admin's own seeded Starter row never trips TRIAL_ENDED", async () => {
    resetMockState();
    mockUser = { id: "user-1", role: "SUPER_ADMIN", activeWorkspaceId: null };
    mockSub = makeSub({ status: "ACTIVE", currentPeriodEnd: inDays(-400) });
    await expect(assertWithinQuota("user-1", "document")).resolves.toBeUndefined();
  });

  test("a member is governed by the workspace owner's subscription", async () => {
    // Arrange: the member's own Starter row is at its document cap, the
    // owner's Pro row is not. Before this, the member was capped at Starter.
    resetMockState();
    mockUser = { id: "user-1", role: "MEMBER", activeWorkspaceId: "ws-1" };
    mockOwner = { userId: "owner-1" };
    mockSub = makeSub({ documentsUsed: 50, plan: makePlan({ maxDocuments: 50 }) });
    mockOwnerSub = makeSub({
      id: "sub-owner",
      userId: "owner-1",
      documentsUsed: 100,
      plan: makePlan({ id: "plan-pro", name: "PRO", maxDocuments: 250 }),
    });
    // Act / Assert: the owner's allowance is what binds.
    await expect(assertWithinQuota("user-1", "document")).resolves.toBeUndefined();

    // ...and the owner's row is what a bump consumes.
    await bumpUsage("user-1", "document");
    expect(updateManyCalls).toEqual([
      { userId: "owner-1", field: "documentsUsed", amount: 1 },
    ]);
  });

  test("an owner's spent allowance binds every member, however many were invited", async () => {
    resetMockState();
    mockUser = { id: "user-1", role: "MEMBER", activeWorkspaceId: "ws-1" };
    mockOwner = { userId: "owner-1" };
    mockSub = makeSub({ documentsUsed: 0 });
    mockOwnerSub = makeSub({
      id: "sub-owner",
      userId: "owner-1",
      documentsUsed: 50,
      plan: makePlan({ maxDocuments: 50 }),
    });
    try {
      await assertWithinQuota("user-1", "document");
      throw new Error("expected DOCUMENTS");
    } catch (e: any) {
      expect(e.code).toBe("DOCUMENTS");
    }
  });

  test("falls back to the user's own subscription when the owner holds none", async () => {
    resetMockState();
    mockUser = { id: "user-1", role: "MEMBER", activeWorkspaceId: "ws-1" };
    mockOwner = { userId: "owner-1" };
    mockOwnerSub = null;
    mockSub = makeSub({ documentsUsed: 3 });
    await expect(assertWithinQuota("user-1", "document")).resolves.toBeUndefined();
    await bumpUsage("user-1", "document");
    expect(updateManyCalls[0].userId).toBe("user-1");
  });

  test("throws DOCUMENTS when document quota exceeded", async () => {
    resetMockState();
    mockSub = makeSub({ documentsUsed: 10 });
    await expect(assertWithinQuota("user-1", "document")).rejects.toThrow();
    try {
      await assertWithinQuota("user-1", "document");
    } catch (e: any) {
      expect(e.code).toBe("DOCUMENTS");
    }
  });

  test("allows document when under limit", async () => {
    resetMockState();
    mockSub = makeSub({ documentsUsed: 5 });
    await expect(assertWithinQuota("user-1", "document")).resolves.toBeUndefined();
  });

  test("throws PROPOSALS when proposal quota exceeded", async () => {
    resetMockState();
    mockSub = makeSub({ proposalsUsed: 10 });
    await expect(assertWithinQuota("user-1", "proposal")).rejects.toThrow();
    try {
      await assertWithinQuota("user-1", "proposal");
    } catch (e: any) {
      expect(e.code).toBe("PROPOSALS");
    }
  });

  test("allows proposal when under limit", async () => {
    resetMockState();
    mockSub = makeSub({ proposalsUsed: 3 });
    await expect(assertWithinQuota("user-1", "proposal")).resolves.toBeUndefined();
  });

  test("throws STORAGE when storage bytes exceed quota", async () => {
    resetMockState();
    const maxBytes = 5 * 1024 * 1024 * 1024;
    mockSub = makeSub({ storageUsedBytes: maxBytes });
    await expect(
      assertWithinQuota("user-1", "storage", { bytes: 1024 })
    ).rejects.toThrow();
    try {
      await assertWithinQuota("user-1", "storage", { bytes: 1024 });
    } catch (e: any) {
      // Not "TOKENS": a reader who filled their disk must not be told they ran
      // out of AI usage, because the fix for one is not the fix for the other.
      expect(e.code).toBe("STORAGE");
      expect(quotaFailureCode(e)).toBe("QUOTA_STORAGE_EXCEEDED");
    }
  });

  test("a spent token budget does not block an upload", async () => {
    resetMockState();
    mockSub = makeSub({ tokensUsed: 999999, storageUsedBytes: 0 });
    await expect(
      assertWithinQuota("user-1", "storage", { bytes: 1024 })
    ).resolves.toBeUndefined();
  });

  test("accumulated storage plus the incoming file is what counts", async () => {
    resetMockState();
    const maxBytes = 5 * 1024 * 1024 * 1024;
    // Neither the stored bytes nor the new file exceeds the plan on its own;
    // together they do. This is the case a per-file size check cannot catch.
    mockSub = makeSub({ storageUsedBytes: maxBytes - 1024 });
    await expect(
      assertWithinQuota("user-1", "storage", { bytes: 4096 })
    ).rejects.toThrow(QuotaExceededError);
  });

  test("a drifted negative counter does not read as free space", async () => {
    resetMockState();
    mockSub = makeSub({ storageUsedBytes: -(10 * 1024 * 1024 * 1024) });
    await expect(
      assertWithinQuota("user-1", "storage", { bytes: 6 * 1024 * 1024 * 1024 })
    ).rejects.toThrow(QuotaExceededError);
  });

  test("allows storage when within limit", async () => {
    resetMockState();
    mockSub = makeSub({ storageUsedBytes: 0 });
    await expect(
      assertWithinQuota("user-1", "storage", { bytes: 1024 })
    ).resolves.toBeUndefined();
  });

  test("throws TOKENS when token quota exceeded", async () => {
    resetMockState();
    mockSub = makeSub({ tokensUsed: 100000 });
    await expect(
      assertWithinQuota("user-1", "tokens", { tokens: 1 })
    ).rejects.toThrow();
    try {
      await assertWithinQuota("user-1", "tokens", { tokens: 1 });
    } catch (e: any) {
      expect(e.code).toBe("TOKENS");
    }
  });

  test("allows tokens when under limit", async () => {
    resetMockState();
    mockSub = makeSub({ tokensUsed: 50000 });
    await expect(
      assertWithinQuota("user-1", "tokens", { tokens: 1000 })
    ).resolves.toBeUndefined();
  });

  test("allows when plan maxDocuments is 0 (unlimited)", async () => {
    resetMockState();
    mockSub = makeSub({ documentsUsed: 999, plan: makePlan({ maxDocuments: 0 }) });
    await expect(assertWithinQuota("user-1", "document")).resolves.toBeUndefined();
  });

  test("QuotaExceededError has correct name", () => {
    const err = new QuotaExceededError("test", "DOCUMENTS");
    expect(err.name).toBe("QuotaExceededError");
    expect(err.code).toBe("DOCUMENTS");
  });
});

describe("quotaFailureCode", () => {
  // TRIAL_ENDED is absent on purpose: its internal enum *is* its registry key,
  // so the "raw enum is not a sentence" half of the loop does not apply to it.
  // Its mapping is asserted separately below.
  const CODES = [
    "DOCUMENTS",
    "PROPOSALS",
    "STORAGE",
    "TOKENS",
    "INACTIVE",
  ] as const;

  test("TRIAL_ENDED maps to its own bilingual sentence", async () => {
    const { legacyFailureBody } = await import("../api-failure");
    const generic = legacyFailureBody(null).message;
    const mapped = legacyFailureBody(
      quotaFailureCode(new QuotaExceededError("internal", "TRIAL_ENDED"))
    ).message;
    expect(mapped).not.toEqual(generic);
    expect(mapped.ar).toContain("التجريبية");
    expect(mapped.en).toContain("trial has ended");
  });

  test("every quota code resolves to a real bilingual sentence", async () => {
    // The internal enum is not a registry key. A route that answers 402 with
    // `err.code` instead of this mapping hands the reader the generic
    // internal-error sentence and no clue which limit they hit.
    const { legacyFailureBody } = await import("../api-failure");
    const generic = legacyFailureBody(null).message;

    for (const code of CODES) {
      const raw = legacyFailureBody(code).message;
      expect(raw).toEqual(generic);

      const mapped = legacyFailureBody(
        quotaFailureCode(new QuotaExceededError("internal", code))
      ).message;
      expect(mapped).not.toEqual(generic);
      expect(mapped.ar.trim().length).toBeGreaterThan(0);
      expect(mapped.en.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("bumpUsage", () => {
  test("increments documentsUsed for document kind", async () => {
    resetMockState();
    await bumpUsage("user-1", "document", 2);
    expect(updateManyCalls.length).toBe(1);
    expect(updateManyCalls[0].field).toBe("documentsUsed");
    expect(updateManyCalls[0].amount).toBe(2);
  });

  test("increments proposalsUsed for proposal kind", async () => {
    resetMockState();
    await bumpUsage("user-1", "proposal", 1);
    expect(updateManyCalls[0].field).toBe("proposalsUsed");
  });

  test("increments storageUsedBytes for storage kind", async () => {
    resetMockState();
    await bumpUsage("user-1", "storage", 512);
    expect(updateManyCalls[0].field).toBe("storageUsedBytes");
    expect(updateManyCalls[0].amount).toBe(512);
  });

  test("increments tokensUsed for tokens kind", async () => {
    resetMockState();
    await bumpUsage("user-1", "tokens", 500);
    expect(updateManyCalls[0].field).toBe("tokensUsed");
    expect(updateManyCalls[0].amount).toBe(500);
  });

  test("defaults amount to 1", async () => {
    resetMockState();
    await bumpUsage("user-1", "document");
    expect(updateManyCalls[0].amount).toBe(1);
  });

  test("swallows errors silently", async () => {
    resetMockState();
    // Force updateMany to throw
    const { db } = await import("../db");
    (db.subscription.updateMany as any).mockImplementation(() =>
      Promise.reject(new Error("DB error"))
    );
    await expect(bumpUsage("user-1", "document")).resolves.toBeUndefined();
    // Restore
    (db.subscription.updateMany as any).mockImplementation((args: any) => {
      const field = Object.keys(args.data)[0];
      const amount = (args.data[field] as any).increment;
      updateManyCalls.push({ userId: args.where.userId, field, amount });
      return Promise.resolve({ count: 1 });
    });
  });
});

describe("assertExportFormatAllowed", () => {
  const starterFeatures = JSON.stringify(["basic_agents", "pdf_export"]);
  const proFeatures = JSON.stringify(["all_agents", "pptx_pdf_xlsx_export"]);

  test("a Starter trial may download PDF but not PPTX, and the 402 carries the contract code", async () => {
    resetMockState();
    mockUser = { id: "user-1", role: "BIDDER", activeWorkspaceId: null };
    mockSub = makeSub({ status: "TRIALING", trialEndsAt: inDays(10), plan: makePlan({ featuresJson: starterFeatures }) });
    await expect(assertExportFormatAllowed("user-1", "pdf")).resolves.toBeUndefined();
    try {
      await assertExportFormatAllowed("user-1", "pptx");
      throw new Error("expected a QuotaExceededError");
    } catch (err) {
      expect(err).toBeInstanceOf(QuotaExceededError);
      expect(quotaFailureCode(err as InstanceType<typeof QuotaExceededError>)).toBe(
        "EXPORT_FORMAT_NOT_IN_PLAN"
      );
    }
  });

  test("a teammate is gated by the workspace owner's Pro plan, not their own Starter", async () => {
    resetMockState();
    mockUser = { id: "user-1", role: "BIDDER", activeWorkspaceId: "ws-1" };
    mockOwner = { userId: "owner-1" };
    mockOwnerSub = makeSub({ id: "sub-owner", userId: "owner-1", plan: makePlan({ name: "PRO", featuresJson: proFeatures }) });
    mockSub = makeSub({ plan: makePlan({ featuresJson: starterFeatures }) });
    await expect(assertExportFormatAllowed("user-1", "xlsx")).resolves.toBeUndefined();
  });

  test("a lapsed trial is refused with TRIAL_ENDED before the format is even considered", async () => {
    resetMockState();
    mockUser = { id: "user-1", role: "BIDDER", activeWorkspaceId: null };
    mockSub = makeSub({ status: "TRIALING", trialEndsAt: inDays(-1), plan: makePlan({ featuresJson: proFeatures }) });
    await expect(assertExportFormatAllowed("user-1", "pdf")).rejects.toMatchObject({ code: "TRIAL_ENDED" });
  });

  test("a platform admin with no subscription is not gated", async () => {
    resetMockState();
    mockUser = { id: "user-1", role: "SUPER_ADMIN" };
    await expect(assertExportFormatAllowed("user-1", "docx")).resolves.toBeUndefined();
  });
});
