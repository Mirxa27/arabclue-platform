import { db } from "./db";
import {
  COMPLIANCE_FRAMEWORKS,
  AI_PROVIDER_PRESETS,
  ENV_CATALOG,
  DEFAULT_PLANS,
  isSecretEnvKey,
} from "./constants";
import { encryptValue, assertProductionSecrets } from "./crypto";
import { hashPassword, getBootstrapAdminPassword } from "./password";
import { ensureDatabaseReady } from "./ensure-db";
import {
  isProductionBlockedDevelopmentIdentity,
  isProductionRuntime,
} from "./production-identities";

// Ensures default workspace + SUPER_ADMIN exist when BOOTSTRAP_ADMIN_PASSWORD is set.
// Auth gate is enforced by NextAuth middleware — this only seeds data.

const WORKSPACE_SLUG = "default-workspace";
let productionIdentitySweepComplete = false;

function bootstrapAdminEmail(): string {
  const email = (process.env.BOOTSTRAP_ADMIN_EMAIL || "admin@arabclue.com")
    .trim()
    .toLowerCase();
  if (isProductionBlockedDevelopmentIdentity(email)) {
    throw new Error(
      "BOOTSTRAP_ADMIN_EMAIL cannot use a reserved development identity in production"
    );
  }
  return email;
}

async function disableProductionDevelopmentIdentities(): Promise<void> {
  if (!isProductionRuntime()) return;
  // Local/dev hosts sharing a remote DB must keep seeded @arabclue.local accounts
  // usable for e2e and AGENTS.md login — only sweep real production hosts.
  const authUrl = (process.env.NEXTAUTH_URL || process.env.APP_URL || "").toLowerCase();
  if (
    authUrl.includes("localhost") ||
    authUrl.includes("127.0.0.1") ||
    process.env.ALLOW_DEV_IDENTITIES === "1"
  ) {
    return;
  }
  if (productionIdentitySweepComplete) return;
  await db.$transaction(async (tx) => {
    const reservedUsers = await tx.user.findMany({
      where: { email: { endsWith: "@arabclue.local" } },
      select: { id: true, active: true },
    });
    const ids = reservedUsers.map((user) => user.id);
    if (ids.length === 0) return;
    await tx.userSession.deleteMany({ where: { userId: { in: ids } } });
    const activeUsers = reservedUsers.filter((user) => user.active);
    for (const user of activeUsers) {
      const disabled = await tx.user.updateMany({
        where: { id: user.id, active: true },
        data: { active: false },
      });
      if (disabled.count !== 1) continue;
      await tx.auditLog.create({
        data: {
          action: "SECURITY_DEV_IDENTITY_DISABLED",
          resource: "User",
          resourceId: user.id,
          details: JSON.stringify({
            reason: "reserved_development_identity_in_production",
            wasActive: true,
          }),
          severity: "CRITICAL",
          success: true,
        },
      });
    }
  });
  productionIdentitySweepComplete = true;
}

let cachedBootstrap: Awaited<ReturnType<typeof runBootstrap>> | null = null;

/** Clear bootstrap cache after ephemeral DB is replaced (Vercel /tmp). */
export function resetBootstrapCache() {
  cachedBootstrap = null;
  productionIdentitySweepComplete = false;
}

export async function getBootstrapContext() {
  assertProductionSecrets();
  await ensureDatabaseReady();
  await disableProductionDevelopmentIdentities();
  if (cachedBootstrap) return cachedBootstrap;
  cachedBootstrap = await runBootstrap();
  return cachedBootstrap;
}

