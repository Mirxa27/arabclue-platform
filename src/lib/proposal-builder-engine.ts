import type {
  ProposalSection,
  SectionType,
  LocalizedString,
  LocaleCode,
  ValidationSummary,
  ProposalMetadata,
} from "./proposal-builder-types";

type SectionValidation = {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  completenessScore: number;
};

const SECTION_DEFAULTS: Record<SectionType, {
  label: LocalizedString;
  defaultContent: LocalizedString;
  isRequiredByDefault: boolean;
}> = {
  cover: {
    label: { ar: "صفحة الغلاف", en: "Cover Page" },
    defaultContent: {
      ar: "# [اسم المشروع]\n\n**المقدم من:** [اسم الشركة]\n\n**التاريخ:** [التاريخ]\n\n**المرجع:** [رقم المرجع]",
      en: "# [Project Name]\n\n**Submitted by:** [Company Name]\n\n**Date:** [Date]\n\n**Reference:** [Reference Number]",
    },
    isRequiredByDefault: true,
  },
  "executive-summary": {
    label: { ar: "الملخص التنفيذي", en: "Executive Summary" },
    defaultContent: {
      ar: "## الملخص التنفيذي\n\n[اكتب ملخصاً تنفيذياً يوضح فهمك لمتطلبات العميل والحل المقترح والقيمة المضافة]",
      en: "## Executive Summary\n\n[Write an executive summary demonstrating understanding of client requirements, proposed solution, and value proposition]",
    },
    isRequiredByDefault: true,
  },
  "technical-approach": {
    label: { ar: "المنهج الفني", en: "Technical Approach" },
    defaultContent: {
      ar: "## المنهج الفني\n\n### فهم المتطلبات\n[وصف فهمك للمتطلبات]\n\n### الحل المقترح\n[وصف الحل التقني المقترح]\n\n### المنهجية\n[وصف منهجية التنفيذ]",
      en: "## Technical Approach\n\n### Understanding of Requirements\n[Describe your understanding of requirements]\n\n### Proposed Solution\n[Describe the proposed technical solution]\n\n### Methodology\n[Describe implementation methodology]",
    },
    isRequiredByDefault: true,
  },
  pricing: {
    label: { ar: "التسعير", en: "Pricing" },
    defaultContent: {
      ar: "## العرض المالي\n\n| البند | الوحدة | الكمية | سعر الوحدة | الإجمالي |\n|-------|--------|--------|------------|----------|\n| [البند 1] | [الوحدة] | [الكمية] | [السعر] | [الإجمالي] |",
      en: "## Financial Proposal\n\n| Item | Unit | Qty | Unit Price | Total |\n|------|------|-----|------------|-------|\n| [Item 1] | [Unit] | [Qty] | [Price] | [Total] |",
    },
    isRequiredByDefault: false,
  },
  team: {
    label: { ar: "فريق العمل", en: "Team" },
    defaultContent: {
      ar: "## فريق العمل\n\n### مدير المشروع\n- **الاسم:** [الاسم]\n- **المؤهلات:** [المؤهلات]\n- **الخبرة:** [سنوات الخبرة]",
      en: "## Project Team\n\n### Project Manager\n- **Name:** [Name]\n- **Qualifications:** [Qualifications]\n- **Experience:** [Years of experience]",
    },
    isRequiredByDefault: false,
  },
  qualifications: {
    label: { ar: "المؤهلات", en: "Qualifications" },
    defaultContent: {
      ar: "## المؤهلات والخبرات\n\n### الشهادات\n- [الشهادة 1]\n- [الشهادة 2]\n\n### المشاريع السابقة\n- [المشروع 1]\n- [المشروع 2]",
      en: "## Qualifications & Experience\n\n### Certifications\n- [Certification 1]\n- [Certification 2]\n\n### Past Projects\n- [Project 1]\n- [Project 2]",
    },
    isRequiredByDefault: false,
  },
  timeline: {
    label: { ar: "الجدول الزمني", en: "Timeline" },
    defaultContent: {
      ar: "## الجدول الزمني\n\n| المرحلة | المدة | المخرجات |\n|---------|-------|----------|\n| [المرحلة 1] | [المدة] | [المخرجات] |",
      en: "## Project Timeline\n\n| Phase | Duration | Deliverables |\n|-------|----------|--------------|\n| [Phase 1] | [Duration] | [Deliverables] |",
    },
    isRequiredByDefault: false,
  },
  compliance: {
    label: { ar: "الامتثال", en: "Compliance" },
    defaultContent: {
      ar: "## الامتثال والمتطلبات\n\n### الامتثال التنظيمي\n- NCA: [الحالة]\n- PDPL: [الحالة]\n\n### المتطلبات الخاصة\n- [المتطلب 1]: [الحالة]",
      en: "## Compliance & Requirements\n\n### Regulatory Compliance\n- NCA: [Status]\n- PDPL: [Status]\n\n### Specific Requirements\n- [Requirement 1]: [Status]",
    },
    isRequiredByDefault: false,
  },
  appendix: {
    label: { ar: "الملاحق", en: "Appendices" },
    defaultContent: {
      ar: "## الملاحق\n\n### ملحق أ: [العنوان]\n[المحتوى]\n\n### ملحق ب: [العنوان]\n[المحتوى]",
      en: "## Appendices\n\n### Appendix A: [Title]\n[Content]\n\n### Appendix B: [Title]\n[Content]",
    },
    isRequiredByDefault: false,
  },
};

