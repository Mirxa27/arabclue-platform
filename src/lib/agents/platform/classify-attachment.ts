import type { DocCategory } from "@/lib/types";
import { AGENT_CONFIG } from "@/lib/agents/agent-config";
import { generateCompletion, type LLMMessage } from "@/lib/llm";
import {
  ProviderUnavailableError,
  guardCaughtOrThrow,
  guardOrThrow,
} from "@/lib/ai/provider-unavailable";

export type AttachmentSource =
  | "upload"
  | "url"
  | "camera"
  | "browser"
  | "email"
  | "google_drive"
  | "onedrive"
  | "paste";

export type AttachmentSourceInput = AttachmentSource | "drive";

export type ClassificationDecision = {
  category: DocCategory;
  confidence: number;
  createProject: boolean;
  runPipeline: boolean;
  clarifyingQuestion: string | null;
  reasons: string[];
  suggestedTitle: string | null;
};

const HIGH = AGENT_CONFIG.PLATFORM.autopilotConfidence;
const ATTACHMENT_SOURCES = new Set<AttachmentSource>([
  "upload",
  "url",
  "camera",
  "browser",
  "email",
  "google_drive",
  "onedrive",
  "paste",
]);

function includesAny(haystack: string, needles: string[]): boolean {
  return needles.some((n) => haystack.includes(n));
}

export function normalizeAttachmentSource(
  source?: string | null,
  fallback: AttachmentSource = "paste"
): AttachmentSource {
  if (source === "drive") return "google_drive";
  if (source && ATTACHMENT_SOURCES.has(source as AttachmentSource)) {
    return source as AttachmentSource;
  }
  return fallback;
}

/**
 * Keyword prior for Mission Control routing.
 *
 * Fast and free, but it only reads cues that happen to be in the filename or
 * the first page, so it is the *opening* pass: `classifyAttachmentWithAi`
 * always asks a model afterwards and lets the model overrule it.
 */
export function classifyAttachment(input: {
  originalName: string;
  mimeType: string;
  textPreview?: string | null;
  source?: AttachmentSourceInput;
}): ClassificationDecision {
  const name = input.originalName.toLowerCase();
  const mime = (input.mimeType || "").toLowerCase();
  const text = (input.textPreview || "").toLowerCase();
  const blob = `${name}\n${mime}\n${text}`;
  const source = normalizeAttachmentSource(input.source, "paste");
  const pastedTextSource =
    source === "paste" ||
    source === "email" ||
    source === "google_drive" ||
    source === "onedrive";
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
    confidence = HIGH;
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
  } else if (pastedTextSource && text.length > 80) {
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

const DOC_CATEGORIES = new Set<DocCategory>([
  "RFP",
  "TECHNICAL_SPECS",
  "IT_CONTRACT",
  "EA_COMPLIANCE",
  "QUALIFICATION",
  "FINANCIAL",
  "BRAND_ASSET",
  "OTHER",
]);

/** Enough of the document for a routing decision; the pipeline reads the rest. */
const CLASSIFY_TEXT_BUDGET = 6000;

export type ClassifyAttachmentInput = {
  originalName: string;
  mimeType: string;
  textPreview?: string | null;
  source?: AttachmentSourceInput;
};

export function buildClassificationMessages(
  input: ClassifyAttachmentInput,
  prior: ClassificationDecision
): LLMMessage[] {
  return [
    {
      role: "system",
      content: [
        "You route uploaded files inside a Saudi government tender (Etimad) bidding platform.",
        `Choose exactly one category: ${[...DOC_CATEGORIES].join(", ")}.`,
        "RFP means the tender document itself (كراسة الشروط, scope of work, evaluation criteria).",
        "Judge only from the evidence given; never invent content you cannot see.",
        'Answer with JSON only: {"category":"...","confidence":0..1,"suggestedTitle":"short title or null","clarifyingQuestion":"question or null","reason":"one short clause"}',
        "Set confidence below 0.85 and ask a clarifyingQuestion whenever the evidence is thin — the platform acts autonomously above that line.",
      ].join("\n"),
    },
    {
      role: "user",
      content: JSON.stringify({
        fileName: input.originalName,
        mimeType: input.mimeType,
        source: normalizeAttachmentSource(input.source, "paste"),
        keywordPrior: { category: prior.category, reasons: prior.reasons },
        textExcerpt: (input.textPreview || "").slice(0, CLASSIFY_TEXT_BUDGET),
      }),
    },
  ];
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * Read a model answer into a decision, or return `null` when it is not a usable
 * classification so the caller can keep the keyword prior. A malformed answer is
 * never coerced into a category — that would be a guess wearing a model's name.
 */
export function parseClassificationResponse(
  content: string,
  prior: ClassificationDecision
): ClassificationDecision | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(
      content
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim()
    );
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;

  const answer = parsed as Record<string, unknown>;
  const category = answer.category;
  if (typeof category !== "string" || !DOC_CATEGORIES.has(category as DocCategory)) {
    return null;
  }

  const rawConfidence = answer.confidence;
  const confidence =
    typeof rawConfidence === "number" && Number.isFinite(rawConfidence)
      ? clamp01(rawConfidence)
      : prior.confidence;

  const decided = category as DocCategory;
  const actionable = confidence >= HIGH;
  const suggestedTitle =
    typeof answer.suggestedTitle === "string" && answer.suggestedTitle.trim()
      ? answer.suggestedTitle.trim().slice(0, 120)
      : decided === "RFP"
        ? prior.suggestedTitle
        : null;
  const asked =
    typeof answer.clarifyingQuestion === "string" &&
    answer.clarifyingQuestion.trim()
      ? answer.clarifyingQuestion.trim()
      : null;
  const reason =
    typeof answer.reason === "string" && answer.reason.trim()
      ? answer.reason.trim()
      : "model classification";

  return {
    category: decided,
    confidence,
    createProject:
      actionable && (decided === "RFP" || decided === "TECHNICAL_SPECS"),
    runPipeline: actionable && decided === "RFP",
    clarifyingQuestion: actionable
      ? null
      : (asked ??
        "Confirm where this should live: new/active tender project, account library, or brand assets?"),
    reasons: [reason, ...prior.reasons],
    suggestedTitle,
  };
}

/**
 * The routing decision the platform acts on: keyword prior first (so we always
 * have something), then a model pass that can overrule it.
 *
 * Under `AUTONOMY_REAL_AI_ONLY` an absent or failing provider throws instead of
 * silently degrading to keywords — a keyword guess presented as the agent's
 * judgement is exactly the fake-AI behaviour that flag exists to kill.
 */
export async function classifyAttachmentWithAi(
  input: ClassifyAttachmentInput
): Promise<ClassificationDecision> {
  const prior = classifyAttachment(input);

  try {
    const result = await generateCompletion(
      buildClassificationMessages(input, prior),
      { engine: "INGESTION", temperature: 0.1, maxTokens: 512, promptOrigin: "system" }
    );

    if (result.fallback || !result.content) {
      guardOrThrow(result, "classify-attachment:classifyAttachmentWithAi");
      return prior;
    }

    return parseClassificationResponse(result.content, prior) ?? prior;
  } catch (err) {
    if (err instanceof ProviderUnavailableError) throw err;
    console.warn("[classify-attachment] model pass failed, using prior", err);
    guardCaughtOrThrow(err, "classify-attachment:classifyAttachmentWithAi");
    return prior;
  }
}