async function runBootstrap() {
  const USER_EMAIL = bootstrapAdminEmail();
  let workspace = await db.workspace.findFirst({
    where: { slug: WORKSPACE_SLUG },
    include: { brandProfiles: true },
  });

  const bootstrapPassword = getBootstrapAdminPassword();
  let passwordHash: string | null = null;
  if (bootstrapPassword) {
    passwordHash = await hashPassword(bootstrapPassword);
  }

  if (!workspace) {
    if (!passwordHash) {
      throw new Error(
        "BOOTSTRAP_ADMIN_PASSWORD is required to seed the initial workspace (min 10 chars)"
      );
    }
    const user = await db.user.upsert({
      where: { email: USER_EMAIL },
      update: {},
      create: {
        email: USER_EMAIL,
        name: "Workspace Administrator",
        passwordHash,
        role: "SUPER_ADMIN",
        mfaEnabled: false,
        locale: "ar",
        mustChangePassword: true,
      },
    });

    workspace = await db.workspace.upsert({
      where: { slug: WORKSPACE_SLUG },
      update: {},
      create: {
        name: "Untitled Workspace",
        nameAr: "مساحة عمل غير مسماة",
        slug: WORKSPACE_SLUG,
        plan: "STARTER",
        crNumber: null,
        vatNumber: null,
        brandProfiles: {
          create: {
            logoUrl: "",
            primaryColor: "#1E3A8A",
            secondaryColor: "#0F172A",
            accentColor: "#0EA5E9",
            fontFamily: "IBM Plex Sans Arabic",
            tagline: null,
            taglineAr: null,
            vision2030Alignment: null,
          },
        },
        members: {
          create: { userId: user.id, role: "OWNER" },
        },
      },
      include: { brandProfiles: true },
    });

    const existingMember = await db.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
    });
    if (!existingMember) {
      await db.workspaceMember
        .create({
          data: { workspaceId: workspace.id, userId: user.id, role: "OWNER" },
        })
        .catch(() => {});
    }

  }

  let user = await db.user.findUnique({ where: { email: USER_EMAIL } });
  if (!user) {
    if (!passwordHash) {
      throw new Error(
        "BOOTSTRAP_ADMIN_PASSWORD is required to create the bootstrap admin user"
      );
    }
    user = await db.user.create({
      data: {
        email: USER_EMAIL,
        name: "Workspace Administrator",
        passwordHash,
        role: "SUPER_ADMIN",
        mfaEnabled: false,
        locale: "ar",
        mustChangePassword: true,
      },
    });
  } else if (
    user.passwordHash.startsWith("$argon2id$demo$") ||
    user.passwordHash.includes("placeholder")
  ) {
    if (!passwordHash) {
      throw new Error(
        "Legacy demo password detected — set BOOTSTRAP_ADMIN_PASSWORD to migrate"
      );
    }
    user = await db.user.update({
      where: { id: user.id },
      data: { passwordHash, mfaEnabled: false, mustChangePassword: true },
    });
  }

  const member = await db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
  });
  if (!member) {
    await db.workspaceMember
      .create({ data: { workspaceId: workspace.id, userId: user.id, role: "OWNER" } })
      .catch(() => {});
  }

  await seedAdminData(user.id).catch(() => {});
  await seedOnboardingDefaults(workspace.id, user.id).catch(() => {});

  const brandProfile = workspace.brandProfiles[0];
  return { workspace, brandProfile, user };
}

/** Ensure required onboarding steps exist so proposal generation can run. */
export async function seedOnboardingDefaults(
  workspaceId: string,
  ownerUserId: string
) {
  const policy = await db.approvalPolicy.findUnique({
    where: { workspaceId },
    include: { steps: true },
  });
  if (!policy) {
    await db.approvalPolicy.create({
      data: {
        workspaceId,
        steps: {
          create: {
            stepIndex: 0,
            reviewerId: ownerUserId,
            stepRole: "FINAL",
          },
        },
      },
    });
  } else if (policy.steps.length === 0) {
    await db.approvalStep.create({
      data: {
        policyId: policy.id,
        stepIndex: 0,
        reviewerId: ownerUserId,
        stepRole: "FINAL",
      },
    });
  }

  await db.onboardingProgress.upsert({
    where: { workspaceId },
    create: {
      workspaceId,
      restrictionsReviewed: true,
      completedSteps: JSON.stringify({ restrictions: true }),
      readyForProposals: false,
    },
    update: {
      restrictionsReviewed: true,
    },
  });
}

