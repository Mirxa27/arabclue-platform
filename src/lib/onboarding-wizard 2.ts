import { z } from "zod";

/**
 * Guided onboarding wizard — pure state machine and personalization logic.
 *
 * No React, no db, no fetch: the component layer owns IO while this module
 * owns step order, field validation, completion tracking, and the live
 * "personalizes as you answer" preview derivation. Everything here is
 * unit-testable in isolation.
 */

export const ONBOARDING_WIZARD_STEP_IDS = [
  "profile",
  "brand",
  "legal",
  "connect",
  "launch",
] as const;

export type OnboardingWizardStepId = (typeof ONBOARDING_WIZARD_STEP_IDS)[number];

export interface WizardStepMeta {
  readonly id: OnboardingWizardStepId;
  readonly en: string;
  readonly ar: string;
  readonly descriptionEn: string;
  readonly descriptionAr: string;
  readonly optional: boolean;
}

export const ONBOARDING_WIZARD_STEPS: readonly WizardStepMeta[] = Object.freeze([
  {
    id: "profile",
    en: "Your profile",
    ar: "ملفك التعريفي",
    descriptionEn:
      "Tell Arabclue who you are — every draft, review, and checklist is tailored to your role.",
    descriptionAr:
      "عرّف أراب كلاو بنفسك — كل مسودة ومراجعة وقائمة فحص تُخصّص حسب دورك.",
    optional: false,
  },
  {
    id: "brand",
    en: "Brand identity",
    ar: "الهوية البصرية",
    descriptionEn:
      "Your logo, colors, and tagline paint every proposal, cover page, and export.",
    descriptionAr:
      "شعارك وألوانك وشعارك النصي تُلوّن كل عرض وغلاف وملف تصدير.",
    optional: false,
  },
  {
    id: "legal",
    en: "Legal essentials",
    ar: "الأساسيات النظامية",
    descriptionEn:
      "Commercial registration and VAT numbers unlock qualification checks in every bid.",
    descriptionAr:
      "السجل التجاري والرقم الضريبي يفتحان فحوصات الأهلية في كل عطاء.",
    optional: false,
  },
  {
    id: "connect",
    en: "Connect & govern",
    ar: "الربط والحوكمة",
    descriptionEn:
      "Track an Etimad tender, set your approval chain, and acknowledge handling rules.",
    descriptionAr:
      "تتبع مناقصة على اعتماد، واضبط سلسلة الاعتماد، وأقر بقواعد التعامل.",
    optional: false,
  },
  {
    id: "launch",
    en: "First mission",
    ar: "أول مهمة",
    descriptionEn:
      "Pick where the AI agents start — proposals, qualification, or contracts.",
    descriptionAr:
      "اختر نقطة انطلاق الوكلاء الذكيين — العروض أو الأهلية أو العقود.",
    optional: false,
  },
]);

// ---------------------------------------------------------------------------
// Step 1: profile
// ---------------------------------------------------------------------------

export const WIZARD_ROLES = [
  "FOUNDER_EXEC",
  "BID_MANAGER",
  "TECHNICAL_LEAD",
  "PROPOSAL_WRITER",
  "OTHER",
] as const;

export type WizardRole = (typeof WIZARD_ROLES)[number];

export const WIZARD_SECTORS = [
  "GOV",
  "HEALTH",
  "FINANCE",
  "ENERGY",
  "TELECOM",
  "OTHER",
] as const;

export type WizardSector = (typeof WIZARD_SECTORS)[number];

export const wizardProfileSchema = z.object({
  name: z.string().trim().min(2).max(120),
  role: z.enum(WIZARD_ROLES),
  workspaceName: z.string().trim().min(2).max(200),
  workspaceNameAr: z.string().trim().max(200),
  sector: z.enum(WIZARD_SECTORS),
});

export type WizardProfile = z.infer<typeof wizardProfileSchema>;

// ---------------------------------------------------------------------------
// Step 2: brand
// ---------------------------------------------------------------------------

export const wizardBrandSchema = z.object({
  tagline: z.string().trim().max(160),
  taglineAr: z.string().trim().max(160),
  primaryColor: z.string().trim().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/),
});

export type WizardBrand = z.infer<typeof wizardBrandSchema>;

// ---------------------------------------------------------------------------
// Step 3: legal
// ---------------------------------------------------------------------------

export const wizardLegalSchema = z.object({
  crNumber: z.string().trim().min(4).max(64),
  vatNumber: z.string().trim().max(64),
});

export type WizardLegal = z.infer<typeof wizardLegalSchema>;

// ---------------------------------------------------------------------------
// Step 4: connect
// ---------------------------------------------------------------------------

