import { describe, expect, test } from "bun:test";
import { mock } from "bun:test";

// In-memory mock state for db
let mockSub: any = null;
let mockUser: any = null;
let updateManyCalls: Array<{ userId: string; field: string; amount: number }> = [];

mock.module("../db", () => ({
  db: {
    subscription: {
      findUnique: mock(() => Promise.resolve(mockSub)),
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
  },
}));

const { assertWithinQuota, bumpUsage, QuotaExceededError } = await import(
  "../quotas"
);

function resetMockState() {
  mockSub = null;
  mockUser = null;
  updateManyCalls = [];
}

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
    mockSub = makeSub({ status: "TRIALING" });
    await expect(assertWithinQuota("user-1", "document")).resolves.toBeUndefined();
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

  test("throws TOKENS when storage bytes exceed quota", async () => {
    resetMockState();
    const maxBytes = 5 * 1024 * 1024 * 1024;
    mockSub = makeSub({ storageUsedBytes: maxBytes });
    await expect(
      assertWithinQuota("user-1", "storage", { bytes: 1024 })
    ).rejects.toThrow();
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