async function seedAdminData(userId: string) {
  const providerCount = await db.aIProviderConfig.count();
  if (providerCount === 0) {
    // Seed connection templates only — inactive, no model IDs.
    // Admin must configure keys, fetch models, select, and activate.
    await db.aIProviderConfig.createMany({
      data: AI_PROVIDER_PRESETS.map((p, i) => ({
        name: p.name,
        provider: p.provider,
        modelId: "",
        apiBase: p.apiBase || null,
        apiKeyEnvKey: p.apiKeyEnvKey || null,
        engine: p.engine ?? "DEFAULT",
        enginesJson: JSON.stringify([p.engine ?? "DEFAULT"]),
        isActive: false,
        isDefault: i === 0,
        priority: 0,
        temperature: 0.2,
        maxTokens: 4096,
        contextWindow: 128000,
        supportsVision: false,
        supportsJsonMode: true,
        supportsTools: false,
        topP: 0.9,
        frequencyPenalty: 0.0,
        presencePenalty: 0.0,
        confidenceThreshold: 0.85,
        toxicityFilter: true,
        piiFilter: true,
        hallucinationGuard: true,
        maxRetries: 2,
        timeoutMs: 60000,
        inputCostPer1k: 0,
        outputCostPer1k: 0,
      })),
    });
  }

  const envCount = await db.envSetting.count();
  if (envCount === 0) {
    await db.envSetting.createMany({
      data: ENV_CATALOG.map((e) => ({
        key: e.key,
        valueEncrypted: encryptValue(
          e.key === "NEXTAUTH_SECRET"
            ? process.env.NEXTAUTH_SECRET ?? ""
            : e.key === "DATABASE_URL"
              ? process.env.DATABASE_URL ?? ""
              : e.key === "ARABCLUE_ENC_KEY"
                ? process.env.ARABCLUE_ENC_KEY ?? ""
                : ""
        ),
        category: e.category,
        description: e.description,
        // Allowlist, not a naming heuristic: the previous substring test
        // classified DATABASE_URL, REDIS_URL and BLOB_READ_WRITE_TOKEN as
        // non-secret and served them unmasked.
        isSecret: isSecretEnvKey(e.key),
        isRequired: e.isRequired,
        lastEditedBy: userId,
      })),
    });
  }

  // Ensure NEXTAUTH keys exist in catalog seed
  for (const key of ["NEXTAUTH_SECRET", "NEXTAUTH_URL"] as const) {
    const exists = await db.envSetting.findUnique({ where: { key } });
    if (!exists) {
      await db.envSetting.create({
        data: {
          key,
          valueEncrypted: encryptValue(
            key === "NEXTAUTH_SECRET"
              ? process.env.NEXTAUTH_SECRET ?? ""
              : process.env.NEXTAUTH_URL ?? "http://localhost:3000"
          ),
          category: "SECURITY",
          description: key === "NEXTAUTH_SECRET" ? "NextAuth JWT secret" : "NextAuth canonical URL",
          isSecret: key === "NEXTAUTH_SECRET",
          isRequired: true,
          lastEditedBy: userId,
        },
      });
    }
  }

  const planCount = await db.subscriptionPlan.count();
  if (planCount === 0) {
    await db.subscriptionPlan.createMany({ data: [...DEFAULT_PLANS] });
  }

  const existingSub = await db.subscription.findUnique({ where: { userId } });
  if (!existingSub) {
    const starterPlan = await db.subscriptionPlan.findFirst({ where: { name: "STARTER" } });
    if (starterPlan) {
      const now = new Date();
      await db.subscription.create({
        data: {
          userId,
          planId: starterPlan.id,
          status: "ACTIVE",
          billingCycle: "YEARLY",
          currentPeriodStart: now,
          currentPeriodEnd: new Date(now.getFullYear() + 1, now.getMonth(), now.getDate()),
          proposalsUsed: 0,
          documentsUsed: 0,
          tokensUsed: 0,
        },
      });
    }
  }
}

export async function seedComplianceChecks(projectId: string) {
  const existing = await db.complianceCheck.findMany({
    where: { projectId },
    select: {
      id: true,
      controlId: true,
      title: true,
      titleAr: true,
      requirement: true,
    },
  });
  const byControl = new Map(existing.map((row) => [row.controlId, row]));

  const toCreate: {
    projectId: string;
    framework: string;
    controlId: string;
    title: string;
    titleAr: string;
    requirement: string;
    status: string;
    complianceLevel: string;
  }[] = [];

  for (const fw of COMPLIANCE_FRAMEWORKS) {
    for (const ctrl of fw.controls) {
      const row = byControl.get(ctrl.controlId);
      if (!row) {
        toCreate.push({
          projectId,
          framework: fw.id,
          controlId: ctrl.controlId,
          title: ctrl.title,
          titleAr: ctrl.titleAr,
          requirement: ctrl.requirement,
          status: "PENDING",
          complianceLevel: ctrl.level,
        });
        continue;
      }
      // Refresh static label/requirement copy when catalog text changes
      if (
        row.title !== ctrl.title ||
        row.titleAr !== ctrl.titleAr ||
        row.requirement !== ctrl.requirement
      ) {
        await db.complianceCheck.update({
          where: { id: row.id },
          data: {
            title: ctrl.title,
            titleAr: ctrl.titleAr,
            requirement: ctrl.requirement,
            framework: fw.id,
            complianceLevel: ctrl.level,
          },
        });
      }
    }
  }

  if (toCreate.length) {
    await db.complianceCheck.createMany({ data: toCreate }).catch(() => {});
  }
}
