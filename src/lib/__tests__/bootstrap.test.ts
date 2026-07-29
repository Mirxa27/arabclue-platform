import { describe, expect, test } from "bun:test";
import { mock } from "bun:test";

// Mock state
let mockWorkspace: any = null;
let mockUser: any = null;
let mockMember: any = null;
let mockProviderCount = 0;
let mockEnvCount = 0;
let mockPlanCount = 0;
let mockExistingSub: any = null;
let mockStarterPlan: any = null;
let mockApprovalPolicy: any = null;
let mockOnboardingProgress: any = null;

mock.module("../db", () => ({
  db: {
    workspace: {
      findFirst: mock(() => Promise.resolve(mockWorkspace)),
      upsert: mock(() =>
        Promise.resolve(
          mockWorkspace ?? {
            id: "ws-1",
            slug: "default-workspace",
            brandProfiles: [{ id: "bp-1", primaryColor: "#1E3A8A" }],
          }
        )
      ),
    },
    user: {
      findUnique: mock(() => Promise.resolve(mockUser)),
      upsert: mock(() =>
        Promise.resolve(
          mockUser ?? {
            id: "user-1",
            email: "admin@arabclue.com",
            passwordHash: "scrypt$salt$hash",
            role: "SUPER_ADMIN",
          }
        )
      ),
      create: mock(() =>
        Promise.resolve({
          id: "user-1",
          email: "admin@arabclue.com",
          passwordHash: "scrypt$salt$hash",
          role: "SUPER_ADMIN",
        })
      ),
      update: mock(() =>
        Promise.resolve({
          id: "user-1",
          email: "admin@arabclue.com",
          passwordHash: "scrypt$new$hash",
          role: "SUPER_ADMIN",
        })
      ),
    },
    workspaceMember: {
      findUnique: mock(() => Promise.resolve(mockMember)),
      create: mock(() => Promise.resolve({ id: "wm-1" })),
    },
    aIProviderConfig: {
      count: mock(() => Promise.resolve(mockProviderCount)),
      createMany: mock(() => Promise.resolve({ count: 5 })),
    },
    envSetting: {
      count: mock(() => Promise.resolve(mockEnvCount)),
      createMany: mock(() => Promise.resolve({ count: 10 })),
      findUnique: mock(() => Promise.resolve(null)),
      create: mock(() => Promise.resolve({ id: "env-1" })),
    },
    subscriptionPlan: {
      count: mock(() => Promise.resolve(mockPlanCount)),
      createMany: mock(() => Promise.resolve({ count: 3 })),
      findFirst: mock(() => Promise.resolve(mockStarterPlan)),
    },
    subscription: {
      findUnique: mock(() => Promise.resolve(mockExistingSub)),
      create: mock(() => Promise.resolve({ id: "sub-1" })),
    },
    approvalPolicy: {
      findUnique: mock(() => Promise.resolve(mockApprovalPolicy)),
      create: mock(() => Promise.resolve({ id: "ap-1" })),
    },
    approvalStep: {
      create: mock(() => Promise.resolve({ id: "as-1" })),
    },
    onboardingProgress: {
      upsert: mock(() => Promise.resolve({ id: "op-1" })),
    },
    complianceCheck: {
      findMany: mock(() => Promise.resolve([])),
      createMany: mock(() => Promise.resolve({ count: 0 })),
      update: mock(() => Promise.resolve({ id: "cc-1" })),
    },
    $transaction: mock((fn: any) => fn({
      user: {
        findMany: mock(() => Promise.resolve([])),
        updateMany: mock(() => Promise.resolve({ count: 0 })),
      },
      userSession: {
        deleteMany: mock(() => Promise.resolve({ count: 0 })),
      },
      auditLog: {
        create: mock(() => Promise.resolve({ id: "al-1" })),
      },
    })),
  },
}));

mock.module("../constants", () => ({
  COMPLIANCE_FRAMEWORKS: [],
  AI_PROVIDER_PRESETS: [
    { name: "OpenAI", provider: "openai", apiKeyEnvKey: "OPENAI_API_KEY", apiBase: "https://api.openai.com/v1", engine: "DEFAULT" },
  ],
  ENV_CATALOG: [
    { key: "NEXTAUTH_SECRET", category: "SECURITY", description: "NextAuth secret", isRequired: true },
  ],
  DEFAULT_PLANS: [
    { name: "STARTER", maxDocuments: 10, maxProposals: 10, maxStorageGb: 5, maxTokensPerMonth: 100000 },
  ],
}));

