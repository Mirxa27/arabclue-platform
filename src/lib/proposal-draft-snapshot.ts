import { DEFAULT_DOCUMENT_BRAND_COLORS, normalizeDocumentBrandColor } from "@/lib/brand-policy";
import type {
  LocalizedProposalText,
  ProposalModuleKey,
  ProposalModuleSnapshot,
  ProposalSnapshot,
  ProposalSourceReference,
} from "@/lib/proposal-layouts";

const REQUIRED_FORMAL_MODULES = [
  "cover",
  "document-control",
  "executive-summary",
  "requirements-understanding",
  "compliance-traceability",
  "technical-solution",
  "delivery-methodology",
  "assumptions-dependencies-deviations",
  "appendices-evidence-validation",
  "submission-letter",
] as const satisfies readonly ProposalModuleKey[];

const UNDRAFTED: LocalizedProposalText = {
  en: "This section has not been drafted yet.",
  ar: "لم يُكتب هذا القسم بعد.",
};

const MODULE_TITLES: Record<(typeof REQUIRED_FORMAL_MODULES)[number], LocalizedProposalText> = {
  cover: { en: "Cover", ar: "الغلاف" },
  "document-control": { en: "Document control", ar: "ضبط الوثيقة" },
  "executive-summary": { en: "Executive summary", ar: "الملخص التنفيذي" },
  "requirements-understanding": {
    en: "Requirements understanding",
    ar: "فهم المتطلبات",
  },
  "compliance-traceability": {
    en: "Compliance traceability",
    ar: "تتبع الامتثال",
  },
  "technical-solution": { en: "Technical solution", ar: "الحل التقني" },
  "delivery-methodology": { en: "Delivery methodology", ar: "منهجية التنفيذ" },
  "assumptions-dependencies-deviations": {
    en: "Assumptions and deviations",
    ar: "الافتراضات والانحرافات",
  },
  "appendices-evidence-validation": {
    en: "Appendices",
    ar: "الملاحق",
  },
  "submission-letter": { en: "Submission letter", ar: "خطاب التقديم" },
};

const HEADING_TO_MODULE: Array<{
  pattern: RegExp;
  key: (typeof REQUIRED_FORMAL_MODULES)[number];
}> = [
  { pattern: /cover|غلاف/i, key: "cover" },
  { pattern: /letter|خطاب|تقديم/i, key: "submission-letter" },
  { pattern: /control|ضبط/i, key: "document-control" },
  { pattern: /executive|ملخص/i, key: "executive-summary" },
  { pattern: /requirement|متطلب/i, key: "requirements-understanding" },
  { pattern: /compliance|امتثال|تتبع/i, key: "compliance-traceability" },
  { pattern: /method|تسليم|منهج/i, key: "delivery-methodology" },
  { pattern: /assumption|انحراف|افتراض/i, key: "assumptions-dependencies-deviations" },
  { pattern: /appendix|ملحق/i, key: "appendices-evidence-validation" },
  { pattern: /technical|solution|تقني|حل/i, key: "technical-solution" },
];

export type DraftBrandInput = {
  primaryColor?: string | null;
  secondaryColor?: string | null;
  accentColor?: string | null;
};

export type CompileDraftProposalSnapshotInput = {
  proposalId: string;
  version: number;
  contentMd: string | null;
  locale: "ar" | "en";
  projectTitle: string;
  projectTitleAr?: string | null;
  etimadRef?: string | null;
  bidderNameEn: string;
  bidderNameAr: string;
  brand: DraftBrandInput;
};

function pairFromSource(text: string, locale: "ar" | "en"): LocalizedProposalText {
  const trimmed = text.trim();
  if (!trimmed) return UNDRAFTED;
  if (locale === "ar") {
    return {
      ar: trimmed,
      en: "English wording was not provided for this section.",
    };
  }
  return {
    en: trimmed,
    ar: "لم تُوفر صياغة عربية لهذا القسم.",
  };
}

function splitMarkdownSections(contentMd: string): Map<
  (typeof REQUIRED_FORMAL_MODULES)[number],
  string
