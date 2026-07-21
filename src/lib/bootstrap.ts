import { db } from "./db";
import { COMPLIANCE_FRAMEWORKS, AI_PROVIDER_PRESETS, ENV_CATALOG, DEFAULT_PLANS } from "./constants";
import { encryptValue } from "./crypto";

// Ensure a default workspace + user exist for the demo (no auth gate on UI).
// Uses upsert to be safe under concurrent requests.
// In production this would be replaced by the MFA + RBAC login flow.

const WORKSPACE_SLUG = "default-workspace";
const USER_EMAIL = "admin@arabclue.sa";

export async function getBootstrapContext() {
  // Fast path: workspace already exists
  let workspace = await db.workspace.findFirst({
    where: { slug: WORKSPACE_SLUG },
    include: { brandProfiles: true },
  });

  if (!workspace) {
    // Upsert user (idempotent under concurrent requests)
    const user = await db.user.upsert({
      where: { email: USER_EMAIL },
      update: {},
      create: {
        email: USER_EMAIL,
        name: "Khalid Al-Otaibi",
        passwordHash: "$argon2id$demo$placeholder",
        role: "SUPER_ADMIN",
        mfaEnabled: true,
        locale: "ar",
      },
    });

    // Upsert workspace (idempotent on slug)
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

    // Link the user as a member if not already (handle case where workspace
    // existed via a prior partial create but member link is missing)
    const existingMember = await db.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
    });
    if (!existingMember) {
      await db.workspaceMember.create({
        data: { workspaceId: workspace.id, userId: user.id, role: "OWNER" },
      }).catch(() => {});
    }

    // Seed past projects only if none exist for this workspace
    const ppCount = await db.pastProject.count({ where: { workspaceId: workspace.id } });
    if (ppCount === 0 && workspace.brandProfiles[0]) {
      await seedPastProjects(workspace.id, workspace.brandProfiles[0].id);
    }
  }

  // Ensure the default user exists and is linked (handles pre-existing workspace)
  const user = await db.user.upsert({
    where: { email: USER_EMAIL },
    update: {},
    create: {
      email: USER_EMAIL,
      name: "Khalid Al-Otaibi",
      passwordHash: "$argon2id$demo$placeholder",
      role: "SUPER_ADMIN",
      mfaEnabled: true,
      locale: "ar",
    },
  });

  // Seed admin configuration (AI providers, env settings, plans) — idempotent
  await seedAdminData(user.id).catch(() => {});

  const brandProfile = workspace.brandProfiles[0];
  return { workspace, brandProfile, user };
}

// Seed AI provider configs, encrypted env settings, subscription plans,
// and the default user's subscription. Fully idempotent.
async function seedAdminData(userId: string) {
  // AI providers
  const providerCount = await db.aIProviderConfig.count();
  if (providerCount === 0) {
    await db.aIProviderConfig.createMany({
      data: AI_PROVIDER_PRESETS.map((p, i) => ({
        ...p,
        isActive: i === 0, // first preset (ZAI GLM-4.6) is active by default
        isDefault: i === 0,
        topP: 0.9,
        frequencyPenalty: 0.0,
        presencePenalty: 0.0,
        confidenceThreshold: 0.85,
        toxicityFilter: true,
        piiFilter: true,
        hallucinationGuard: true,
        maxRetries: 2,
        timeoutMs: 60000,
      })),
    });
  }

  // Env settings (encrypted, masked in UI)
  const envCount = await db.envSetting.count();
  if (envCount === 0) {
    await db.envSetting.createMany({
      data: ENV_CATALOG.map((e) => ({
        key: e.key,
        valueEncrypted: encryptValue(e.key.includes("KEY") || e.key.includes("SECRET") ? "sk-demo-" + e.key.toLowerCase().replace(/_/g, "") : ""),
        category: e.category,
        description: e.description,
        isSecret: e.key.includes("KEY") || e.key.includes("SECRET") || e.key.includes("PASSWORD"),
        isRequired: e.isRequired,
        lastEditedBy: userId,
      })),
    });
  }

  // Subscription plans
  const planCount = await db.subscriptionPlan.count();
  if (planCount === 0) {
    await db.subscriptionPlan.createMany({ data: DEFAULT_PLANS as any });
  }

  // Default user subscription (Enterprise plan)
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
    await db.pastProject.create({
      data: {
        workspaceId,
        brandProfileId,
        ...p,
        currency: "SAR",
        startDate: new Date("2022-01-01"),
        endDate: new Date("2024-06-30"),
      },
    }).catch(() => {});
  }
}

// Seed compliance checks for a project (deterministic, based on frameworks)
export async function seedComplianceChecks(projectId: string) {
  const existing = await db.complianceCheck.count({ where: { projectId } });
  if (existing > 0) return;

  const checks = [];
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