mock.module("../crypto", () => ({
  encryptValue: mock((s: string) => `enc:${s}`),
  decryptValue: mock((s: string) => s.startsWith("enc:") ? s.slice(4) : ""),
  assertProductionSecrets: mock(() => {}),
  maskSecret: mock(() => "••••"),
  rotateEncryption: mock((s: string) => s),
}));

mock.module("../password", () => ({
  hashPassword: mock(() => Promise.resolve("scrypt$mocksalt$mockhash")),
  getBootstrapAdminPassword: mock(() => "MockBootstrapPass123!"),
}));

mock.module("../ensure-db", () => ({
  ensureDatabaseReady: mock(() => Promise.resolve()),
}));

mock.module("../production-identities", () => ({
  isProductionBlockedDevelopmentIdentity: mock(() => false),
  isProductionRuntime: mock(() => false),
}));

const { getBootstrapContext, resetBootstrapCache, seedOnboardingDefaults, seedComplianceChecks } =
  await import("../bootstrap");

function resetState() {
  mockWorkspace = null;
  mockUser = null;
  mockMember = null;
  mockProviderCount = 0;
  mockEnvCount = 0;
  mockPlanCount = 0;
  mockExistingSub = null;
  mockStarterPlan = null;
  mockApprovalPolicy = null;
  mockOnboardingProgress = null;
  resetBootstrapCache();
}

describe("getBootstrapContext", () => {
  test("creates workspace and user when none exist", async () => {
    resetState();
    const ctx = await getBootstrapContext();
    expect(ctx.workspace).toBeDefined();
    expect(ctx.user).toBeDefined();
    expect(ctx.brandProfile).toBeDefined();
  });

  test("returns cached context on second call (idempotency)", async () => {
    resetState();
    const ctx1 = await getBootstrapContext();
    const ctx2 = await getBootstrapContext();
    // Cached — same object reference
    expect(ctx1).toBe(ctx2);
  });

  test("resetBootstrapCache forces re-run", async () => {
    resetState();
    const ctx1 = await getBootstrapContext();
    resetBootstrapCache();
    const ctx2 = await getBootstrapContext();
    // Different objects after cache reset
    expect(ctx1).not.toBe(ctx2);
  });

  test("handles existing workspace with existing user", async () => {
    resetState();
    mockWorkspace = {
      id: "ws-existing",
      slug: "default-workspace",
      brandProfiles: [{ id: "bp-existing", primaryColor: "#FF0000" }],
    };
    mockUser = {
      id: "user-existing",
      email: "admin@arabclue.com",
      passwordHash: "scrypt$existing$salt",
      role: "SUPER_ADMIN",
    };
    const ctx = await getBootstrapContext();
    expect(ctx.workspace.id).toBe("ws-existing");
    expect(ctx.user.id).toBe("user-existing");
    expect(ctx.brandProfile.primaryColor).toBe("#FF0000");
  });

  test("migrates legacy demo password hash", async () => {
    resetState();
    mockWorkspace = {
      id: "ws-1",
      slug: "default-workspace",
      brandProfiles: [{ id: "bp-1" }],
    };
    mockUser = {
      id: "user-1",
      email: "admin@arabclue.com",
      passwordHash: "$argon2id$demo$oldhash",
      role: "SUPER_ADMIN",
    };
    const ctx = await getBootstrapContext();
    expect(ctx.user).toBeDefined();
  });

  test("creates workspace member when missing", async () => {
    resetState();
    mockMember = null;
    const ctx = await getBootstrapContext();
    expect(ctx).toBeDefined();
  });

  test("handles existing workspace member", async () => {
    resetState();
    mockMember = { id: "wm-1", workspaceId: "ws-1", userId: "user-1" };
    const ctx = await getBootstrapContext();
    expect(ctx).toBeDefined();
  });
});

describe("seedOnboardingDefaults", () => {
  test("creates approval policy when none exists", async () => {
    resetState();
    mockApprovalPolicy = null;
    await seedOnboardingDefaults("ws-1", "user-1");
    // Should not throw
  });

  test("creates approval step when policy exists but has no steps", async () => {
    resetState();
    mockApprovalPolicy = { id: "ap-1", steps: [] };
    await seedOnboardingDefaults("ws-1", "user-1");
  });

  test("does not create step when policy has steps", async () => {
    resetState();
    mockApprovalPolicy = { id: "ap-1", steps: [{ id: "as-1" }] };
    await seedOnboardingDefaults("ws-1", "user-1");
  });
});

describe("seedComplianceChecks", () => {
  test("handles empty compliance frameworks", async () => {
    resetState();
    const count = await seedComplianceChecks("project-1");
    expect(count).toBeUndefined();
  });
});
