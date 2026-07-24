import type {
  LocalizedProposalText,
  ProposalBlock,
  ProposalModuleKey,
  ProposalModuleSnapshot,
  ProposalSnapshot,
} from "./proposal-layouts";
import type { ProposalSnapshotServerIdentity } from "./proposal-snapshot-identity";
import { analyzeStrongDirection } from "./bilingual-typography";

const MAX_BLOCK_TEXT = 2_200;

const REQUIRED_BILINGUAL_MODULES = Object.freeze([
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
] as const satisfies readonly ProposalModuleKey[]);

const MODULE_TITLES: Readonly<
  Record<ProposalModuleKey, LocalizedProposalText>
> = Object.freeze({
  cover: { en: "Cover", ar: "الغلاف" },
  "submission-letter": { en: "Submission letter", ar: "خطاب التقديم" },
  "document-control": { en: "Document control", ar: "ضبط الوثيقة" },
  "executive-summary": { en: "Executive summary", ar: "الملخص التنفيذي" },
  "requirements-understanding": {
    en: "Requirements understanding",
    ar: "فهم المتطلبات",
  },
  "compliance-traceability": {
    en: "Compliance and traceability",
    ar: "الامتثال والتتبع",
  },
  "technical-solution": { en: "Technical solution", ar: "الحل الفني" },
  "delivery-methodology": {
    en: "Delivery methodology",
    ar: "منهجية التنفيذ",
  },
  "governance-risk-quality-change": {
    en: "Governance, risk, quality, and change",
    ar: "الحوكمة والمخاطر والجودة والتغيير",
  },
  "team-evidence": { en: "Team evidence", ar: "أدلة الفريق" },
  "experience-case-studies": {
    en: "Experience and case studies",
    ar: "الخبرات ودراسات الحالة",
  },
  "service-levels-support": {
    en: "Service levels and support",
    ar: "مستويات الخدمة والدعم",
  },
  "local-content-saudization": {
    en: "Local content and Saudization",
    ar: "المحتوى المحلي والتوطين",
  },
  "commercial-boq-handoff": {
    en: "Commercial and BoQ handoff",
    ar: "التسليم التجاري وجدول الكميات",
  },
  "assumptions-dependencies-deviations": {
    en: "Assumptions, dependencies, and deviations",
    ar: "الافتراضات والاعتماديات والانحرافات",
  },
  "appendices-evidence-validation": {
    en: "Appendices and evidence validation",
    ar: "الملاحق والتحقق من الأدلة",
  },
});

interface MarkdownSection {
  readonly heading: string;
  readonly body: string;
}

export interface HydrateProposalSnapshotInput {
  readonly proposalId: string;
  readonly proposalVersion: number;
  readonly expectedSnapshotRevision: number;
  readonly contentMd: LocalizedProposalText;
  readonly sourceUpdatedAt: string;
  readonly identity: ProposalSnapshotServerIdentity;
}

export type ProposalDraftLanguageDiagnosticCode =
  | "MISSING_ENGLISH_CONTENT"
  | "MISSING_ARABIC_CONTENT"
  | "ENGLISH_STRONG_SCRIPT_MISSING"
  | "ARABIC_STRONG_SCRIPT_MISSING";

export interface ProposalDraftLanguageDiagnostic {
  readonly code: ProposalDraftLanguageDiagnosticCode;
  readonly path: "contentMd.en" | "contentMd.ar";
  readonly message: string;
}

/**
 * Coarse, fail-closed script sanity check for the two explicit draft inputs.
 *
 * This deliberately checks only for the expected strong script. It allows
 * numbers, punctuation, product names, identifiers, and technical terms from
 * the other language, but it will not accept two same-language drafts as a
 * bilingual submission.
 */
export function validateProposalDraftLanguageDirections(
  contentMd: LocalizedProposalText
): readonly ProposalDraftLanguageDiagnostic[] {
  const diagnostics: ProposalDraftLanguageDiagnostic[] = [];
  const english = contentMd.en.trim();
  const arabic = contentMd.ar.trim();

  if (!english) {
    diagnostics.push({
      code: "MISSING_ENGLISH_CONTENT",
      path: "contentMd.en",
      message: "Explicit English proposal content is required.",
    });
  } else if (analyzeStrongDirection(english).latinLetterCount === 0) {
    diagnostics.push({
      code: "ENGLISH_STRONG_SCRIPT_MISSING",
      path: "contentMd.en",
      message:
        "The English draft must contain Latin-script text; numbers and technical terms alone are not sufficient.",
    });
  }

  if (!arabic) {
    diagnostics.push({
      code: "MISSING_ARABIC_CONTENT",
      path: "contentMd.ar",
      message: "Explicit Arabic proposal content is required.",
    });
  } else if (analyzeStrongDirection(arabic).arabicLetterCount === 0) {
    diagnostics.push({
      code: "ARABIC_STRONG_SCRIPT_MISSING",
      path: "contentMd.ar",
      message:
        "The Arabic draft must contain Arabic-script text; numbers and technical terms alone are not sufficient.",
    });
  }

  return diagnostics;
}

