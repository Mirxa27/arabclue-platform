/**
 * Proposal Document Studio — versioning, skills catalog, export policy.
 * Evidence-only; no pricing advice.
 */

import type { ValidationReport } from "./validation-gate";

export type ProposalSkillId =
  | "rewrite"
  | "expand"
  | "condense"
  | "translate"
  | "redesign"
  | "section";

export type RegenerateMode = "version" | "fork";

export const PROPOSAL_SKILLS: {
  id: ProposalSkillId;
  labelEn: string;
  labelAr: string;
  instructionEn: string;
  instructionAr: string;
}[] = [
  {
    id: "rewrite",
    labelEn: "Rewrite",
    labelAr: "إعادة صياغة",
    instructionEn:
      "Improve government-formal wording and evaluator scannability while preserving all facts, citations, requirement IDs, and gaps.",
    instructionAr:
      "حسّن الصياغة الرسمية الحكومية وقابلية المسح للمقيّم مع الحفاظ على الحقائق والاقتباسات ومعرفات المتطلبات والفجوات.",
  },
  {
    id: "expand",
    labelEn: "Expand",
    labelAr: "توسيع",
    instructionEn:
      "Expand with evaluator-facing detail only where supported by tender text or approved evidence already present. Do not invent projects, staff, certifications, metrics, or prices.",
    instructionAr:
      "وسّع التفاصيل القابلة للتقييم فقط حيث يدعمها نص المناقصة أو الأدلة المعتمدة الموجودة. لا تختلق مشاريع أو كوادر أو شهادات أو مقاييس أو أسعار.",
  },
  {
    id: "condense",
    labelEn: "Condense",
    labelAr: "اختصار",
    instructionEn:
      "Condense for clarity while retaining requirement coverage, explicit gaps, compliance commitments, and blank financial amount cells.",
    instructionAr:
      "اختصر للوضوح مع الإبقاء على تغطية المتطلبات والفجوات الصريحة والالتزامات التنظيمية وخلايا المبالغ المالية فارغة.",
  },
  {
    id: "translate",
    labelEn: "Translate",
    labelAr: "ترجمة",
    instructionEn:
      "Translate to the target locale with professional tender tone. Preserve standards names (NCA, PDPL, NORA, QLR), requirement IDs, numbers, and gaps. Do not invent content.",
    instructionAr:
      "ترجم إلى اللغة المستهدفة بنبرة عطاء رسمية. حافظ على أسماء المعايير (NCA, PDPL, NORA, QLR) ومعرفات المتطلبات والأرقام والفجوات. لا تختلق محتوى.",
  },
  {
    id: "redesign",
    labelEn: "Redesign layout",
    labelAr: "إعادة تصميم الهيكل",
    instructionEn:
      "Redesign document structure for evaluator scoring: clear ## headings, requirement coverage table, methodology, experience classes (exact/analogous/proposed), explicit gaps. Do not invent facts or prices.",
    instructionAr:
      "أعد هيكل المستند لتسهيل تقييم المقيّم: عناوين ## واضحة، جدول تغطية المتطلبات، المنهجية، تصنيفات الخبرة، والفجوات الصريحة. لا تختلق حقائق أو أسعار.",
  },
  {
    id: "section",
    labelEn: "Regenerate section",
    labelAr: "إعادة توليد قسم",
    instructionEn:
      "Regenerate only the provided section so it is evaluator-scorable, evidence-backed, and gap-explicit. Leave other sections untouched (return only the section).",
    instructionAr:
      "أعد توليد القسم المقدم فقط ليكون قابلاً للتقييم ومدعوماً بالأدلة مع فجوات صريحة. أعد القسم فقط دون بقية المستند.",
  },
];

export function getProposalSkill(id: string | undefined | null) {
  return PROPOSAL_SKILLS.find((s) => s.id === id) ?? PROPOSAL_SKILLS[0];
}

export function skillInstruction(
  skillId: string | undefined | null,
  locale: "ar" | "en",
  custom?: string | null
): string {
  if (custom?.trim()) return custom.trim();
  const skill = getProposalSkill(skillId);
  return locale === "ar" ? skill.instructionAr : skill.instructionEn;
}

/** Line-oriented unified-style diff for proposal markdown versions. */
export function unifiedDiff(a: string, b: string): string[] {
  const aLines = (a || "").split("\n");
  const bLines = (b || "").split("\n");
  const max = Math.max(aLines.length, bLines.length);
  const out: string[] = [];
  for (let i = 0; i < max; i++) {
    const left = aLines[i];
    const right = bLines[i];
    if (left === right) {
      if (left !== undefined) out.push(`  ${left}`);
    } else {
      if (left !== undefined) out.push(`- ${left}`);
      if (right !== undefined) out.push(`+ ${right}`);
    }
  }
  return out;
}