export function createProposalSection(
  type: SectionType,
  sortOrder: number,
  overrides?: Partial<ProposalSection>
): ProposalSection {
  const defaults = SECTION_DEFAULTS[type];
  const sectionKey = `${type}-${Date.now().toString(36)}`;

  return {
    id: overrides?.id ?? crypto.randomUUID(),
    sectionKey: overrides?.sectionKey ?? sectionKey,
    sectionType: type,
    sortOrder,
    title: overrides?.title ?? { ...defaults.label },
    content: overrides?.content ?? { ...defaults.defaultContent },
    metadata: overrides?.metadata ?? {},
    isRequired: overrides?.isRequired ?? defaults.isRequiredByDefault,
    isVisible: overrides?.isVisible ?? true,
  };
}

export function getDefaultSections(): ProposalSection[] {
  const requiredTypes: SectionType[] = ["cover", "executive-summary", "technical-approach"];
  return requiredTypes.map((type, index) => createProposalSection(type, index));
}

export function sectionsFromTemplateTypes(types: SectionType[]): ProposalSection[] {
  return types.map((type, index) => createProposalSection(type, index));
}

export function reorderSections(
  sections: ProposalSection[],
  fromIndex: number,
  toIndex: number
): ProposalSection[] {
  const result = [...sections];
  const [moved] = result.splice(fromIndex, 1);
  result.splice(toIndex, 0, moved);
  return result.map((section, index) => ({ ...section, sortOrder: index }));
}

export function validateSection(section: ProposalSection): SectionValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!section.title.ar.trim() && !section.title.en.trim()) {
    errors.push("Section title is required in at least one language");
  }

  const hasArContent = section.content.ar.trim().length > 0;
  const hasEnContent = section.content.en.trim().length > 0;

  if (!hasArContent && !hasEnContent) {
    if (section.isRequired) {
      errors.push("Required section has no content");
    } else {
      warnings.push("Section has no content");
    }
  } else if (!hasArContent) {
    warnings.push("Arabic content is missing");
  } else if (!hasEnContent) {
    warnings.push("English content is missing");
  }

  const placeholderPatterns = /\[(?:[^\]]+)\]/g;
  const arPlaceholders = (section.content.ar.match(placeholderPatterns) || []).length;
  const enPlaceholders = (section.content.en.match(placeholderPatterns) || []).length;

  if (arPlaceholders > 0 || enPlaceholders > 0) {
    warnings.push(`Contains ${arPlaceholders + enPlaceholders} placeholder(s) that need to be filled`);
  }

  let completenessScore = 100;
  if (errors.length > 0) completenessScore -= 50;
  if (!hasArContent) completenessScore -= 20;
  if (!hasEnContent) completenessScore -= 20;
  completenessScore -= (arPlaceholders + enPlaceholders) * 5;
  completenessScore = Math.max(0, completenessScore);

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    completenessScore,
  };
}