export class ProposalSnapshotHydrationError extends Error {
  readonly code = "BILINGUAL_LANGUAGE_DIRECTION_INVALID";
  readonly diagnostics: readonly ProposalDraftLanguageDiagnostic[];

  constructor(diagnostics: readonly ProposalDraftLanguageDiagnostic[]) {
    super("Explicit proposal drafts failed bilingual script validation.");
    this.name = "ProposalSnapshotHydrationError";
    this.diagnostics = diagnostics;
  }
}

function normalizeInlineMarkdown(value: string): string {
  return value
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/gu, "$1 ($2)")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/gu, "$1 ($2)")
    .replace(/(\*\*|__)(.*?)\1/gu, "$2")
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/gu, "$1")
    .replace(/(?<!_)_([^_\n]+)_(?!_)/gu, "$1")
    .replace(/~~([^~\n]+)~~/gu, "$1")
    .replace(/`([^`\n]+)`/gu, "$1")
    .trim();
}

function markdownLineToPlainText(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed || /^(```|~~~)/u.test(trimmed)) return null;
  if (/^(?:-{3,}|\*{3,}|_{3,})$/u.test(trimmed)) return null;
  if (
    /^\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?$/u.test(
      trimmed
    )
  ) {
    return null;
  }
  const withoutPrefix = trimmed
    .replace(/^>\s?/u, "")
    .replace(/^[-*+]\s+/u, "• ")
    .replace(/^(\d+)[.)]\s+/u, "$1. ");
  const tableText =
    withoutPrefix.startsWith("|") && withoutPrefix.endsWith("|")
      ? withoutPrefix
          .slice(1, -1)
          .split("|")
          .map((cell) => cell.trim())
          .join(" | ")
      : withoutPrefix;
  return normalizeInlineMarkdown(tableText);
}

