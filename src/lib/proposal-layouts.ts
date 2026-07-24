import type PptxGenJS from "pptxgenjs";
import { computeCanonicalHash } from "./document-templates/contract-templates";

export const PROPOSAL_LAYOUT_KEYS = Object.freeze([
  "government-formal",
  "executive-impact",
  "technical-deep-dive",
  "compliance-evidence",
  "bilingual-parallel",
  "compact-addendum",
] as const);

export type ProposalLayoutKey = (typeof PROPOSAL_LAYOUT_KEYS)[number];

export const PROPOSAL_MODULE_KEYS = Object.freeze([
  "cover",
  "submission-letter",
  "document-control",
  "executive-summary",
  "requirements-understanding",
  "compliance-traceability",
  "technical-solution",
  "delivery-methodology",
  "governance-risk-quality-change",
  "team-evidence",
  "experience-case-studies",
  "service-levels-support",
  "local-content-saudization",
  "commercial-boq-handoff",
  "assumptions-dependencies-deviations",
  "appendices-evidence-validation",
] as const);

export type ProposalModuleKey = (typeof PROPOSAL_MODULE_KEYS)[number];
export type ProposalChannel = "HTML" | "PDF" | "PPTX" | "XLSX";
export type ProposalLanguageMode = "EN" | "AR" | "BILINGUAL";
export type ProposalIntent =
  | "FULL_SUBMISSION"
  | "EXECUTIVE_REVIEW"
  | "TECHNICAL_EVALUATION"
  | "COMPLIANCE_RESPONSE"
  | "BILINGUAL_SUBMISSION"
  | "ADDENDUM";

export interface LocalizedProposalText {
  readonly en: string;
  readonly ar: string;
}

export type ProposalSourceKind =
  | "TENDER"
  | "USER_ENTRY"
  | "APPROVED_KNOWLEDGE"
  | "WORKSPACE"
  | "DERIVED";

export interface ProposalSourceReference {
  readonly id: string;
  readonly kind: ProposalSourceKind;
  readonly title: LocalizedProposalText;
  readonly locator?: string;
  readonly asOf?: string;
}

export interface ProposalBrandInput {
  readonly primaryColor?: string;
  readonly secondaryColor?: string;
  readonly accentColor?: string;
  readonly backgroundColor?: string;
  readonly textColor?: string;
}

interface ProposalBlockBase {
  readonly key: string;
  readonly title: LocalizedProposalText;
  /**
   * `true` means that an empty sourceRefs array is invalid. Renderers never
   * infer provenance from neighboring blocks.
   */
  readonly sourceRequired: boolean;
  readonly sourceRefs: readonly string[];
}

export interface NarrativeProposalBlock extends ProposalBlockBase {
  readonly type: "NARRATIVE";
  readonly body: LocalizedProposalText;
}

export interface BulletListProposalBlock extends ProposalBlockBase {
  readonly type: "BULLET_LIST";
  readonly items: readonly LocalizedProposalText[];
}

export interface ProposalTableColumn {
  readonly key: string;
  readonly label: LocalizedProposalText;
}

export interface ProposalTableRow {
  readonly key: string;
  readonly cells: Readonly<Record<string, LocalizedProposalText>>;
}

export interface TableProposalBlock extends ProposalBlockBase {
  readonly type: "TABLE";
  readonly columns: readonly ProposalTableColumn[];
  readonly rows: readonly ProposalTableRow[];
}

export interface KpiProposalBlock extends ProposalBlockBase {
  readonly type: "KPI";
  readonly label: LocalizedProposalText;
  /** Null is rendered visibly as "not available"; it is never guessed. */
  readonly value: string | null;
  readonly unit?: LocalizedProposalText;
  readonly asOf: string | null;
}

export type EvidenceStatus = "VERIFIED" | "PENDING" | "NOT_AVAILABLE";

export interface ProposalEvidenceEntry {
  readonly key: string;
  readonly label: LocalizedProposalText;
  readonly status: EvidenceStatus;
  readonly sourceRefs: readonly string[];
}

export interface EvidenceRegisterProposalBlock extends ProposalBlockBase {
  readonly type: "EVIDENCE_REGISTER";
  readonly entries: readonly ProposalEvidenceEntry[];
}

export interface ProposalCommercialEntry {
  readonly key: string;
  readonly description: LocalizedProposalText;
  /**
   * Kept as text to preserve tender/user-entered precision and formatting.
   * The layout engine does not calculate, round, or manufacture prices.
   */
  readonly amount: string | null;
  readonly currency: string | null;
  readonly sourceRefs: readonly string[];
}

export interface CommercialHandoffProposalBlock extends ProposalBlockBase {
  readonly type: "COMMERCIAL_HANDOFF";
  readonly instruction: LocalizedProposalText;
  readonly pricingStatus: "USER_ENTRY_REQUIRED" | "VERIFIED_SOURCE_VALUES";
  readonly entries: readonly ProposalCommercialEntry[];
}

export interface DiagramProposalBlock extends ProposalBlockBase {
  readonly type: "DIAGRAM";
  readonly description: LocalizedProposalText;
  readonly altText: LocalizedProposalText;
  readonly assetRef: string;
}

export type ProposalBlock =
  | NarrativeProposalBlock
  | BulletListProposalBlock
  | TableProposalBlock
  | KpiProposalBlock
  | EvidenceRegisterProposalBlock
  | CommercialHandoffProposalBlock
  | DiagramProposalBlock;

export type ProposalBlockType = ProposalBlock["type"];

export interface ProposalModuleSnapshot {
  readonly key: ProposalModuleKey;
  readonly title: LocalizedProposalText;
  /**
   * Contractual block identities expected in this module. Missing identities
   * are hard failures, which prevents a renderer from silently shrinking a
   * proposal when upstream assembly is incomplete.
   */
  readonly requiredBlockKeys: readonly string[];
  readonly blocks: readonly ProposalBlock[];
}

export interface ProposalSnapshot {
  readonly schemaVersion: 1;
  readonly snapshotId: string;
  readonly version: number;
  readonly intent: ProposalIntent;
  readonly languageMode: ProposalLanguageMode;
  readonly projectTitle: LocalizedProposalText;
  readonly bidderName: LocalizedProposalText;
  readonly tenderReference: string | null;
  readonly brand: ProposalBrandInput;
  readonly sources: readonly ProposalSourceReference[];
  readonly modules: readonly ProposalModuleSnapshot[];
}

export type ProposalModuleRole = "LEAD" | "BODY" | "CONTROL" | "APPENDIX";
export type ProposalModuleOrientation =
  | "FULL_WIDTH"
  | "BILINGUAL_COLUMNS"
  | "LANDSCAPE_TABLE";
export type ProposalModuleChannelTreatment =
  | "PRIMARY"
  | "STANDARD"
  | "APPENDIX";

export interface ProposalModulePlan {
  readonly key: ProposalModuleKey;
  readonly rank: number;
  readonly required: boolean;
  readonly role: ProposalModuleRole;
  readonly orientation: ProposalModuleOrientation;
  readonly channelTreatment: Readonly<
    Record<ProposalChannel, ProposalModuleChannelTreatment>
  >;
}

export interface ProposalLayoutPreset {
  readonly key: ProposalLayoutKey;
  readonly title: LocalizedProposalText;
  readonly description: LocalizedProposalText;
  readonly modules: readonly ProposalModulePlan[];
}

export type ProposalChannelCapability =
  | "NATIVE"
  | "MANIFEST_ONLY"
  | "UNSUPPORTED";

const CHANNELS = Object.freeze([
  "HTML",
  "PDF",
  "PPTX",
  "XLSX",
] as const satisfies readonly ProposalChannel[]);

const MODULE_KEY_SET = new Set<string>(PROPOSAL_MODULE_KEYS);
const LAYOUT_KEY_SET = new Set<string>(PROPOSAL_LAYOUT_KEYS);

const REQUIRED_MODULES: Readonly<
  Record<ProposalLayoutKey, readonly ProposalModuleKey[]>
