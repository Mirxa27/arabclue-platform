import type { DocCategory } from "@/lib/types";

export type AttachmentSource =
  | "upload"
  | "url"
  | "camera"
  | "browser"
  | "email"
  | "drive"
  | "paste";

export type ClassificationDecision = {
  category: DocCategory;
  confidence: number;
  createProject: boolean;
  runPipeline: boolean;
  clarifyingQuestion: string | null;
  reasons: string[];
  suggestedTitle: string | null;
};

const HIGH = 0.78;

function includesAny(haystack: string, needles: string[]): boolean {
  return needles.some((n) => haystack.includes(n));
}

/**
 * Heuristic multimodal classifier for Mission Control routing.
 * High-confidence tender packages trigger adaptive autopilot.
 */
export function classifyAttachment(input: {
  originalName: string;
  mimeType: string;
  textPreview?: string | null;
  source?: AttachmentSource;
}): ClassificationDecision {
  const name = input.originalName.toLowerCase();
  const mime = (input.mimeType || "").toLowerCase();
  const text = (input.textPreview || "").toLowerCase();
  const blob = `${name}\n${mime}\n${text}`;
  const reasons: string[] = [];

  const brandHit =
    includesAny(blob, ["logo", "brand", "identity", "شعار", "هوية"]) ||
    mime.startsWith("image/");
  const financialHit = includesAny(blob, [
    "financial",
    "balance",
    "qlr",
    "vat",
    "بيان مالي",
    "قوائم مالية",
    "مالية",
  ]);
  const qualificationHit = includesAny(blob, [
    "qualification",
    "certificate",
    "saudization",
    "شهادة",
    "تأهيل",
    "نطاق",
  ]);
  const tenderHit = includesAny(blob, [
    "rfp",
    "tender",
    "etimad",
    "kafas",
    "مناقصة",
    "كراسة",
    "شروط",
    "دعوة",
    "طلب عروض",
    "sow",
    "scope of work",
    "sla",
  ]);
  const specsHit = includesAny(blob, [
    "technical",
    "specs",
    "specification",
    "مواصفات",
    "فنية",
  ]);
  const contractHit = includesAny(blob, [
    "contract",
    "agreement",
    "عقد",
    "اتفاقية",
  ]);
  const eaHit = includesAny(blob, ["ea ", "nca", "pdpl", "nora", "امتثال", "ضوابط"]);

  let category: DocCategory = "OTHER";
  let confidence = 0.35;
  let createProject = false;
  let runPipeline = false;
  let clarifyingQuestion: string | null = null;
  let suggestedTitle: string | null = null;

  if (tenderHit) {
    category = "RFP";
    confidence = text.length > 400 ? 0.9 : 0.82;
    createProject = true;
    runPipeline = confidence >= HIGH;
    reasons.push("tender/RFP cues");
    suggestedTitle =
      input.originalName.replace(/\.[^.]+$/, "").slice(0, 120) || "New tender";
  } else if (specsHit) {
    category = "TECHNICAL_SPECS";
    confidence = 0.8;
    createProject = true;
    runPipeline = false;
    reasons.push("technical specs cues");
  } else if (contractHit) {
    category = "IT_CONTRACT";
    confidence = 0.78;
    reasons.push("contract cues");
  } else if (eaHit) {
    category = "EA_COMPLIANCE";
    confidence = 0.8;
    reasons.push("compliance cues");
  } else if (financialHit) {
    category = "FINANCIAL";
    confidence = 0.84;
    reasons.push("financial statement cues");
  } else if (qualificationHit) {
    category = "QUALIFICATION";
    confidence = 0.8;
    reasons.push("qualification cues");
  } else if (brandHit) {
    category = "BRAND_ASSET";
    confidence = mime.startsWith("image/") ? 0.86 : 0.75;
    reasons.push("brand/image cues");
  } else if (input.source === "paste" && text.length > 80) {
    category = "OTHER";
    confidence = 0.45;
    clarifyingQuestion =
      "Should I treat this pasted text as a new tender RFP, account knowledge, or notes only?";
    reasons.push("ambiguous pasted text");
  } else {
    clarifyingQuestion =
      "Is this a tender package, company evidence/library item, financial statement, or brand asset?";
    reasons.push("low-signal filename/content");
  }

  if (category === "RFP" && confidence >= HIGH) {
    clarifyingQuestion = null;
  } else if (confidence < HIGH && !clarifyingQuestion) {
    clarifyingQuestion =
      "Confirm where this should live: new/active tender project, account library, or brand assets?";
  }

  if (confidence < HIGH) {
    createProject = false;
    runPipeline = false;
  }

  return {
    category,
    confidence,
    createProject,
    runPipeline,
    clarifyingQuestion,
    reasons,
    suggestedTitle,
  };
}

export const AUTOPILOT_CONFIDENCE = HIGH;