export function sectionsToMarkdown(
  sections: ProposalSection[],
  locale: LocaleCode = "en"
): string {
  return sections
    .filter((section) => section.isVisible !== false)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((section) => {
      const title =
        section.title[locale]?.trim() ||
        section.title.en?.trim() ||
        section.title.ar?.trim() ||
        section.sectionType;
      const content =
        section.content[locale]?.trim() ||
        section.content.en?.trim() ||
        section.content.ar?.trim() ||
        "";
      return `## ${title}\n\n${content}`.trim();
    })
    .join("\n\n");
}

export function sectionsToPrintableHtml(
  sections: ProposalSection[],
  metadata: { title: LocalizedString },
  locale: LocaleCode = "en"
): string {
  const docTitle =
    metadata.title[locale]?.trim() ||
    metadata.title.en ||
    metadata.title.ar ||
    "Proposal";
  const body = sectionsToMarkdown(sections, locale)
    .split("\n")
    .map((line) => {
      if (line.startsWith("## ")) {
        return `<h2>${escapeHtml(line.slice(3))}</h2>`;
      }
      if (!line.trim()) return "";
      return `<p>${escapeHtml(line)}</p>`;
    })
    .join("\n");
  const dir = locale === "ar" ? "rtl" : "ltr";
  return `<!DOCTYPE html>
<html lang="${locale}" dir="${dir}">
<head>
<meta charset="utf-8"/>
<title>${escapeHtml(docTitle)}</title>
<style>
  body { font-family: "IBM Plex Sans Arabic", "Segoe UI", sans-serif; margin: 2rem; line-height: 1.6; color: #0f172a; }
  h1 { font-size: 1.75rem; margin-bottom: 1.5rem; }
  h2 { font-size: 1.2rem; margin-top: 1.5rem; border-bottom: 1px solid #e2e8f0; padding-bottom: 0.35rem; }
  p { white-space: pre-wrap; margin: 0.5rem 0; }
</style>
</head>
<body>
<h1>${escapeHtml(docTitle)}</h1>
${body}
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function validateProposalSections(sections: ProposalSection[]): ValidationSummary {
  const validations = sections.map(validateSection);
  const totalSections = sections.length;
  const validSections = validations.filter((v) => v.isValid).length;
  const overallScore =
    validations.length > 0
      ? Math.round(validations.reduce((sum, v) => sum + v.completenessScore, 0) / validations.length)
      : 0;

  const criticalErrors: string[] = [];
  const warnings: string[] = [];

  validations.forEach((v, i) => {
    const label = sections[i].title.en || sections[i].title.ar;
    v.errors.forEach((err) => criticalErrors.push(`${label}: ${err}`));
    v.warnings.forEach((warn) => warnings.push(`${label}: ${warn}`));
  });

  return {
    ok: criticalErrors.length === 0,
    blocking: criticalErrors.length > 0,
    issues: [],
    criticalErrors: criticalErrors.map((msg) => ({
      code: "validation_error",
      severity: "error" as const,
      message: { ar: msg, en: msg },
    })),
    completenessPercent: overallScore,
    overallScore,
  };
}

export function getSectionLabel(type: SectionType, locale: "ar" | "en"): string {
  return SECTION_DEFAULTS[type].label[locale];
}

export function getAvailableSectionTypes(): SectionType[] {
  return Object.keys(SECTION_DEFAULTS) as SectionType[];
}

export function getSectionDefinitions() {
  return Object.entries(SECTION_DEFAULTS).map(([type, def]) => ({
    type: type as SectionType,
    label: def.label,
    isRequiredByDefault: def.isRequiredByDefault,
  }));
}

export function duplicateSection(section: ProposalSection): ProposalSection {
  return {
    ...section,
    id: crypto.randomUUID(),
    sectionKey: `${section.sectionType}-${Date.now().toString(36)}`,
    title: { ...section.title },
    content: { ...section.content },
    metadata: section.metadata ? { ...section.metadata } : undefined,
  };
}

export function mergeTemplateSections(
  existing: ProposalSection[],
  templateSections: ProposalSection[]
): ProposalSection[] {
  const existingTypes = new Set(existing.map((s) => s.sectionType));
  const newSections = templateSections
    .filter((s) => !existingTypes.has(s.sectionType))
    .map((s, i) => ({
      ...s,
      id: crypto.randomUUID(),
      sectionKey: `${s.sectionType}-${Date.now().toString(36)}-${i}`,
      sortOrder: existing.length + i,
    }));
  return [...existing, ...newSections];
}