> = {
  "government-formal": [
    "cover",
    "document-control",
    "executive-summary",
    "requirements-understanding",
    "compliance-traceability",
    "technical-solution",
    "delivery-methodology",
    "assumptions-dependencies-deviations",
    "appendices-evidence-validation",
  ],
  "executive-impact": [
    "cover",
    "executive-summary",
    "requirements-understanding",
    "technical-solution",
    "governance-risk-quality-change",
    "appendices-evidence-validation",
  ],
  "technical-deep-dive": [
    "cover",
    "document-control",
    "requirements-understanding",
    "technical-solution",
    "delivery-methodology",
    "governance-risk-quality-change",
    "service-levels-support",
    "assumptions-dependencies-deviations",
    "appendices-evidence-validation",
  ],
  "compliance-evidence": [
    "cover",
    "document-control",
    "requirements-understanding",
    "compliance-traceability",
    "local-content-saudization",
    "assumptions-dependencies-deviations",
    "appendices-evidence-validation",
  ],
  "bilingual-parallel": [
    "cover",
    "document-control",
    "executive-summary",
    "requirements-understanding",
    "compliance-traceability",
    "technical-solution",
    "delivery-methodology",
    "commercial-boq-handoff",
    "assumptions-dependencies-deviations",
    "appendices-evidence-validation",
  ],
  "compact-addendum": [
    "cover",
    "document-control",
    "assumptions-dependencies-deviations",
    "appendices-evidence-validation",
  ],
};

const MODULE_ORDERS: Readonly<
  Record<ProposalLayoutKey, readonly ProposalModuleKey[]>
> = {
  "government-formal": PROPOSAL_MODULE_KEYS,
  "executive-impact": [
    "cover",
    "executive-summary",
    "requirements-understanding",
    "technical-solution",
    "team-evidence",
    "experience-case-studies",
    "delivery-methodology",
    "governance-risk-quality-change",
    "service-levels-support",
    "compliance-traceability",
    "local-content-saudization",
    "commercial-boq-handoff",
    "submission-letter",
    "document-control",
    "assumptions-dependencies-deviations",
    "appendices-evidence-validation",
  ],
  "technical-deep-dive": [
    "cover",
    "document-control",
    "requirements-understanding",
    "technical-solution",
    "delivery-methodology",
    "governance-risk-quality-change",
    "service-levels-support",
    "compliance-traceability",
    "team-evidence",
    "experience-case-studies",
    "executive-summary",
    "submission-letter",
    "local-content-saudization",
    "commercial-boq-handoff",
    "assumptions-dependencies-deviations",
    "appendices-evidence-validation",
  ],
  "compliance-evidence": [
    "cover",
    "document-control",
    "requirements-understanding",
    "compliance-traceability",
    "local-content-saudization",
    "team-evidence",
    "experience-case-studies",
    "technical-solution",
    "delivery-methodology",
    "governance-risk-quality-change",
    "service-levels-support",
    "executive-summary",
    "submission-letter",
    "commercial-boq-handoff",
    "assumptions-dependencies-deviations",
    "appendices-evidence-validation",
  ],
  "bilingual-parallel": [
    "cover",
    "submission-letter",
    "document-control",
    "executive-summary",
    "requirements-understanding",
    "compliance-traceability",
    "technical-solution",
    "delivery-methodology",
    "governance-risk-quality-change",
    "team-evidence",
    "experience-case-studies",
    "service-levels-support",
    "local-content-saudization",
    "commercial-boq-handoff",
    "assumptions-dependencies-deviations",
    "appendices-evidence-validation",
  ],
  "compact-addendum": [
    "cover",
    "document-control",
    "assumptions-dependencies-deviations",
    "appendices-evidence-validation",
    "requirements-understanding",
    "compliance-traceability",
    "technical-solution",
    "delivery-methodology",
    "governance-risk-quality-change",
    "service-levels-support",
    "team-evidence",
    "experience-case-studies",
    "local-content-saudization",
    "commercial-boq-handoff",
    "executive-summary",
    "submission-letter",
  ],
};

const PRESET_COPY: Readonly<
  Record<
    ProposalLayoutKey,
    {
      readonly title: LocalizedProposalText;
      readonly description: LocalizedProposalText;
    }
  >
> = {
  "government-formal": {
    title: { en: "Government formal", ar: "حكومي رسمي" },
    description: {
      en: "Formal evaluation sequence for a complete government submission.",
      ar: "تسلسل تقييم رسمي لتقديم حكومي متكامل.",
    },
  },
  "executive-impact": {
    title: { en: "Executive impact", ar: "الأثر التنفيذي" },
    description: {
      en: "Decision-focused sequence with evidence retained in appendices.",
      ar: "تسلسل يركز على القرار مع إبقاء الأدلة في الملاحق.",
    },
  },
  "technical-deep-dive": {
    title: { en: "Technical deep dive", ar: "التفصيل التقني" },
    description: {
      en: "Evaluation sequence emphasizing solution, delivery, and controls.",
      ar: "تسلسل تقييم يركز على الحل والتنفيذ والضوابط.",
    },
  },
  "compliance-evidence": {
    title: { en: "Compliance evidence", ar: "أدلة الامتثال" },
    description: {
      en: "Traceability-first sequence for evidence-led evaluation.",
      ar: "تسلسل يبدأ بالتتبع لتقييم قائم على الأدلة.",
    },
  },
  "bilingual-parallel": {
    title: { en: "Bilingual parallel", ar: "ثنائي اللغة متوازٍ" },
    description: {
      en: "Parallel English and Arabic presentation with source parity.",
      ar: "عرض متوازٍ بالعربية والإنجليزية مع تكافؤ المصادر.",
    },
  },
  "compact-addendum": {
    title: { en: "Compact addendum", ar: "ملحق موجز" },
    description: {
      en: "Short controlled sequence for clarifications and addenda.",
      ar: "تسلسل موجز ومنضبط للإيضاحات والملاحق.",
    },
  },
};

function moduleRole(key: ProposalModuleKey): ProposalModuleRole {
  if (key === "cover" || key === "executive-summary") return "LEAD";
  if (
    key === "submission-letter" ||
    key === "document-control" ||
    key === "commercial-boq-handoff"
  ) {
    return "CONTROL";
  }
  if (
    key === "assumptions-dependencies-deviations" ||
    key === "appendices-evidence-validation"
  ) {
    return "APPENDIX";
  }
  return "BODY";
}

function moduleOrientation(
  key: ProposalModuleKey
): ProposalModuleOrientation {
  if (
    key === "compliance-traceability" ||
    key === "commercial-boq-handoff" ||
    key === "document-control"
  ) {
    return "LANDSCAPE_TABLE";
  }
  if (key === "cover") return "FULL_WIDTH";
  return "BILINGUAL_COLUMNS";
}

function buildPreset(key: ProposalLayoutKey): ProposalLayoutPreset {
  const required = new Set<ProposalModuleKey>(REQUIRED_MODULES[key]);
  return {
    key,
    title: PRESET_COPY[key].title,
    description: PRESET_COPY[key].description,
    modules: MODULE_ORDERS[key].map((moduleKey, index) => {
      const role = moduleRole(moduleKey);
      const treatment: ProposalModuleChannelTreatment =
        role === "APPENDIX" ? "APPENDIX" : required.has(moduleKey) ? "PRIMARY" : "STANDARD";
      return {
        key: moduleKey,
        rank: index + 1,
        required: required.has(moduleKey),
        role,
        orientation: moduleOrientation(moduleKey),
        channelTreatment: {
          HTML: treatment,
          PDF: treatment,
          PPTX: treatment,
          XLSX: treatment,
        },
      };
    }),
  };
}

export const PROPOSAL_LAYOUT_PRESETS = deepFreeze({
  "government-formal": buildPreset("government-formal"),
  "executive-impact": buildPreset("executive-impact"),
  "technical-deep-dive": buildPreset("technical-deep-dive"),
  "compliance-evidence": buildPreset("compliance-evidence"),
  "bilingual-parallel": buildPreset("bilingual-parallel"),
  "compact-addendum": buildPreset("compact-addendum"),
} satisfies Record<ProposalLayoutKey, ProposalLayoutPreset>);

export const PROPOSAL_CHANNEL_CAPABILITIES = deepFreeze({
  NARRATIVE: {
    HTML: "NATIVE",
    PDF: "NATIVE",
    PPTX: "NATIVE",
    XLSX: "MANIFEST_ONLY",
  },
  BULLET_LIST: {
    HTML: "NATIVE",
    PDF: "NATIVE",
    PPTX: "NATIVE",
    XLSX: "MANIFEST_ONLY",
  },
  TABLE: {
    HTML: "NATIVE",
    PDF: "NATIVE",
    PPTX: "NATIVE",
    XLSX: "NATIVE",
  },
  KPI: {
    HTML: "NATIVE",
    PDF: "NATIVE",
    PPTX: "NATIVE",
    XLSX: "NATIVE",
  },
  EVIDENCE_REGISTER: {
    HTML: "NATIVE",
    PDF: "NATIVE",
    PPTX: "NATIVE",
    XLSX: "NATIVE",
  },
  COMMERCIAL_HANDOFF: {
    HTML: "NATIVE",
    PDF: "NATIVE",
    PPTX: "NATIVE",
    XLSX: "NATIVE",
  },
  DIAGRAM: {
    HTML: "NATIVE",
    PDF: "NATIVE",
    PPTX: "UNSUPPORTED",
    XLSX: "UNSUPPORTED",
  },
} satisfies Record<
  ProposalBlockType,
  Record<ProposalChannel, ProposalChannelCapability>
>);