export interface WizardConnectState {
  /** Etimad tender to track — creates the first real project when set. */
  readonly trackTender: boolean;
  readonly tenderTitle: string;
  readonly tenderTitleAr: string;
  readonly etimadRef: string;
  /** Approval chain quick setup — reviewer ids in order. */
  readonly reviewerIds: readonly string[];
  readonly restrictionsAcknowledged: boolean;
}

export const EMPTY_CONNECT: WizardConnectState = Object.freeze({
  trackTender: false,
  tenderTitle: "",
  tenderTitleAr: "",
  etimadRef: "",
  reviewerIds: Object.freeze([]),
  restrictionsAcknowledged: false,
});

// ---------------------------------------------------------------------------
// Step 5: launch
// ---------------------------------------------------------------------------

export const WIZARD_MISSIONS = [
  "PROPOSAL",
  "QUALIFICATION",
  "CONTRACT",
] as const;

export type WizardMission = (typeof WIZARD_MISSIONS)[number];

export interface WizardMissionMeta {
  readonly id: WizardMission;
  readonly titleEn: string;
  readonly titleAr: string;
  readonly descriptionEn: string;
  readonly descriptionAr: string;
  readonly targetView: string;
}

export const WIZARD_MISSION_CATALOG: readonly WizardMissionMeta[] =
  Object.freeze([
    {
      id: "PROPOSAL",
      titleEn: "Draft a bid proposal",
      titleAr: "صياغة عرض مناقصة",
      descriptionEn:
        "Agents read the tender, map compliance, and draft a bilingual proposal — you review before anything ships.",
      descriptionAr:
        "يقرأ الوكلاء المناقصة ويحلّلون الامتثال ويصوغون عرضاً ثنائي اللغة — وتراجع قبل أي إخراج.",
      targetView: "projects",
    },
    {
      id: "QUALIFICATION",
      titleEn: "Build my qualification dossier",
      titleAr: "بناء ملف الأهلية",
      descriptionEn:
        "Upload certificates and past projects; the readiness checker maps gaps against Saudi requirements.",
      descriptionAr:
        "ارفع الشهادات والمشاريع السابقة؛ ويحدد فاحص الجاهزية الفجوات مقابل المتطلبات السعودية.",
      targetView: "account",
    },
    {
      id: "CONTRACT",
      titleEn: "Review a contract",
      titleAr: "مراجعة عقد",
      descriptionEn:
        "Paste or upload an agreement for a bilingual clause-by-clause risk review.",
      descriptionAr:
        "الصق أو ارفع اتفاقية لمراجعة ثنائية اللغة بنداً بنداً مع مؤشرات المخاطر.",
      targetView: "contracts",
    },
  ]);

// ---------------------------------------------------------------------------
// Completion + progress
// ---------------------------------------------------------------------------

export interface WizardCompletionInput {
  readonly profile: WizardProfile | null;
  readonly brand: WizardBrand | null;
  readonly legal: WizardLegal | null;
  readonly connect: WizardConnectState;
  readonly mission: WizardMission | null;
}

/** Per-step completion — a step is done when its persisted payload is valid. */
export function wizardStepCompletion(
  input: WizardCompletionInput
): Readonly<Record<OnboardingWizardStepId, boolean>> {
  const profile = input.profile ? wizardProfileSchema.safeParse(input.profile).success : false;
  const brand = input.brand ? wizardBrandSchema.safeParse(input.brand).success : false;
  const legal = input.legal ? wizardLegalSchema.safeParse(input.legal).success : false;
  const connect =
    input.connect.restrictionsAcknowledged &&
    (input.connect.reviewerIds.length > 0 ||
      (input.connect.trackTender &&
        input.connect.tenderTitle.trim().length >= 2 &&
        input.connect.etimadRef.trim().length >= 3));
  return {
    profile,
    brand,
    legal,
    connect,
    launch: input.mission !== null,
  };
}

/** Number of steps completed (0–5) and the 0–100 progress percentage. */
export function wizardProgress(completed: Readonly<Record<OnboardingWizardStepId, boolean>>): {
  completedCount: number;
  percent: number;
} {
  const completedCount = ONBOARDING_WIZARD_STEPS.filter(
    (step) => completed[step.id]
  ).length;
  return {
    completedCount,
    percent: Math.round((completedCount / ONBOARDING_WIZARD_STEPS.length) * 100),
  };
}

// ---------------------------------------------------------------------------
// Live preview ("Personalizes as you answer")
// ---------------------------------------------------------------------------

export interface WizardPreview {
  readonly headline: string;
  readonly contextLineEn: string;
  readonly contextLineAr: string;
  readonly strengths: readonly { readonly id: string; readonly en: string; readonly ar: string; readonly active: boolean }[];
  readonly suggestions: readonly { readonly en: string; readonly ar: string }[];
}