export function applySectionRewrite(
  fullMd: string,
  selection: string,
  rewritten: string
): string {
  if (!selection || selection === fullMd) return rewritten;
  if (fullMd.includes(selection)) {
    return fullMd.replace(selection, rewritten);
  }
  return rewritten;
}

export type ExportPolicyInput = {
  proposalStatus: string;
  validation: ValidationReport;
  format: string;
  hasApprovalPolicy: boolean;
};

export type ExportPolicyResult =
  | { allowed: true; markExported: boolean }
  | { allowed: false; status: number; error: string; code: string };

const PREFLIGHT_FORMATS = new Set(["html", "manifest"]);

/**
 * Final package formats require validation pass and approval when policy exists.
 * HTML/manifest are preflight (validation errors returned but approval not required for html preview).
 */
export function evaluateExportPolicy(input: ExportPolicyInput): ExportPolicyResult {
  const format = input.format.toLowerCase();
  const preflight = PREFLIGHT_FORMATS.has(format);

  if (input.validation.blocking && !preflight) {
    return {
      allowed: false,
      status: 422,
      error: "Export blocked by validation gate",
      code: "validation_blocked",
    };
  }

  if (!preflight && input.hasApprovalPolicy) {
    const okStatus = ["APPROVED", "EXPORTED"].includes(input.proposalStatus);
    if (!okStatus) {
      return {
        allowed: false,
        status: 409,
        error:
          "Final export requires an approved proposal. Submit for review and complete the approval chain.",
        code: "approval_required",
      };
    }
  }

  return {
    allowed: true,
    markExported: format === "zip",
  };
}

/** Financial forms with source=human must not trip AI-priced BoQ checks. */
export function financialForValidationGate(forms: {
  boqItems?: {
    item: string;
    unit: string;
    qty: number;
    unitPrice: number | null;
    total: number | null;
  }[];
  source?: string;
} | null): {
  cashEquivalents: null;
  accountsReceivable: null;
  currentLiabilities: null;
  quickLiquidityRatio: null;
  qlrPasses: null;
  qlrThreshold: null;
  qlrFormula: null;
  saudizationPercent: null;
  boqItems: {
    item: string;
    unit: string;
    qty: number;
    unitPrice: number | null;
    total: number | null;
  }[];
  localContentPreferenceApplied: null;
  notes: string[];
} | null {
  if (!forms) return null;
  const human = forms.source === "human";
  const items = Array.isArray(forms.boqItems) ? forms.boqItems : [];
  return {
    cashEquivalents: null,
    accountsReceivable: null,
    currentLiabilities: null,
    quickLiquidityRatio: null,
    qlrPasses: null,
    qlrThreshold: null,
    qlrFormula: null,
    saudizationPercent: null,
    boqItems: human
      ? items.map((b) => ({ ...b, unitPrice: null, total: null }))
      : items,
    localContentPreferenceApplied: null,
    notes: [],
  };
}

export type AgentRunConfig = {
  locale: "ar" | "en";
  workspaceId: string;
  userId: string;
  projectId: string;
  regenerateMode?: RegenerateMode;
  targetProposalId?: string | null;
};

export function parseAgentRunConfig(raw: string | null | undefined): AgentRunConfig | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as AgentRunConfig;
    if (!v.workspaceId || !v.userId || !v.projectId) return null;
    return {
      locale: v.locale === "en" ? "en" : "ar",
      workspaceId: v.workspaceId,
      userId: v.userId,
      projectId: v.projectId,
      regenerateMode: v.regenerateMode === "fork" ? "fork" : v.regenerateMode === "version" ? "version" : undefined,
      targetProposalId: v.targetProposalId ?? null,
    };
  } catch {
    return null;
  }
}

/** Stale if QUEUED > 30s without start, or RUNNING with no progress update > 120s. */
export function isAgentRunStale(opts: {
  status: string;
  createdAt: Date | string;
  startedAt: Date | string | null;
  updatedAt: Date | string;
  overallProgress: number;
  now?: number;
}): boolean {
  const now = opts.now ?? Date.now();
  const created = new Date(opts.createdAt).getTime();
  const updated = new Date(opts.updatedAt).getTime();
  if (opts.status === "QUEUED") {
    return now - created > 30_000;
  }
  if (opts.status === "RUNNING") {
    // Long agent runs are OK; only resume if heartbeat (updatedAt) is stale
    return now - updated > 180_000;
  }
  return false;
}