const INTENT_LAYOUT_MAP: Readonly<Record<ProposalIntent, ProposalLayoutKey>> =
  Object.freeze({
    FULL_SUBMISSION: "government-formal",
    EXECUTIVE_REVIEW: "executive-impact",
    TECHNICAL_EVALUATION: "technical-deep-dive",
    COMPLIANCE_RESPONSE: "compliance-evidence",
    BILINGUAL_SUBMISSION: "bilingual-parallel",
    ADDENDUM: "compact-addendum",
  });

/** Resolve a known preset without accepting prototype-chain names. */
export function getProposalLayoutPreset(
  key: string
): ProposalLayoutPreset | undefined {
  if (!LAYOUT_KEY_SET.has(key)) return undefined;
  return PROPOSAL_LAYOUT_PRESETS[key as ProposalLayoutKey];
}

/** Select only from explicit intent or an explicit, typed override. */
export function selectProposalLayout(
  snapshot: Pick<ProposalSnapshot, "intent">,
  requested?: ProposalLayoutKey
): ProposalLayoutPreset {
  return PROPOSAL_LAYOUT_PRESETS[requested ?? INTENT_LAYOUT_MAP[snapshot.intent]];
}

export interface ResolvedProposalPalette {
  readonly primaryColor: string;
  readonly secondaryColor: string;
  readonly accentColor: string;
  readonly backgroundColor: string;
  readonly textColor: string;
  readonly onPrimary: string;
  readonly onSecondary: string;
  readonly onAccent: string;
  readonly onBackground: string;
}

const DEFAULT_PALETTE = Object.freeze({
  primaryColor: "173F5F",
  secondaryColor: "20639B",
  accentColor: "D68C20",
  backgroundColor: "FFFFFF",
  textColor: "132238",
});

const HEX_COLOR_PATTERN = /^#?[0-9a-f]{6}$/iu;