const ROLE_LABELS: Record<WizardRole, { en: string; ar: string }> = {
  FOUNDER_EXEC: { en: "Founder / exec", ar: "مؤسس / تنفيذي" },
  BID_MANAGER: { en: "Bid manager", ar: "مدير مناقصات" },
  TECHNICAL_LEAD: { en: "Technical lead", ar: "قائد فني" },
  PROPOSAL_WRITER: { en: "Proposal writer", ar: "كاتب عروض" },
  OTHER: { en: "Bid contributor", ar: "مساهم في العطاء" },
};

const SECTOR_LABELS: Record<WizardSector, { en: string; ar: string }> = {
  GOV: { en: "Government", ar: "حكومي" },
  HEALTH: { en: "Health", ar: "صحي" },
  FINANCE: { en: "Finance", ar: "مالي" },
  ENERGY: { en: "Energy", ar: "طاقة" },
  TELECOM: { en: "Telecom", ar: "اتصالات" },
  OTHER: { en: "Multi-sector", ar: "متعدد القطاعات" },
};

/**
 * Derive the right-rail preview from everything answered so far. Every field
 * degrades gracefully: unanswered steps simply do not light up yet.
 */
export function deriveWizardPreview(
  input: WizardCompletionInput,
  workspaceNameFallback: string
): WizardPreview {
  const completed = wizardStepCompletion(input);
  const displayName =
    input.profile?.workspaceName.trim() || workspaceNameFallback.trim() || "Your workspace";

  const roleLine = input.profile
    ? `${ROLE_LABELS[input.profile.role].en} · ${SECTOR_LABELS[input.profile.sector].en}`
    : null;
  const roleLineAr = input.profile
    ? `${ROLE_LABELS[input.profile.role].ar} · ${SECTOR_LABELS[input.profile.sector].ar}`
    : null;

  const strengths = [
    {
      id: "brand",
      en: "Branded exports",
      ar: "تصدير بهويتك",
      active: completed.brand,
    },
    {
      id: "legal",
      en: "Qualification checks",
      ar: "فحوصات الأهلية",
      active: completed.legal,
    },
    {
      id: "approvals",
      en: "Approval chain",
      ar: "سلسلة الاعتماد",
      active: input.connect.reviewerIds.length > 0,
    },
    {
      id: "etimad",
      en: "Etimad tracking",
      ar: "تتبع اعتماد",
      active:
        input.connect.trackTender && input.connect.etimadRef.trim().length >= 3,
    },
    {
      id: "ai",
      en: "AI drafting",
      ar: "صياغة بالذكاء الاصطناعي",
      active: completed.profile,
    },
  ];

  const suggestions: { en: string; ar: string }[] = [];
  if (!completed.profile) {
    suggestions.push({
      en: "Add your name and company to personalize drafts",
      ar: "أضف اسمك وشركتك لتخصيص المسودات",
    });
  }
  if (!completed.brand) {
    suggestions.push({
      en: "Set a tagline and brand color for covers",
      ar: "اضبط الشعار النصي واللون الأساسي للأغلفة",
    });
  }
  if (!completed.legal) {
    suggestions.push({
      en: "Add CR / VAT numbers to unlock qualification",
      ar: "أضف السجل التجاري والرقم الضريبي لفتح الأهلية",
    });
  }
  if (input.connect.reviewerIds.length === 0) {
    suggestions.push({
      en: "Name your approvers so exports stay governed",
      ar: "حدّد المعتمدين لتبقى عمليات التصدير خاضعة للحوكمة",
    });
  }
  if (!input.connect.trackTender) {
    suggestions.push({
      en: "Track your first Etimad tender by reference",
      ar: "تتبع أول مناقصة اعتماد برقم المرجع",
    });
  }
  if (suggestions.length === 0) {
    suggestions.push({
      en: "Setup complete — launch your first mission",
      ar: "اكتمل الإعداد — أطلق أول مهمة",
    });
  }

  return {
    headline: `${displayName}'s Arabclue`,
    contextLineEn: roleLine ?? "Answer to personalize",
    contextLineAr: roleLineAr ?? "أجب لتخصيص التجربة",
    strengths,
    suggestions: suggestions.slice(0, 4),
  };
}

/**
 * Persist the quick-setup approval chain. The API contract is
 * `PUT /api/approval-policy` with `{ steps: [{ reviewerId }] }` — `stepRole`
 * is defaulted server-side and the last step is promoted to FINAL there.
 * Throws on any non-2xx so callers surface the failure instead of silently
 * marking the step complete (regression: the wizard used POST → 405 swallowed).
 */
export async function saveApprovalChain(
  reviewerIds: readonly string[],
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  if (reviewerIds.length === 0) return;
  const res = await fetchImpl("/api/approval-policy", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      steps: reviewerIds.map((reviewerId) => ({ reviewerId })),
    }),
  });
  if (!res.ok) {
    throw new Error(`approval-policy save failed (HTTP ${res.status})`);
  }
}
