import { db } from "./db";
import { COMPLIANCE_FRAMEWORKS, AI_PROVIDER_PRESETS, ENV_CATALOG, DEFAULT_PLANS } from "./constants";
import { encryptValue, assertProductionSecrets } from "./crypto";
import { hashPassword, getBootstrapAdminPassword } from "./password";
import { ensureDatabaseReady } from "./ensure-db";

// Ensures default workspace + SUPER_ADMIN exist when BOOTSTRAP_ADMIN_PASSWORD is set.
// Auth gate is enforced by NextAuth middleware — this only seeds data.

const WORKSPACE_SLUG = "default-workspace";

function bootstrapAdminEmail(): string {
  return (process.env.BOOTSTRAP_ADMIN_EMAIL || "admin@arabclue.com").trim().toLowerCase();
}

let cachedBootstrap: Awaited<ReturnType<typeof runBootstrap>> | null = null;

/** Clear bootstrap cache after ephemeral DB is replaced (Vercel /tmp). */
export function resetBootstrapCache() {
  cachedBootstrap = null;
}

export async function getBootstrapContext() {
  assertProductionSecrets();
  await ensureDatabaseReady();
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
        name: "Khalid Al-Otaibi",
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
        name: "Al-Saud Digital Ventures",
        nameAr: "آل سعود للمشاريع الرقمية",
        slug: WORKSPACE_SLUG,
        plan: "ENTERPRISE",
        crNumber: "1010234567",
        vatNumber: "300012345600003",
        brandProfiles: {
          create: {
            logoUrl: "",
            primaryColor: "#1E3A8A",
            secondaryColor: "#0F172A",
            accentColor: "#0EA5E9",
            fontFamily: "IBM Plex Sans Arabic",
            tagline: "Engineering Saudi Arabia's Digital Future",
            taglineAr: "نبني المستقبل الرقمي للمملكة العربية السعودية",
            vision2030Alignment: "thriving-economy",
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

    const ppCount = await db.pastProject.count({ where: { workspaceId: workspace.id } });
    if (ppCount === 0 && workspace.brandProfiles[0]) {
      await seedPastProjects(workspace.id, workspace.brandProfiles[0].id);
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
        name: "Khalid Al-Otaibi",
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
    // Activate one provider per engine (first preset that targets that engine)
    const activeEngines = new Set<string>();
    await db.aIProviderConfig.createMany({
      data: AI_PROVIDER_PRESETS.map((p, i) => {
        const engine = p.engine ?? "DEFAULT";
        const isActive = !activeEngines.has(engine);
        if (isActive) activeEngines.add(engine);
        return {
          ...p,
          engine,
          apiKeyEnvKey: p.apiKeyEnvKey || null,
          isActive,
          isDefault: i === 0,
          priority: isActive ? 10 : 0,
          topP: 0.9,
          frequencyPenalty: 0.0,
          presencePenalty: 0.0,
          confidenceThreshold: 0.85,
          toxicityFilter: true,
          piiFilter: true,
          hallucinationGuard: true,
          maxRetries: 2,
          timeoutMs: 60000,
        };
      }),
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
        isSecret:
          e.key.includes("KEY") ||
          e.key.includes("SECRET") ||
          e.key.includes("PASSWORD"),
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
    const entPlan = await db.subscriptionPlan.findFirst({ where: { name: "ENTERPRISE" } });
    if (entPlan) {
      const now = new Date();
      await db.subscription.create({
        data: {
          userId,
          planId: entPlan.id,
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

async function seedPastProjects(workspaceId: string, brandProfileId: string) {
  const projects = [
    {
      title: "Ministry of Health — National EHR Platform",
      titleAr: "وزارة الصحة — المنصة الوطنية للسجلات الصحية",
      clientName: "Ministry of Health",
      clientNameAr: "وزارة الصحة",
      sector: "HEALTH",
      contractValue: 48000000,
      outcome: "SUCCESSFUL",
      summary:
        "Delivered a nationwide Electronic Health Records platform serving 280+ hospitals and 2,300 PHCs. Achieved 99.95% uptime, full PDPL compliance, and ISO 27001 certification. Integrated with Sehaty and Tawakkalna via NPHI.",
      summaryAr:
        "تسليم منصة السجلات الصحية الإلكترونية الوطنية تخدم أكثر من 280 مستشفى و 2300 مركز رعاية أولية. تحقيق نسبة توفر 99.95%، وامتثال كامل لـ PDPL، وشهادة ISO 27001.",
      tags: "EHR,Healthcare,PDPL,NPHI,Saudi Cloud",
    },
    {
      title: "Saudi Telecom Company — 5G Core Orchestration",
      titleAr: "شركة الاتصالات السعودية — تنسيق نواة الجيل الخامس",
      clientName: "Saudi Telecom Company (STC)",
      clientNameAr: "مجموعة إس تي سي",
      sector: "TELECOM",
      contractValue: 75000000,
      outcome: "SUCCESSFUL",
      summary:
        "Built cloud-native 5G core orchestration layer on STC Cloud with Zero Trust architecture. Reduced provisioning time by 78%, implemented full CCC-1:2020 compliance, and deployed across 3 KSA regions.",
      summaryAr:
        "بناء طبقة تنسيق نواة الجيل الخامس السحابية على سحابة إس تي سي بمعمارية الثقة المعدومة. تقليل وقت التجهيز بنسبة 78% وتطبيق الامتثال الكامل لـ CCC-1:2020.",
      tags: "5G,Telecom,Zero Trust,STC Cloud,CCC-1",
    },
    {
      title: "Saudi Arabian Monetary Authority — RegTech Platform",
      titleAr: "البنك المركزي السعودي — منصة تقنية التنظيم",
      clientName: "Saudi Central Bank (SAMA)",
      clientNameAr: "البنك المركزي السعودي",
      sector: "FINANCE",
      contractValue: 62000000,
      outcome: "SUCCESSFUL",
      summary:
        "Implemented a regulatory technology platform for SAMA monitoring 24 banks. Real-time fraud detection with ML, 100% data residency in KSA, full SAMA Cyber Security Framework compliance.",
      summaryAr:
        "تنفيذ منصة تقنية التنظيم للبنك المركزي السعودي لمراقبة 24 بنك. كشف الاحتيال في الوقت الفعلي بنماذج تعلم الآلة، وإقامة بيانات كاملة في المملكة.",
      tags: "RegTech,Finance,SAMA,Fraud Detection,KSA Residency",
    },
    {
      title: "NECOM — Smart City Data Fabric",
      titleAr: "نيوم — نسيج بيانات المدينة الذكية",
      clientName: "NECOM Company",
      clientNameAr: "شركة نيوم",
      sector: "GOV",
      contractValue: 120000000,
      outcome: "ONGOING",
      summary:
        "Designing a unified data fabric for NEOM's smart city initiatives. Edge computing, digital twin integration, and sovereign AI workloads. Currently in Phase 2 of 4 with 100% Saudization target on engineering roles.",
      summaryAr:
        "تصميم نسيج بيانات موحد لمبادرات نيوم للمدينة الذكية. حوسبة طرفية، تكامل التوائم الرقمية، وأحمال ذكاء اصطناعي سيادية.",
      tags: "Smart City,NEOM,Edge Computing,Digital Twin,AI",
    },
  ];

  for (const p of projects) {
    try {
      const { localEmbedText } = await import("./llm");
      const embedding = localEmbedText(
        `${p.title}\n${p.summary}\n${p.sector}\n${p.tags}`
      );
      await db.pastProject.create({
        data: {
          workspaceId,
          brandProfileId,
          ...p,
          currency: "SAR",
          startDate: new Date("2022-01-01"),
          endDate: new Date("2024-06-30"),
          embeddingJson: JSON.stringify(embedding),
        },
      });
    } catch {
      /* ignore duplicate seed races */
    }
  }
}

export async function seedComplianceChecks(projectId: string) {
  const existing = await db.complianceCheck.count({ where: { projectId } });
  if (existing > 0) return;

  const checks: {
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
      checks.push({
        projectId,
        framework: fw.id,
        controlId: ctrl.controlId,
        title: ctrl.title,
        titleAr: ctrl.titleAr,
        requirement: ctrl.requirement,
        status: "PENDING",
        complianceLevel: ctrl.level,
      });
    }
  }
  await db.complianceCheck.createMany({ data: checks }).catch(() => {});
}