> {
  const assigned = new Map<(typeof REQUIRED_FORMAL_MODULES)[number], string[]>();
  const leftover: string[] = [];
  const chunks = contentMd.split(/^#{1,3}\s+/m);
  if (chunks.length <= 1) {
    const body = contentMd.trim();
    if (body) leftover.push(body);
  } else {
    for (const chunk of chunks) {
      const trimmed = chunk.trim();
      if (!trimmed) continue;
      const firstLine = trimmed.split(/\n/, 1)[0] ?? "";
      const rest = trimmed.slice(firstLine.length).trim();
      const body = rest.length > 0 ? `${firstLine}\n\n${rest}` : firstLine;
      const match = HEADING_TO_MODULE.find((row) => row.pattern.test(firstLine));
      if (match) {
        const prev = assigned.get(match.key) ?? [];
        prev.push(body);
        assigned.set(match.key, prev);
      } else {
        leftover.push(body);
      }
    }
  }
  const result = new Map<(typeof REQUIRED_FORMAL_MODULES)[number], string>();
  for (const [key, parts] of assigned) {
    result.set(key, parts.join("\n\n"));
  }
  if (leftover.length > 0) {
    const existing = result.get("technical-solution");
    result.set(
      "technical-solution",
      [existing, leftover.join("\n\n")].filter(Boolean).join("\n\n")
    );
  }
  return result;
}

function brandColors(brand: DraftBrandInput) {
  return {
    primaryColor: normalizeDocumentBrandColor(
      brand.primaryColor,
      DEFAULT_DOCUMENT_BRAND_COLORS.primaryColor
    ),
    secondaryColor: normalizeDocumentBrandColor(
      brand.secondaryColor,
      DEFAULT_DOCUMENT_BRAND_COLORS.secondaryColor
    ),
    accentColor: normalizeDocumentBrandColor(
      brand.accentColor,
      DEFAULT_DOCUMENT_BRAND_COLORS.accentColor
    ),
  };
}

export function applyWorkspaceBrandToSnapshot(
  snapshot: ProposalSnapshot,
  brand: DraftBrandInput
): ProposalSnapshot {
  return {
    ...snapshot,
    brand: {
      ...snapshot.brand,
      ...brandColors(brand),
    },
  };
}

export function compileDraftProposalSnapshot(
  input: CompileDraftProposalSnapshotInput
): ProposalSnapshot {
  const colors = brandColors(input.brand);
  const locale = input.locale === "ar" ? "ar" : "en";
  const titleEn = input.projectTitle.trim() || "Untitled tender";
  const titleAr = (input.projectTitleAr ?? "").trim() || titleEn;
  const bidderEn = input.bidderNameEn.trim() || "Bidder";
  const bidderAr = input.bidderNameAr.trim() || bidderEn;
  const ref = input.etimadRef?.trim() || null;
  const sections = splitMarkdownSections(input.contentMd ?? "");

  const sources: ProposalSourceReference[] = [
    {
      id: "SRC-TENDER",
      kind: "TENDER",
      title: { en: "Tender record", ar: "سجل المناقصة" },
    },
    {
      id: "SRC-WORKSPACE",
      kind: "WORKSPACE",
      title: { en: "Workspace identity", ar: "هوية مساحة العمل" },
    },
    {
      id: "SRC-DRAFT",
      kind: "USER_ENTRY",
      title: { en: "Proposal draft", ar: "مسودة العرض" },
    },
  ];

  const modules: ProposalModuleSnapshot[] = REQUIRED_FORMAL_MODULES.map((key) => {
    const mapped = sections.get(key);
    let body: LocalizedProposalText;
    let sourceRefs: readonly string[];
    if (mapped && mapped.trim()) {
      body = pairFromSource(mapped, locale);
      sourceRefs = ["SRC-DRAFT"];
    } else if (key === "cover") {
      body = {
        en: `${titleEn}${ref ? ` · ${ref}` : ""}\n${bidderEn}`,
        ar: `${titleAr}${ref ? ` · ${ref}` : ""}\n${bidderAr}`,
      };
      sourceRefs = ["SRC-TENDER", "SRC-WORKSPACE"];
    } else if (key === "document-control") {
      body = {
        en: `Draft preview. Tender reference: ${ref ?? "not recorded"}.`,
        ar: `معاينة مسودة. رقم المناقصة: ${ref ?? "غير مسجل"}.`,
      };
      sourceRefs = ["SRC-TENDER"];
    } else if (key === "submission-letter") {
      body = {
        en: `Please find our draft submission for ${titleEn}${ref ? ` (${ref})` : ""}. This letter is a designed preview, not a signed filing.`,
        ar: `نرفق مسودة تقديمنا لمناقصة ${titleAr}${ref ? ` (${ref})` : ""}. هذا الخطاب معاينة مصممة وليس إيداعاً موقّعاً.`,
      };
      sourceRefs = ["SRC-TENDER", "SRC-WORKSPACE"];
    } else {
      body = UNDRAFTED;
      sourceRefs = ["SRC-DRAFT"];
    }
    const blockKey = `${key}.statement`;
    return {
      key,
      title: MODULE_TITLES[key],
      requiredBlockKeys: [blockKey],
      blocks: [
        {
          type: "NARRATIVE",
          key: blockKey,
          title: MODULE_TITLES[key],
          body,
          sourceRequired: true,
          sourceRefs,
        },
      ],
    };
  });

  return {
    schemaVersion: 1,
    snapshotId: input.proposalId,
    version: Math.max(1, Math.floor(input.version) || 1),
    intent: "FULL_SUBMISSION",
    languageMode: "BILINGUAL",
    projectTitle: { en: titleEn, ar: titleAr },
    bidderName: { en: bidderEn, ar: bidderAr },
    tenderReference: ref,
    brand: colors,
    sources,
    modules,
  };
}