function parseMarkdownSections(markdown: string): readonly MarkdownSection[] {
  const sections: MarkdownSection[] = [];
  let heading = "";
  let lines: string[] = [];
  let inCodeFence = false;
  const flush = () => {
    const body = lines
      .map(markdownLineToPlainText)
      .filter((line): line is string => Boolean(line))
      .join("\n")
      .trim();
    if (body || heading) {
      sections.push({
        heading: normalizeInlineMarkdown(heading),
        body,
      });
    }
    lines = [];
  };

  for (const rawLine of markdown.replace(/\r\n?/gu, "\n").split("\n")) {
    if (/^\s*(```|~~~)/u.test(rawLine)) {
      inCodeFence = !inCodeFence;
      continue;
    }
    const match = !inCodeFence
      ? rawLine.match(/^\s*#{1,4}\s+(.+?)\s*#*\s*$/u)
      : null;
    if (match) {
      flush();
      heading = match[1];
      continue;
    }
    lines.push(rawLine);
  }
  flush();
  return sections;
}

function classifySection(heading: string): ProposalModuleKey {
  const value = heading.toLocaleLowerCase("en");
  const rules: readonly [
    RegExp,
    ProposalModuleKey,
  ][] = [
    [/(submission\s+letter|cover\s+letter|خطاب\s+التقديم)/iu, "submission-letter"],
    [/(document\s+control|ضبط\s+الوثيقة)/iu, "document-control"],
    [/(executive\s+summary|الملخص\s+التنفيذي)/iu, "executive-summary"],
    [
      /(requirement|understanding|scope|evaluation|coverage|فهم|متطلب|نطاق|تغطية|معايير\s+التقييم)/iu,
      "requirements-understanding",
    ],
    [
      /(compliance|traceability|regulatory|امتثال|التزام|تنظيم|تتبع)/iu,
      "compliance-traceability",
    ],
    [
      /(local\s+content|saudi[sz]ation|محتوى\s+محلي|سعودة|توطين)/iu,
      "local-content-saudization",
    ],
    [
      /(commercial|financial|boq|bill\s+of\s+quantit|مالي|تجاري|جدول\s+الكميات)/iu,
      "commercial-boq-handoff",
    ],
    [
      /(service\s+level|support|sla|استمرارية|مستوى\s+الخدمة|الدعم)/iu,
      "service-levels-support",
    ],
    [/(team|qualification|فريق|مؤهل)/iu, "team-evidence"],
    [
      /(experience|case\s+stud|past\s+project|خبر|مشاريع\s+سابقة|دراسة\s+حالة)/iu,
      "experience-case-studies",
    ],
    [
      /(governance|risk|quality|change|حوكمة|مخاطر|جودة|تغيير)/iu,
      "governance-risk-quality-change",
    ],
    [
      /(methodology|delivery|implementation|transition|training|منهجية|تنفيذ|تسليم|انتقال|تدريب)/iu,
      "delivery-methodology",
    ],
    [
      /(technical|solution|architecture|security|privacy|تقني|فني|حل|معمارية|أمن|خصوصية)/iu,
      "technical-solution",
    ],
    [
      /(assumption|dependenc|deviation|افتراض|اعتمادي|انحراف)/iu,
      "assumptions-dependencies-deviations",
    ],
    [
      /(append|evidence|validation|gap|مرفق|ملحق|دليل|تحقق|فجوة)/iu,
      "appendices-evidence-validation",
    ],
  ];
  return (
    rules.find(([pattern]) => pattern.test(value))?.[1] ??
    "appendices-evidence-validation"
  );
}

function chunkText(value: string): readonly string[] {
  const chunks: string[] = [];
  let remaining = value.trim();
  while (remaining.length > MAX_BLOCK_TEXT) {
    const window = remaining.slice(0, MAX_BLOCK_TEXT + 1);
    const breakAt = Math.max(
      window.lastIndexOf("\n"),
      window.lastIndexOf(". "),
      window.lastIndexOf("، "),
      window.lastIndexOf(" ")
    );
    const boundary = breakAt >= MAX_BLOCK_TEXT / 2 ? breakAt + 1 : MAX_BLOCK_TEXT;
    chunks.push(remaining.slice(0, boundary).trim());
    remaining = remaining.slice(boundary).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

function gapBlock(
  moduleKey: ProposalModuleKey
): Extract<ProposalBlock, { type: "EVIDENCE_REGISTER" }> {
  return {
    type: "EVIDENCE_REGISTER",
    key: `${moduleKey}.not-available`,
    title: MODULE_TITLES[moduleKey],
    sourceRequired: false,
    sourceRefs: [],
    entries: [
      {
        key: "current-draft-content",
        label: {
          en: "No matching section was present in the current draft",
          ar: "لم يوجد قسم مطابق في المسودة الحالية",
        },
        status: "NOT_AVAILABLE",
        sourceRefs: [],
      },
    ],
  };
}

/**
 * Mechanically hydrate explicit English and Arabic Markdown into the
 * structured engine. Text is never translated, expanded, or promoted to
 * verified evidence. Missing formal sections remain visible NOT_AVAILABLE
 * gaps.
 */
export function hydrateProposalSnapshotFromMarkdown(
  input: HydrateProposalSnapshotInput
): ProposalSnapshot {
  const languageDiagnostics = validateProposalDraftLanguageDirections(
    input.contentMd
  );
  if (languageDiagnostics.length > 0) {
    throw new ProposalSnapshotHydrationError(languageDiagnostics);
  }
  const sourceIds = {
    en: `current-draft-en:${input.proposalId}:v${input.proposalVersion}`,
    ar: `current-draft-ar:${input.proposalId}:v${input.proposalVersion}`,
  };
  const blocks = new Map<ProposalModuleKey, ProposalBlock[]>();
  const append = (key: ProposalModuleKey, block: ProposalBlock) => {
    blocks.set(key, [...(blocks.get(key) ?? []), block]);
  };

  append("cover", {
    type: "NARRATIVE",
    key: "cover.server-identity",
    title: MODULE_TITLES.cover,
    body: input.identity.projectTitle,
    sourceRequired: false,
    sourceRefs: [],
  });
  const tenderReferenceEn =
    input.identity.tenderReference ?? "Not recorded in the project record";
  const tenderReferenceAr =
    input.identity.tenderReference ?? "غير مسجل في سجل المشروع";
  append("document-control", {
    type: "NARRATIVE",
    key: "document-control.server-record",
    title: MODULE_TITLES["document-control"],
    body: {
      en: `Tender reference: ${tenderReferenceEn}\nContent version: ${input.proposalVersion}`,
      ar: `مرجع المنافسة: ${tenderReferenceAr}\nإصدار المحتوى: ${input.proposalVersion}`,
    },
    sourceRequired: false,
    sourceRefs: [],
  });

  type ContentChunk = {
    readonly heading: string;
    readonly body: string;
  };
  const chunksByLanguage: Record<
    "en" | "ar",
    Map<ProposalModuleKey, ContentChunk[]>
  > = {
    en: new Map(),
    ar: new Map(),
  };
  for (const language of ["en", "ar"] as const) {
    for (const section of parseMarkdownSections(
      input.contentMd[language]
    )) {
      const combined = [section.heading, section.body]
        .filter(Boolean)
        .join("\n")
        .trim();
      if (!combined) continue;
      const moduleKey = classifySection(section.heading);
      const existing = chunksByLanguage[language].get(moduleKey) ?? [];
      chunksByLanguage[language].set(moduleKey, [
        ...existing,
        ...chunkText(combined).map((body) => ({
          heading: section.heading,
          body,
        })),
      ]);
    }
  }

  let blockIndex = 0;
  const contentModuleKeys = new Set<ProposalModuleKey>([
    ...chunksByLanguage.en.keys(),
    ...chunksByLanguage.ar.keys(),
  ]);
  for (const moduleKey of contentModuleKeys) {
    const english = chunksByLanguage.en.get(moduleKey) ?? [];
    const arabic = chunksByLanguage.ar.get(moduleKey) ?? [];
    const count = Math.max(english.length, arabic.length);
    for (let index = 0; index < count; index += 1) {
      const en = english[index];
      const ar = arabic[index];
      blockIndex += 1;
      append(moduleKey, {
        type: "NARRATIVE",
        key: `${moduleKey}.draft-${blockIndex}`,
        title: {
          en: en?.heading.slice(0, 500) || MODULE_TITLES[moduleKey].en,
          ar: ar?.heading.slice(0, 500) || MODULE_TITLES[moduleKey].ar,
        },
        body: {
          en:
            en?.body ??
            "No matching English content was supplied for this paired block.",
          ar:
            ar?.body ??
            "لم يُقدّم محتوى عربي مطابق لهذه الكتلة المتوازية.",
        },
        sourceRequired: true,
        sourceRefs: [
          ...(en ? [sourceIds.en] : []),
          ...(ar ? [sourceIds.ar] : []),
        ],
      });
    }
  }

  const moduleKeys = new Set<ProposalModuleKey>([
    ...REQUIRED_BILINGUAL_MODULES,
    ...blocks.keys(),
  ]);
  const modules: ProposalModuleSnapshot[] = [...moduleKeys].map((key) => {
    const moduleBlocks = blocks.get(key) ?? [];
    const completedBlocks =
      moduleBlocks.length > 0 ? moduleBlocks : [gapBlock(key)];
    return {
      key,
      title: MODULE_TITLES[key],
      requiredBlockKeys: completedBlocks.map((block) => block.key),
      blocks: completedBlocks,
    };
  });

  return {
    schemaVersion: 1,
    snapshotId: input.proposalId,
    version: input.expectedSnapshotRevision + 1,
    intent: "BILINGUAL_SUBMISSION",
    languageMode: "BILINGUAL",
    projectTitle: input.identity.projectTitle,
    bidderName: input.identity.bidderName,
    tenderReference: input.identity.tenderReference,
    brand: input.identity.brand,
    sources: [
      {
        id: sourceIds.en,
        kind: "USER_ENTRY",
        title: {
          en: "Current English proposal draft",
          ar: "مسودة العرض الإنجليزية الحالية",
        },
        locator: `generated-proposal:${input.proposalId}:version:${input.proposalVersion}:language:en`,
        asOf: input.sourceUpdatedAt,
      },
      {
        id: sourceIds.ar,
        kind: "USER_ENTRY",
        title: {
          en: "Current Arabic proposal draft",
          ar: "مسودة العرض العربية الحالية",
        },
        locator: `generated-proposal:${input.proposalId}:version:${input.proposalVersion}:language:ar`,
        asOf: input.sourceUpdatedAt,
      },
    ],
    modules,
  };
}