function normalizeColor(value: string | undefined, fallback: string): string {
  if (!value || !HEX_COLOR_PATTERN.test(value)) return fallback;
  return value.replace(/^#/u, "").toUpperCase();
}

function colorChannels(color: string): readonly [number, number, number] {
  const normalized = normalizeColor(color, "000000");
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
}

function relativeLuminance(color: string): number {
  const channels = colorChannels(color).map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return (
    channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
  );
}

/** Calculate the WCAG contrast ratio for two six-digit hexadecimal colors. */
export function contrastRatio(first: string, second: string): number {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function bestForeground(background: string): "000000" | "FFFFFF" {
  return contrastRatio("000000", background) >=
    contrastRatio("FFFFFF", background)
    ? "000000"
    : "FFFFFF";
}

/**
 * Resolve user-provided branding while guaranteeing AA contrast for every
 * foreground/background pairing used by the PPTX adapter.
 */
export function resolveProposalPalette(
  input: ProposalBrandInput = {}
): ResolvedProposalPalette {
  const primaryColor = normalizeColor(
    input.primaryColor,
    DEFAULT_PALETTE.primaryColor
  );
  const secondaryColor = normalizeColor(
    input.secondaryColor,
    DEFAULT_PALETTE.secondaryColor
  );
  const accentColor = normalizeColor(
    input.accentColor,
    DEFAULT_PALETTE.accentColor
  );
  const backgroundColor = normalizeColor(
    input.backgroundColor,
    DEFAULT_PALETTE.backgroundColor
  );
  const requestedText = normalizeColor(
    input.textColor,
    DEFAULT_PALETTE.textColor
  );
  const onBackground =
    contrastRatio(requestedText, backgroundColor) >= 4.5
      ? requestedText
      : bestForeground(backgroundColor);

  return Object.freeze({
    primaryColor,
    secondaryColor,
    accentColor,
    backgroundColor,
    textColor: onBackground,
    onPrimary: bestForeground(primaryColor),
    onSecondary: bestForeground(secondaryColor),
    onAccent: bestForeground(accentColor),
    onBackground,
  });
}

export type ProposalDiagnosticCode =
  | "INVALID_SNAPSHOT"
  | "INVALID_PRESET"
  | "INVALID_BRAND_COLOR"
  | "LANGUAGE_MODE_MISMATCH"
  | "UNKNOWN_MODULE"
  | "DUPLICATE_MODULE"
  | "MISSING_REQUIRED_MODULE"
  | "DUPLICATE_BLOCK"
  | "MISSING_REQUIRED_BLOCK"
  | "MISSING_TRANSLATION"
  | "MISSING_SOURCE"
  | "DUPLICATE_SOURCE"
  | "UNKNOWN_SOURCE_REFERENCE"
  | "UNSAFE_MARKUP"
  | "UNRESOLVED_TOKEN"
  | "UNSAFE_BIDI_CONTROL"
  | "INVALID_BLOCK"
  | "UNSUPPORTED_BLOCK_FOR_CHANNEL"
  | "UNSOURCED_PRICING_CONTENT"
  | "PRESENTATION_CAPACITY_EXCEEDED";

export interface ProposalLayoutDiagnostic {
  readonly severity: "ERROR";
  readonly code: ProposalDiagnosticCode;
  readonly path: string;
  readonly message: LocalizedProposalText;
}

export interface CompileProposalLayoutOptions {
  readonly channel: ProposalChannel;
  readonly presetKey?: ProposalLayoutKey;
}

export interface CompiledProposalBlock {
  readonly key: string;
  readonly type: ProposalBlockType;
  readonly title: LocalizedProposalText;
  readonly capability: ProposalChannelCapability;
  readonly sourceRefs: readonly string[];
}

export interface CompiledProposalModule {
  readonly key: ProposalModuleKey;
  readonly rank: number;
  readonly required: boolean;
  readonly role: ProposalModuleRole;
  readonly orientation: ProposalModuleOrientation;
  readonly title: LocalizedProposalText;
  readonly blocks: readonly CompiledProposalBlock[];
}

export interface CompiledProposalLayout {
  readonly status: "VALID" | "INVALID";
  readonly channel: ProposalChannel;
  readonly presetKey: ProposalLayoutKey;
  readonly snapshotId: string;
  readonly snapshotVersion: number;
  readonly snapshotHash: string;
  readonly planHash: string;
  readonly palette: ResolvedProposalPalette;
  readonly modules: readonly CompiledProposalModule[];
  readonly diagnostics: readonly ProposalLayoutDiagnostic[];
}

export class ProposalLayoutValidationError extends Error {
  readonly diagnostics: readonly ProposalLayoutDiagnostic[];

  constructor(diagnostics: readonly ProposalLayoutDiagnostic[]) {
    super(
      `Proposal layout validation failed with ${diagnostics.length} error${
        diagnostics.length === 1 ? "" : "s"
      }.`
    );
    this.name = "ProposalLayoutValidationError";
    this.diagnostics = diagnostics;
  }
}

const SOURCE_KINDS = new Set<string>([
  "TENDER",
  "USER_ENTRY",
  "APPROVED_KNOWLEDGE",
  "WORKSPACE",
  "DERIVED",
]);
const INTENTS = new Set<string>([
  "FULL_SUBMISSION",
  "EXECUTIVE_REVIEW",
  "TECHNICAL_EVALUATION",
  "COMPLIANCE_RESPONSE",
  "BILINGUAL_SUBMISSION",
  "ADDENDUM",
]);
const LANGUAGE_MODES = new Set<string>(["EN", "AR", "BILINGUAL"]);
const BLOCK_TYPES = new Set<string>(Object.keys(PROPOSAL_CHANNEL_CAPABILITIES));
const UNSAFE_MARKUP_PATTERN = /<\s*\/?\s*[a-z][^>]*>/iu;
const UNRESOLVED_TOKEN_PATTERN =
  /\{\{[^{}]*\}\}|\[\[[^\[\]]+\]\]|\$\{[^{}]+\}/u;
const UNSAFE_BIDI_PATTERN =
  /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;
const UNSAFE_CONTROL_PATTERN =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const MAX_PPTX_TEXT_LENGTH_PER_LANGUAGE = 2_400;

function diagnostic(
  code: ProposalDiagnosticCode,
  path: string,
  en: string,
  ar: string
): ProposalLayoutDiagnostic {
  return {
    severity: "ERROR",
    code,
    path,
    message: { en, ar },
  };
}

function addDiagnostic(
  diagnostics: ProposalLayoutDiagnostic[],
  code: ProposalDiagnosticCode,
  path: string,
  en: string,
  ar: string
): void {
  diagnostics.push(diagnostic(code, path, en, ar));
}

function validatePlainText(
  value: unknown,
  path: string,
  diagnostics: ProposalLayoutDiagnostic[],
  allowEmpty = true
): value is string {
  if (typeof value !== "string") {
    addDiagnostic(
      diagnostics,
      "INVALID_SNAPSHOT",
      path,
      "Expected plain text.",
      "كان المتوقع نصاً عادياً."
    );
    return false;
  }
  if (!allowEmpty && value.trim().length === 0) {
    addDiagnostic(
      diagnostics,
      "INVALID_SNAPSHOT",
      path,
      "Text must not be empty.",
      "يجب ألا يكون النص فارغاً."
    );
    return false;
  }
  if (UNSAFE_MARKUP_PATTERN.test(value)) {
    addDiagnostic(
      diagnostics,
      "UNSAFE_MARKUP",
      path,
      "Raw markup is not accepted in proposal content.",
      "لا تقبل علامات التنسيق الخام في محتوى العرض."
    );
  }
  if (UNRESOLVED_TOKEN_PATTERN.test(value)) {
    addDiagnostic(
      diagnostics,
      "UNRESOLVED_TOKEN",
      path,
      "An unresolved template token remains.",
      "لا يزال رمز قالب غير محلول موجوداً."
    );
  }
  if (UNSAFE_BIDI_PATTERN.test(value)) {
    addDiagnostic(
      diagnostics,
      "UNSAFE_BIDI_CONTROL",
      path,
      "Hidden bidirectional control characters are not accepted.",
      "لا تقبل محارف التحكم ثنائية الاتجاه المخفية."
    );
  }
  if (UNSAFE_CONTROL_PATTERN.test(value)) {
    addDiagnostic(
      diagnostics,
      "INVALID_SNAPSHOT",
      path,
      "Unsupported control characters are present.",
      "توجد محارف تحكم غير مدعومة."
    );
  }
  return true;
}

function validateLocalizedText(
  value: unknown,
  path: string,
  languageMode: ProposalLanguageMode,
  diagnostics: ProposalLayoutDiagnostic[]
): value is LocalizedProposalText {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    addDiagnostic(
      diagnostics,
      "INVALID_SNAPSHOT",
      path,
      "Expected bilingual text.",
      "كان المتوقع نصاً ثنائي اللغة."
    );
    return false;
  }
  const candidate = value as Partial<LocalizedProposalText>;
  const requiredLanguages: readonly ("en" | "ar")[] =
    languageMode === "BILINGUAL"
      ? ["en", "ar"]
      : languageMode === "AR"
        ? ["ar"]
        : ["en"];

  for (const language of ["en", "ar"] as const) {
    const text = candidate[language];
    if (
      requiredLanguages.includes(language) &&
      (typeof text !== "string" || text.trim().length === 0)
    ) {
      addDiagnostic(
        diagnostics,
        "MISSING_TRANSLATION",
        `${path}.${language}`,
        `Required ${language.toUpperCase()} content is missing.`,
        `المحتوى المطلوب للغة ${language.toUpperCase()} مفقود.`
      );
    }
    if (text !== undefined) {
      validatePlainText(text, `${path}.${language}`, diagnostics);
    }
  }
  return typeof candidate.en === "string" && typeof candidate.ar === "string";
}

function validateBrand(
  brand: ProposalBrandInput,
  diagnostics: ProposalLayoutDiagnostic[]
): void {
  for (const [key, value] of Object.entries(brand)) {
    if (value !== undefined && !HEX_COLOR_PATTERN.test(value)) {
      addDiagnostic(
        diagnostics,
        "INVALID_BRAND_COLOR",
        `brand.${key}`,
        "Brand colors must be six-digit hexadecimal values.",
        "يجب أن تكون ألوان الهوية قيماً سداسية من ست خانات."
      );
    }
  }
}

function validateSourceRefs(
  refs: readonly string[],
  required: boolean,
  path: string,
  sources: ReadonlyMap<string, ProposalSourceReference>,
  diagnostics: ProposalLayoutDiagnostic[]
): void {
  if (!Array.isArray(refs)) {
    addDiagnostic(
      diagnostics,
      "INVALID_SNAPSHOT",
      path,
      "Source references must be an array.",
      "يجب أن تكون مراجع المصادر مصفوفة."
    );
    return;
  }
  if (required && refs.length === 0) {
    addDiagnostic(
      diagnostics,
      "MISSING_SOURCE",
      path,
      "This content requires explicit provenance.",
      "يتطلب هذا المحتوى مصدراً صريحاً."
    );
  }
  refs.forEach((ref, index) => {
    if (!validatePlainText(ref, `${path}[${index}]`, diagnostics, false)) return;
    if (!sources.has(ref)) {
      addDiagnostic(
        diagnostics,
        "UNKNOWN_SOURCE_REFERENCE",
        `${path}[${index}]`,
        `Source reference "${ref}" does not exist in the snapshot.`,
        `مرجع المصدر "${ref}" غير موجود في اللقطة.`
      );
    }
  });
}

function validateBlock(
  block: ProposalBlock,
  modulePath: string,
  languageMode: ProposalLanguageMode,
  channel: ProposalChannel,
  sources: ReadonlyMap<string, ProposalSourceReference>,
  diagnostics: ProposalLayoutDiagnostic[]
): void {
  const path = `${modulePath}.blocks.${block.key}`;
  validatePlainText(block.key, `${path}.key`, diagnostics, false);
  validateLocalizedText(block.title, `${path}.title`, languageMode, diagnostics);
  validateSourceRefs(
    block.sourceRefs,
    block.sourceRequired,
    `${path}.sourceRefs`,
    sources,
    diagnostics
  );

  if (!BLOCK_TYPES.has(block.type)) {
    addDiagnostic(
      diagnostics,
      "INVALID_BLOCK",
      path,
      `Unknown block type "${String(block.type)}".`,
      `نوع كتلة غير معروف "${String(block.type)}".`
    );
    return;
  }

  const capability = PROPOSAL_CHANNEL_CAPABILITIES[block.type][channel];
  if (capability === "UNSUPPORTED") {
    addDiagnostic(
      diagnostics,
      "UNSUPPORTED_BLOCK_FOR_CHANNEL",
      path,
      `${block.type} is not supported by the ${channel} adapter.`,
      `نوع ${block.type} غير مدعوم في محول ${channel}.`
    );
  }

  switch (block.type) {
    case "NARRATIVE":
      validateLocalizedText(
        block.body,
        `${path}.body`,
        languageMode,
        diagnostics
      );
      validatePptxCapacity(block.body, `${path}.body`, channel, diagnostics);
      break;
    case "BULLET_LIST":
      if (!Array.isArray(block.items) || block.items.length === 0) {
        addDiagnostic(
          diagnostics,
          "INVALID_BLOCK",
          `${path}.items`,
          "A list block must contain at least one item.",
          "يجب أن تحتوي كتلة القائمة على عنصر واحد على الأقل."
        );
      }
      block.items.forEach((item, index) =>
        validateLocalizedText(
          item,
          `${path}.items[${index}]`,
          languageMode,
          diagnostics
        )
      );
      validatePptxCapacity(
        {
          en: block.items.map((item) => item.en).join("\n"),
          ar: block.items.map((item) => item.ar).join("\n"),
        },
        `${path}.items`,
        channel,
        diagnostics
      );
      break;
    case "TABLE":
      validateTableBlock(block, path, languageMode, diagnostics);
      validatePptxCapacity(
        {
          en: block.rows
            .flatMap((row) => Object.values(row.cells).map((cell) => cell.en))
            .join("\n"),
          ar: block.rows
            .flatMap((row) => Object.values(row.cells).map((cell) => cell.ar))
            .join("\n"),
        },
        `${path}.rows`,
        channel,
        diagnostics
      );
      break;
    case "KPI":
      validateLocalizedText(
        block.label,
        `${path}.label`,
        languageMode,
        diagnostics
      );
      if (block.value !== null) {
        validatePlainText(block.value, `${path}.value`, diagnostics, false);
      }
      if (block.unit) {
        validateLocalizedText(
          block.unit,
          `${path}.unit`,
          languageMode,
          diagnostics
        );
      }
      if (block.asOf !== null) {
        validatePlainText(block.asOf, `${path}.asOf`, diagnostics, false);
      }
      validateSourceRefs(
        block.sourceRefs,
        block.value !== null,
        `${path}.sourceRefs`,
        sources,
        diagnostics
      );
      break;
    case "EVIDENCE_REGISTER":
      if (!Array.isArray(block.entries) || block.entries.length === 0) {
        addDiagnostic(
          diagnostics,
          "INVALID_BLOCK",
          `${path}.entries`,
          "An evidence register must contain an explicit entry.",
          "يجب أن يحتوي سجل الأدلة على قيد صريح."
        );
      }
      block.entries.forEach((entry, index) => {
        const entryPath = `${path}.entries[${index}]`;
        validatePlainText(entry.key, `${entryPath}.key`, diagnostics, false);
        validateLocalizedText(
          entry.label,
          `${entryPath}.label`,
          languageMode,
          diagnostics
        );
        validateSourceRefs(
          entry.sourceRefs,
          entry.status === "VERIFIED",
          `${entryPath}.sourceRefs`,
          sources,
          diagnostics
        );
      });
      break;
    case "COMMERCIAL_HANDOFF":
      validateLocalizedText(
        block.instruction,
        `${path}.instruction`,
        languageMode,
        diagnostics
      );
      block.entries.forEach((entry, index) => {
        const entryPath = `${path}.entries[${index}]`;
        validatePlainText(entry.key, `${entryPath}.key`, diagnostics, false);
        validateLocalizedText(
          entry.description,
          `${entryPath}.description`,
          languageMode,
          diagnostics
        );
        if (entry.amount !== null) {
          validatePlainText(entry.amount, `${entryPath}.amount`, diagnostics, false);
        }
        if (entry.currency !== null) {
          validatePlainText(
            entry.currency,
            `${entryPath}.currency`,
            diagnostics,
            false
          );
        }
        validateSourceRefs(
          entry.sourceRefs,
          entry.amount !== null,
          `${entryPath}.sourceRefs`,
          sources,
          diagnostics
        );
        if (
          entry.amount !== null &&
          !entry.sourceRefs.some((ref) => {
            const kind = sources.get(ref)?.kind;
            return (
              kind === "TENDER" ||
              kind === "USER_ENTRY" ||
              kind === "WORKSPACE"
            );
          })
        ) {
          addDiagnostic(
            diagnostics,
            "UNSOURCED_PRICING_CONTENT",
            `${entryPath}.sourceRefs`,
            "A populated commercial value requires tender, workspace, or explicit user-entry provenance.",
            "تتطلب القيمة التجارية المدخلة مصدراً من المنافسة أو مساحة العمل أو إدخالاً صريحاً من المستخدم."
          );
        }
      });
      break;
    case "DIAGRAM":
      validateLocalizedText(
        block.description,
        `${path}.description`,
        languageMode,
        diagnostics
      );
      validateLocalizedText(
        block.altText,
        `${path}.altText`,
        languageMode,
        diagnostics
      );
      validatePlainText(block.assetRef, `${path}.assetRef`, diagnostics, false);
      break;
  }
}

function validatePptxCapacity(
  text: LocalizedProposalText,
  path: string,
  channel: ProposalChannel,
  diagnostics: ProposalLayoutDiagnostic[]
): void {
  if (channel !== "PPTX") return;
  for (const language of ["en", "ar"] as const) {
    if (text[language].length > MAX_PPTX_TEXT_LENGTH_PER_LANGUAGE) {
      addDiagnostic(
        diagnostics,
        "PRESENTATION_CAPACITY_EXCEEDED",
        `${path}.${language}`,
        "Content exceeds the safe per-block presentation capacity.",
        "يتجاوز المحتوى السعة الآمنة لكل كتلة في العرض."
      );
    }
  }
}

function validateTableBlock(
  block: TableProposalBlock,
  path: string,
  languageMode: ProposalLanguageMode,
  diagnostics: ProposalLayoutDiagnostic[]
): void {
  if (!Array.isArray(block.columns) || block.columns.length === 0) {
    addDiagnostic(
      diagnostics,
      "INVALID_BLOCK",
      `${path}.columns`,
      "A table must declare at least one column.",
      "يجب أن يحدد الجدول عموداً واحداً على الأقل."
    );
  }
  const columnKeys = new Set<string>();
  block.columns.forEach((column, index) => {
    const columnPath = `${path}.columns[${index}]`;
    validatePlainText(column.key, `${columnPath}.key`, diagnostics, false);
    validateLocalizedText(
      column.label,
      `${columnPath}.label`,
      languageMode,
      diagnostics
    );
    if (columnKeys.has(column.key)) {
      addDiagnostic(
        diagnostics,
        "INVALID_BLOCK",
        `${columnPath}.key`,
        `Duplicate table column "${column.key}".`,
        `عمود جدول مكرر "${column.key}".`
      );
    }
    columnKeys.add(column.key);
  });

  const rowKeys = new Set<string>();
  block.rows.forEach((row, rowIndex) => {
    const rowPath = `${path}.rows[${rowIndex}]`;
    validatePlainText(row.key, `${rowPath}.key`, diagnostics, false);
    if (rowKeys.has(row.key)) {
      addDiagnostic(
        diagnostics,
        "INVALID_BLOCK",
        `${rowPath}.key`,
        `Duplicate table row "${row.key}".`,
        `صف جدول مكرر "${row.key}".`
      );
    }
    rowKeys.add(row.key);

    for (const column of block.columns) {
      if (!Object.prototype.hasOwnProperty.call(row.cells, column.key)) {
        addDiagnostic(
          diagnostics,
          "INVALID_BLOCK",
          `${rowPath}.cells.${column.key}`,
          "A required table cell is missing.",
          "خلية جدول مطلوبة مفقودة."
        );
      } else {
        validateLocalizedText(
          row.cells[column.key],
          `${rowPath}.cells.${column.key}`,
          languageMode,
          diagnostics
        );
      }
    }
    for (const cellKey of Object.keys(row.cells)) {
      if (!columnKeys.has(cellKey)) {
        addDiagnostic(
          diagnostics,
          "INVALID_BLOCK",
          `${rowPath}.cells.${cellKey}`,
          "A table cell does not match a declared column.",
          "خلية الجدول لا تطابق عموداً محدداً."
        );
      }
    }
  });
}

function sourceMapFromSnapshot(
  snapshot: ProposalSnapshot,
  diagnostics: ProposalLayoutDiagnostic[]
): ReadonlyMap<string, ProposalSourceReference> {
  const sourceMap = new Map<string, ProposalSourceReference>();
  if (!Array.isArray(snapshot.sources)) {
    addDiagnostic(
      diagnostics,
      "INVALID_SNAPSHOT",
      "sources",
      "Sources must be an array.",
      "يجب أن تكون المصادر مصفوفة."
    );
    return sourceMap;
  }
  snapshot.sources.forEach((source, index) => {
    const path = `sources[${index}]`;
    validatePlainText(source.id, `${path}.id`, diagnostics, false);
    validateLocalizedText(
      source.title,
      `${path}.title`,
      snapshot.languageMode,
      diagnostics
    );
    if (!SOURCE_KINDS.has(source.kind)) {
      addDiagnostic(
        diagnostics,
        "INVALID_SNAPSHOT",
        `${path}.kind`,
        "Unknown source kind.",
        "نوع المصدر غير معروف."
      );
    }
    if (source.locator !== undefined) {
      validatePlainText(source.locator, `${path}.locator`, diagnostics, false);
    }
    if (source.asOf !== undefined) {
      validatePlainText(source.asOf, `${path}.asOf`, diagnostics, false);
    }
    if (sourceMap.has(source.id)) {
      addDiagnostic(
        diagnostics,
        "DUPLICATE_SOURCE",
        `${path}.id`,
        `Duplicate source identity "${source.id}".`,
        `معرف مصدر مكرر "${source.id}".`
      );
    } else {
      sourceMap.set(source.id, source);
    }
  });
  return sourceMap;
}

/**
 * Validate snapshot completeness, source provenance, language parity, channel
 * support, and required preset/module identities without modifying content.
 */
export function validateProposalSnapshot(
  snapshot: ProposalSnapshot,
  options: CompileProposalLayoutOptions
): readonly ProposalLayoutDiagnostic[] {
  const diagnostics: ProposalLayoutDiagnostic[] = [];
  const requestedPreset =
    options.presetKey === undefined
      ? undefined
      : getProposalLayoutPreset(options.presetKey);
  const intentPresetKey = INTENT_LAYOUT_MAP[snapshot.intent];
  const preset =
    requestedPreset ??
    (intentPresetKey
      ? PROPOSAL_LAYOUT_PRESETS[intentPresetKey]
      : PROPOSAL_LAYOUT_PRESETS["government-formal"]);

  if (options.presetKey !== undefined && !requestedPreset) {
    addDiagnostic(
      diagnostics,
      "INVALID_PRESET",
      "presetKey",
      `Unknown proposal layout preset "${String(options.presetKey)}".`,
      `إعداد تخطيط عرض غير معروف "${String(options.presetKey)}".`
    );
  }
  if (snapshot.schemaVersion !== 1) {
    addDiagnostic(
      diagnostics,
      "INVALID_SNAPSHOT",
      "schemaVersion",
      "Only proposal snapshot schema version 1 is supported.",
      "يدعم فقط الإصدار 1 من مخطط لقطة العرض."
    );
  }
  validatePlainText(snapshot.snapshotId, "snapshotId", diagnostics, false);
  if (!Number.isInteger(snapshot.version) || snapshot.version < 1) {
    addDiagnostic(
      diagnostics,
      "INVALID_SNAPSHOT",
      "version",
      "Snapshot version must be a positive integer.",
      "يجب أن يكون إصدار اللقطة عدداً صحيحاً موجباً."
    );
  }
  if (!INTENTS.has(snapshot.intent)) {
    addDiagnostic(
      diagnostics,
      "INVALID_SNAPSHOT",
      "intent",
      "Unknown proposal intent.",
      "غرض العرض غير معروف."
    );
  }
  if (!LANGUAGE_MODES.has(snapshot.languageMode)) {
    addDiagnostic(
      diagnostics,
      "INVALID_SNAPSHOT",
      "languageMode",
      "Unknown proposal language mode.",
      "وضع لغة العرض غير معروف."
    );
  }
  if (
    preset.key === "bilingual-parallel" &&
    snapshot.languageMode !== "BILINGUAL"
  ) {
    addDiagnostic(
      diagnostics,
      "LANGUAGE_MODE_MISMATCH",
      "languageMode",
      "The bilingual-parallel preset requires bilingual snapshot content.",
      "يتطلب إعداد العرض الثنائي محتوى لقطة ثنائي اللغة."
    );
  }
  validateLocalizedText(
    snapshot.projectTitle,
    "projectTitle",
    snapshot.languageMode,
    diagnostics
  );
  validateLocalizedText(
    snapshot.bidderName,
    "bidderName",
    snapshot.languageMode,
    diagnostics
  );
  if (snapshot.tenderReference !== null) {
    validatePlainText(
      snapshot.tenderReference,
      "tenderReference",
      diagnostics,
      false
    );
  }
  validateBrand(snapshot.brand, diagnostics);
  const sources = sourceMapFromSnapshot(snapshot, diagnostics);

  if (!Array.isArray(snapshot.modules)) {
    addDiagnostic(
      diagnostics,
      "INVALID_SNAPSHOT",
      "modules",
      "Modules must be an array.",
      "يجب أن تكون الوحدات مصفوفة."
    );
    return sortDiagnostics(diagnostics);
  }

  const modulesByKey = new Map<ProposalModuleKey, ProposalModuleSnapshot>();
  snapshot.modules.forEach((snapshotModule, moduleIndex) => {
    const modulePath = `modules.${snapshotModule.key}`;
    if (!MODULE_KEY_SET.has(snapshotModule.key)) {
      addDiagnostic(
        diagnostics,
        "UNKNOWN_MODULE",
        `modules[${moduleIndex}].key`,
        `Unknown proposal module "${String(snapshotModule.key)}".`,
        `وحدة عرض غير معروفة "${String(snapshotModule.key)}".`
      );
    } else if (modulesByKey.has(snapshotModule.key)) {
      addDiagnostic(
        diagnostics,
        "DUPLICATE_MODULE",
        `modules[${moduleIndex}].key`,
        `Duplicate proposal module "${snapshotModule.key}".`,
        `وحدة عرض مكررة "${snapshotModule.key}".`
      );
    } else {
      modulesByKey.set(snapshotModule.key, snapshotModule);
    }
    validateLocalizedText(
      snapshotModule.title,
      `${modulePath}.title`,
      snapshot.languageMode,
      diagnostics
    );

    const blockKeys = new Set<string>();
    snapshotModule.blocks.forEach((block, blockIndex) => {
      if (blockKeys.has(block.key)) {
        addDiagnostic(
          diagnostics,
          "DUPLICATE_BLOCK",
          `${modulePath}.blocks[${blockIndex}].key`,
          `Duplicate block identity "${block.key}".`,
          `معرف كتلة مكرر "${block.key}".`
        );
      }
      blockKeys.add(block.key);
      validateBlock(
        block,
        modulePath,
        snapshot.languageMode,
        options.channel,
        sources,
        diagnostics
      );
    });
    snapshotModule.requiredBlockKeys.forEach((requiredBlockKey) => {
      if (!blockKeys.has(requiredBlockKey)) {
        addDiagnostic(
          diagnostics,
          "MISSING_REQUIRED_BLOCK",
          `${modulePath}.blocks.${requiredBlockKey}`,
          `Required block "${requiredBlockKey}" is missing.`,
          `الكتلة المطلوبة "${requiredBlockKey}" مفقودة.`
        );
      }
    });
  });

  for (const modulePlan of preset.modules) {
    if (modulePlan.required && !modulesByKey.has(modulePlan.key)) {
      addDiagnostic(
        diagnostics,
        "MISSING_REQUIRED_MODULE",
        `modules.${modulePlan.key}`,
        `Required module "${modulePlan.key}" is missing.`,
        `الوحدة المطلوبة "${modulePlan.key}" مفقودة.`
      );
    }
    const snapshotModule = modulesByKey.get(modulePlan.key);
    if (
      modulePlan.required &&
      snapshotModule &&
      snapshotModule.blocks.length === 0 &&
      snapshotModule.requiredBlockKeys.length === 0
    ) {
      addDiagnostic(
        diagnostics,
        "MISSING_REQUIRED_BLOCK",
        `modules.${modulePlan.key}.blocks`,
        `Required module "${modulePlan.key}" has no content blocks.`,
        `الوحدة المطلوبة "${modulePlan.key}" لا تحتوي على كتل محتوى.`
      );
    }
  }
  return sortDiagnostics(diagnostics);
}

function sortDiagnostics(
  diagnostics: readonly ProposalLayoutDiagnostic[]
): readonly ProposalLayoutDiagnostic[] {
  return [...diagnostics].sort(
    (first, second) =>
      first.path.localeCompare(second.path) ||
      first.code.localeCompare(second.code) ||
      first.message.en.localeCompare(second.message.en)
  );
}

function safeSnapshotHash(
  snapshot: ProposalSnapshot,
  diagnostics: ProposalLayoutDiagnostic[]
): string {
  try {
    return computeCanonicalHash(snapshot);
  } catch (error) {
    addDiagnostic(
      diagnostics,
      "INVALID_SNAPSHOT",
      "$",
      `Snapshot is not canonical JSON content: ${
        error instanceof Error ? error.message : "unknown canonicalization error"
      }`,
      "اللقطة ليست محتوى JSON معيارياً صالحاً."
    );
    return computeCanonicalHash({
      invalidSnapshotId:
        typeof snapshot.snapshotId === "string"
          ? snapshot.snapshotId
          : "invalid-snapshot",
    });
  }
}

/**
 * Compile one deterministic, channel-aware structural plan. Content itself is
 * hashed but is not transformed, translated, priced, or otherwise inferred.
 */
export function compileProposalLayout(
  snapshot: ProposalSnapshot,
  options: CompileProposalLayoutOptions
): CompiledProposalLayout {
  const initialDiagnostics = [
    ...validateProposalSnapshot(snapshot, options),
  ];
  const requestedPreset = options.presetKey
    ? getProposalLayoutPreset(options.presetKey)
    : undefined;
  const intentPresetKey = INTENT_LAYOUT_MAP[snapshot.intent];
  const preset =
    requestedPreset ??
    (intentPresetKey
      ? PROPOSAL_LAYOUT_PRESETS[intentPresetKey]
      : PROPOSAL_LAYOUT_PRESETS["government-formal"]);
  const snapshotHash = safeSnapshotHash(snapshot, initialDiagnostics);
  const modulesByKey = new Map<ProposalModuleKey, ProposalModuleSnapshot>();
  for (const snapshotModule of snapshot.modules) {
    if (
      MODULE_KEY_SET.has(snapshotModule.key) &&
      !modulesByKey.has(snapshotModule.key)
    ) {
      modulesByKey.set(snapshotModule.key, snapshotModule);
    }
  }

  const modules: CompiledProposalModule[] = [];
  for (const modulePlan of preset.modules) {
    const snapshotModule = modulesByKey.get(modulePlan.key);
    if (!snapshotModule) continue;
    modules.push({
      key: snapshotModule.key,
      rank: modulePlan.rank,
      required: modulePlan.required,
      role: modulePlan.role,
      orientation: modulePlan.orientation,
      title: snapshotModule.title,
      blocks: snapshotModule.blocks.map((block) => ({
        key: block.key,
        type: block.type,
        title: block.title,
        capability: PROPOSAL_CHANNEL_CAPABILITIES[block.type][options.channel],
        sourceRefs: [...block.sourceRefs],
      })),
    });
  }

  const palette = resolveProposalPalette(snapshot.brand);
  const structure = {
    schemaVersion: 1,
    snapshotHash,
    channel: options.channel,
    presetKey: preset.key,
    palette,
    modules,
  };
  const planHash = computeCanonicalHash(structure);
  const diagnostics = sortDiagnostics(initialDiagnostics);

  return deepFreeze({
    status: diagnostics.length === 0 ? "VALID" : "INVALID",
    channel: options.channel,
    presetKey: preset.key,
    snapshotId: snapshot.snapshotId,
    snapshotVersion: snapshot.version,
    snapshotHash,
    planHash,
    palette,
    modules,
    diagnostics,
  });
}

export interface GenerateProposalPptxOptions {
  readonly presetKey?: ProposalLayoutKey;
  readonly brand?: ProposalBrandInput;
}

const EVIDENCE_STATUS_LABELS: Readonly<
  Record<EvidenceStatus, LocalizedProposalText>
> = Object.freeze({
  VERIFIED: { en: "Verified", ar: "موثق" },
  PENDING: { en: "Pending", ar: "قيد الانتظار" },
  NOT_AVAILABLE: { en: "Not available", ar: "غير متاح" },
});

const NOT_AVAILABLE: LocalizedProposalText = Object.freeze({
  en: "Not available",
  ar: "غير متاح",
});

function blockBody(block: ProposalBlock): LocalizedProposalText {
  switch (block.type) {
    case "NARRATIVE":
      return block.body;
    case "BULLET_LIST":
      return {
        en: block.items.map((item) => `• ${item.en}`).join("\n"),
        ar: block.items.map((item) => `• ${item.ar}`).join("\n"),
      };
    case "TABLE": {
      const enHeader = block.columns
        .map((column) => column.label.en)
        .join("  |  ");
      const arHeader = block.columns
        .map((column) => column.label.ar)
        .join("  |  ");
      return {
        en: [
          enHeader,
          ...block.rows.map((row) =>
            block.columns
              .map((column) => row.cells[column.key]?.en ?? "")
              .join("  |  ")
          ),
        ].join("\n"),
        ar: [
          arHeader,
          ...block.rows.map((row) =>
            block.columns
              .map((column) => row.cells[column.key]?.ar ?? "")
              .join("  |  ")
          ),
        ].join("\n"),
      };
    }
    case "KPI": {
      const value = block.value ?? NOT_AVAILABLE.en;
      const valueAr = block.value ?? NOT_AVAILABLE.ar;
      const asOfEn = block.asOf ? `\nAs of: ${block.asOf}` : "";
      const asOfAr = block.asOf ? `\nكما في: ${block.asOf}` : "";
      return {
        en: `${block.label.en}: ${value}${
          block.unit ? ` ${block.unit.en}` : ""
        }${asOfEn}`,
        ar: `${block.label.ar}: ${valueAr}${
          block.unit ? ` ${block.unit.ar}` : ""
        }${asOfAr}`,
      };
    }
    case "EVIDENCE_REGISTER":
      return {
        en: block.entries
          .map(
            (entry) =>
              `• ${entry.label.en} — ${
                EVIDENCE_STATUS_LABELS[entry.status].en
              }`
          )
          .join("\n"),
        ar: block.entries
          .map(
            (entry) =>
              `• ${entry.label.ar} — ${
                EVIDENCE_STATUS_LABELS[entry.status].ar
              }`
          )
          .join("\n"),
      };
    case "COMMERCIAL_HANDOFF": {
      const enEntries = block.entries.map((entry) => {
        const amount =
          entry.amount === null
            ? NOT_AVAILABLE.en
            : `${entry.amount}${entry.currency ? ` ${entry.currency}` : ""}`;
        return `• ${entry.description.en}: ${amount}`;
      });
      const arEntries = block.entries.map((entry) => {
        const amount =
          entry.amount === null
            ? NOT_AVAILABLE.ar
            : `${entry.amount}${entry.currency ? ` ${entry.currency}` : ""}`;
        return `• ${entry.description.ar}: ${amount}`;
      });
      return {
        en: [block.instruction.en, ...enEntries].join("\n"),
        ar: [block.instruction.ar, ...arEntries].join("\n"),
      };
    }
    case "DIAGRAM":
      throw new Error(
        "DIAGRAM blocks must be rejected by PPTX validation before rendering."
      );
  }
}

function blockSourceIds(block: ProposalBlock): readonly string[] {
  const sourceIds = new Set<string>(block.sourceRefs);
  if (block.type === "EVIDENCE_REGISTER") {
    for (const entry of block.entries) {
      for (const sourceRef of entry.sourceRefs) sourceIds.add(sourceRef);
    }
  }
  if (block.type === "COMMERCIAL_HANDOFF") {
    for (const entry of block.entries) {
      for (const sourceRef of entry.sourceRefs) sourceIds.add(sourceRef);
    }
  }
  return [...sourceIds].sort();
}

function addSlideBackground(
  slide: PptxGenJS.Slide,
  shapeType: PptxGenJS.ShapeType,
  palette: ResolvedProposalPalette
): void {
  slide.background = { color: palette.backgroundColor };
  slide.addShape(shapeType, {
    x: 0,
    y: 0,
    w: 13.333,
    h: 1.18,
    line: { color: palette.primaryColor, transparency: 100 },
    fill: { color: palette.primaryColor },
  });
  slide.addShape(shapeType, {
    x: 0,
    y: 7.34,
    w: 13.333,
    h: 0.16,
    line: { color: palette.accentColor, transparency: 100 },
    fill: { color: palette.accentColor },
  });
}

function addLocalizedSlideTitle(
  slide: PptxGenJS.Slide,
  title: LocalizedProposalText,
  palette: ResolvedProposalPalette
): void {
  slide.addText(title.en, {
    x: 0.55,
    y: 0.18,
    w: 5.85,
    h: 0.7,
    fontFace: "Aptos Display",
    fontSize: 35,
    bold: true,
    color: palette.onPrimary,
    margin: 0,
    breakLine: false,
    fit: "shrink",
    valign: "middle",
  });
  slide.addText(title.ar, {
    x: 6.93,
    y: 0.18,
    w: 5.85,
    h: 0.7,
    fontFace: "Noto Sans Arabic",
    fontSize: 35,
    bold: true,
    color: palette.onPrimary,
    margin: 0,
    breakLine: false,
    fit: "shrink",
    align: "right",
    rtlMode: true,
    valign: "middle",
  });
}

function addBilingualBody(
  slide: PptxGenJS.Slide,
  body: LocalizedProposalText,
  palette: ResolvedProposalPalette
): void {
  slide.addText("English", {
    x: 0.65,
    y: 1.45,
    w: 5.75,
    h: 0.32,
    fontFace: "Aptos",
    fontSize: 16,
    bold: true,
    color: palette.secondaryColor,
    margin: 0,
  });
  slide.addText("العربية", {
    x: 6.93,
    y: 1.45,
    w: 5.75,
    h: 0.32,
    fontFace: "Noto Sans Arabic",
    fontSize: 16,
    bold: true,
    color: palette.secondaryColor,
    align: "right",
    rtlMode: true,
    margin: 0,
  });
  slide.addText(body.en, {
    x: 0.65,
    y: 1.9,
    w: 5.75,
    h: 4.82,
    fontFace: "Aptos",
    fontSize: 18,
    color: palette.onBackground,
    valign: "top",
    breakLine: false,
    fit: "shrink",
    margin: 0.08,
    paraSpaceAfter: 9,
  });
  slide.addText(body.ar, {
    x: 6.93,
    y: 1.9,
    w: 5.75,
    h: 4.82,
    fontFace: "Noto Sans Arabic",
    fontSize: 18,
    color: palette.onBackground,
    valign: "top",
    breakLine: false,
    fit: "shrink",
    margin: 0.08,
    paraSpaceAfter: 9,
    align: "right",
    rtlMode: true,
  });
}

function addCoverSlide(
  slide: PptxGenJS.Slide,
  shapeType: PptxGenJS.ShapeType,
  snapshot: ProposalSnapshot,
  block: ProposalBlock,
  palette: ResolvedProposalPalette
): void {
  slide.background = { color: palette.primaryColor };
  slide.addShape(shapeType, {
    x: 0,
    y: 6.96,
    w: 13.333,
    h: 0.54,
    line: { color: palette.accentColor, transparency: 100 },
    fill: { color: palette.accentColor },
  });
  slide.addText(snapshot.projectTitle.en, {
    x: 0.65,
    y: 0.7,
    w: 5.75,
    h: 1.45,
    fontFace: "Aptos Display",
    fontSize: 50,
    bold: true,
    color: palette.onPrimary,
    fit: "shrink",
    margin: 0,
    valign: "middle",
  });
  slide.addText(snapshot.projectTitle.ar, {
    x: 6.93,
    y: 0.7,
    w: 5.75,
    h: 1.45,
    fontFace: "Noto Sans Arabic",
    fontSize: 50,
    bold: true,
    color: palette.onPrimary,
    fit: "shrink",
    margin: 0,
    valign: "middle",
    align: "right",
    rtlMode: true,
  });
  slide.addText(snapshot.bidderName.en, {
    x: 0.65,
    y: 2.45,
    w: 5.75,
    h: 0.48,
    fontFace: "Aptos",
    fontSize: 20,
    color: palette.onPrimary,
    margin: 0,
  });
  slide.addText(snapshot.bidderName.ar, {
    x: 6.93,
    y: 2.45,
    w: 5.75,
    h: 0.48,
    fontFace: "Noto Sans Arabic",
    fontSize: 20,
    color: palette.onPrimary,
    margin: 0,
    align: "right",
    rtlMode: true,
  });
  if (snapshot.tenderReference) {
    slide.addText(
      `Tender reference: ${snapshot.tenderReference}\nمرجع المنافسة: ${snapshot.tenderReference}`,
      {
        x: 0.65,
        y: 3.12,
        w: 12.03,
        h: 0.65,
        fontFace: "Aptos",
        fontSize: 16,
        color: palette.onPrimary,
        margin: 0,
        align: "center",
      }
    );
  }
  const body = blockBody(block);
  slide.addText(body.en, {
    x: 0.65,
    y: 4.25,
    w: 5.75,
    h: 1.75,
    fontFace: "Aptos",
    fontSize: 18,
    color: palette.onPrimary,
    margin: 0,
    fit: "shrink",
    valign: "top",
  });
  slide.addText(body.ar, {
    x: 6.93,
    y: 4.25,
    w: 5.75,
    h: 1.75,
    fontFace: "Noto Sans Arabic",
    fontSize: 18,
    color: palette.onPrimary,
    margin: 0,
    fit: "shrink",
    valign: "top",
    align: "right",
    rtlMode: true,
  });
}

function slideNotes(
  plan: CompiledProposalLayout,
  compiledModule: CompiledProposalModule,
  block: ProposalBlock
): string {
  const sources = blockSourceIds(block);
  const manifest = {
    schemaVersion: 1,
    snapshotId: plan.snapshotId,
    snapshotVersion: plan.snapshotVersion,
    snapshotHash: plan.snapshotHash,
    planHash: plan.planHash,
    presetKey: plan.presetKey,
    moduleKey: compiledModule.key,
    blockKey: block.key,
    blockType: block.type,
    sourceRefs: sources,
  };
  return `[Sources]\n${
    sources.length > 0 ? sources.join("\n") : "NONE"
  }\n[Manifest]\n${JSON.stringify(manifest)}`;
}

function findSnapshotBlock(
  snapshot: ProposalSnapshot,
  moduleKey: ProposalModuleKey,
  blockKey: string
): ProposalBlock {
  const snapshotModule = snapshot.modules.find(
    (candidate) => candidate.key === moduleKey
  );
  const block = snapshotModule?.blocks.find(
    (candidate) => candidate.key === blockKey
  );
  if (!block) {
    throw new ProposalLayoutValidationError([
      diagnostic(
        "MISSING_REQUIRED_BLOCK",
        `modules.${moduleKey}.blocks.${blockKey}`,
        "A compiled block disappeared before rendering.",
        "اختفت كتلة مجمعة قبل العرض."
      ),
    ]);
  }
  return block;
}

async function presentationOutputToBuffer(
  output: string | ArrayBuffer | Blob | Uint8Array
): Promise<Buffer> {
  if (typeof output === "string") return Buffer.from(output, "binary");
  if (output instanceof Uint8Array) return Buffer.from(output);
  if (output instanceof ArrayBuffer) return Buffer.from(output);
  if (typeof Blob !== "undefined" && output instanceof Blob) {
    return Buffer.from(await output.arrayBuffer());
  }
  throw new TypeError("pptxgenjs returned an unsupported output type.");
}

/**
 * Generate a real PPTX buffer from a validated bilingual snapshot.
 *
 * The adapter only renders plain structured text. Unsupported blocks, missing
 * translations, absent required blocks, unresolved tokens, and unsourced
 * evidence/pricing all fail before pptxgenjs creates a partial file.
 */
export async function generateProposalPptx(
  snapshot: ProposalSnapshot,
  options: GenerateProposalPptxOptions = {}
): Promise<Buffer> {
  const renderSnapshot =
    options.brand === undefined
      ? snapshot
      : { ...snapshot, brand: { ...snapshot.brand, ...options.brand } };
  const plan = compileProposalLayout(renderSnapshot, {
    channel: "PPTX",
    presetKey: options.presetKey,
  });
  if (plan.status === "INVALID") {
    throw new ProposalLayoutValidationError(plan.diagnostics);
  }

  const PptxGenJSConstructor = (await import("pptxgenjs")).default;
  const pptx = new PptxGenJSConstructor();
  pptx.defineLayout({ name: "ARABCLUE_PROPOSAL_WIDE", width: 13.333, height: 7.5 });
  pptx.layout = "ARABCLUE_PROPOSAL_WIDE";
  pptx.author = `${snapshot.bidderName.en} / ${snapshot.bidderName.ar}`;
  pptx.company = `${snapshot.bidderName.en} / ${snapshot.bidderName.ar}`;
  pptx.title = `${snapshot.projectTitle.en} / ${snapshot.projectTitle.ar}`;
  pptx.subject = `Validated bilingual proposal; ${plan.snapshotHash}; ${plan.planHash}`;
  pptx.rtlMode = false;

  for (const compiledModule of plan.modules) {
    for (const compiledBlock of compiledModule.blocks) {
      if (compiledBlock.capability !== "NATIVE") {
        throw new ProposalLayoutValidationError([
          diagnostic(
            "UNSUPPORTED_BLOCK_FOR_CHANNEL",
            `modules.${compiledModule.key}.blocks.${compiledBlock.key}`,
            `Block requires ${compiledBlock.capability} handling and cannot be rendered natively to PPTX.`,
            `تتطلب الكتلة معالجة ${compiledBlock.capability} ولا يمكن عرضها أصلياً في PPTX.`
          ),
        ]);
      }
      const block = findSnapshotBlock(
        renderSnapshot,
        compiledModule.key,
        compiledBlock.key
      );
      const slide = pptx.addSlide();
      if (compiledModule.key === "cover") {
        addCoverSlide(
          slide,
          pptx.ShapeType.rect,
          renderSnapshot,
          block,
          plan.palette
        );
      } else {
        addSlideBackground(slide, pptx.ShapeType.rect, plan.palette);
        addLocalizedSlideTitle(slide, block.title, plan.palette);
        addBilingualBody(slide, blockBody(block), plan.palette);
      }
      slide.addNotes(slideNotes(plan, compiledModule, block));
    }
  }

  const output = await pptx.write({ outputType: "nodebuffer" });
  return presentationOutputToBuffer(output);
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}
