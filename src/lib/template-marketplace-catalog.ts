import type {
  MarketplaceFilters,
  TemplateCategory,
  TemplateMarketplaceItem,
  SectionType,
} from "./proposal-builder-types";

/**
 * Built-in catalog used when TemplateMarketplaceEntry is unavailable
 * (table not migrated yet) or empty — keeps the marketplace visually useful.
 *
 * Engagement metrics (`rating`, `ratingCount`, `downloadCount`, `usageCount`)
 * are zero on every system entry and must stay that way. They previously
 * carried invented values — 4.8 stars from 126 ratings, 1,840 downloads — which
 * the marketplace rendered next to genuine community numbers with no visual
 * distinction. Real counts accrue through TemplateMarketplaceRating and
 * marketplace-usage once the entry is actually used.
 */
export const SYSTEM_TEMPLATE_CATALOG: readonly TemplateMarketplaceItem[] = [
  {
    id: "sys-gov-rfp-standard",
    templateKey: "gov-rfp-standard",
    name: {
      en: "Government RFP — Standard Package",
      ar: "مناقصة حكومية — الحزمة القياسية",
    },
    description: {
      en: "18-section evaluator-aligned package for Saudi public tenders with compliance and coverage emphasis.",
      ar: "حزمة من 18 قسماً متوافقة مع المقيّمين للمناقصات العامة السعودية مع تركيز على الامتثال والتغطية.",
    },
    category: "government",
    industry: "public-sector",
    sectionTypes: [
      "cover",
      "executive-summary",
      "technical-approach",
      "compliance",
      "team",
      "qualifications",
      "timeline",
      "pricing",
      "appendix",
    ] as SectionType[],
    rating: 0,
    ratingCount: 0,
    downloadCount: 0,
    usageCount: 0,
    isPublic: true,
    isFeatured: true,
    version: 3,
    tags: ["etimad", "nca", "pdpl", "vision-2030"],
    createdAt: "2026-01-12T00:00:00.000Z",
    source: "system",
  },
  {
    id: "sys-it-managed-cloud",
    templateKey: "it-managed-cloud",
    name: {
      en: "IT — Managed Cloud Services",
      ar: "تقنية معلومات — خدمات سحابة مُدارة",
    },
    description: {
      en: "SLA-forward technical proposal for managed cloud, monitoring, and monthly reporting.",
      ar: "عرض فني يركز على اتفاقيات مستوى الخدمة للسحابة المُدارة والمراقبة والتقارير الشهرية.",
    },
    category: "it",
    industry: "cloud",
    sectionTypes: [
      "cover",
      "executive-summary",
      "technical-approach",
      "timeline",
      "team",
      "compliance",
      "pricing",
    ] as SectionType[],
    rating: 0,
    ratingCount: 0,
    downloadCount: 0,
    usageCount: 0,
    isPublic: true,
    isFeatured: true,
    version: 2,
    tags: ["sla", "cloud", "soc2"],
    createdAt: "2026-02-03T00:00:00.000Z",
    source: "system",
  },
  {
    id: "sys-construction-civil",
    templateKey: "construction-civil",
    name: {
      en: "Construction — Civil Works Bid",
      ar: "إنشاءات — عطاء أعمال مدنية",
    },
    description: {
      en: "Methodology, HSE, qualifications, and BoQ structure for civil infrastructure bids.",
      ar: "المنهجية والسلامة والمؤهلات وهيكل جداول الكميات لمناقصات البنية التحتية المدنية.",
    },
    category: "construction",
    industry: "civil",
    sectionTypes: [
      "cover",
      "executive-summary",
      "technical-approach",
      "qualifications",
      "timeline",
      "team",
      "pricing",
      "appendix",
    ] as SectionType[],
    rating: 0,
    ratingCount: 0,
    downloadCount: 0,
    usageCount: 0,
    isPublic: true,
    isFeatured: false,
    version: 2,
    tags: ["hse", "boq", "civil"],
    createdAt: "2026-02-18T00:00:00.000Z",
    source: "system",
  },
  {
    id: "sys-consulting-transformation",
    templateKey: "consulting-transformation",
    name: {
      en: "Consulting — Digital Transformation",
      ar: "استشارات — التحول الرقمي",
    },
    description: {
      en: "Discovery-to-roadmap consulting proposal with governance and change management.",
      ar: "عرض استشاري من الاستكشاف إلى خارطة الطريق مع الحوكمة وإدارة التغيير.",
    },
    category: "consulting",
    industry: "digital",
    sectionTypes: [
      "cover",
      "executive-summary",
      "technical-approach",
      "team",
      "timeline",
      "qualifications",
      "appendix",
    ] as SectionType[],
    rating: 0,
    ratingCount: 0,
    downloadCount: 0,
    usageCount: 0,
    isPublic: true,
    isFeatured: false,
    version: 1,
    tags: ["transformation", "governance"],
    createdAt: "2026-03-01T00:00:00.000Z",
    source: "system",
  },
  {
    id: "sys-healthcare-his",
    templateKey: "healthcare-his",
    name: {
      en: "Healthcare — HIS Implementation",
      ar: "صحة — تنفيذ نظام معلومات صحية",
    },
    description: {
      en: "Hospital information system rollout with privacy, training, and continuity sections.",
      ar: "طرح نظام معلومات صحية مع أقسام الخصوصية والتدريب واستمرارية الأعمال.",
    },
    category: "healthcare",
    industry: "his",
    sectionTypes: [
      "cover",
      "executive-summary",
      "technical-approach",
      "compliance",
      "team",
      "timeline",
      "qualifications",
      "appendix",
    ] as SectionType[],
    rating: 0,
    ratingCount: 0,
    downloadCount: 0,
    usageCount: 0,
    isPublic: true,
    isFeatured: true,
    version: 1,
    tags: ["pdpl", "his", "training"],
    createdAt: "2026-03-14T00:00:00.000Z",
    source: "system",
  },
  {
    id: "sys-general-capability",
    templateKey: "general-capability",
    name: {
      en: "General — Capability Statement",
      ar: "عام — بيان القدرات",
    },
    description: {
      en: "Lightweight bilingual capability statement for vendor prequalification packs.",
      ar: "بيان قدرات ثنائي اللغة خفيف لحزم التأهيل المسبق للموردين.",
    },
    category: "general",
    industry: null,
    sectionTypes: [
      "cover",
      "executive-summary",
      "qualifications",
      "team",
      "appendix",
    ] as SectionType[],
    rating: 0,
    ratingCount: 0,
    downloadCount: 0,
    usageCount: 0,
    isPublic: true,
    isFeatured: false,
    version: 1,
    tags: ["prequalification", "capability"],
    createdAt: "2026-04-02T00:00:00.000Z",
    source: "system",
  },
];

export function filterSystemTemplateCatalog(
  filters: MarketplaceFilters & { search?: string } = {},
): TemplateMarketplaceItem[] {
  let rows = [...SYSTEM_TEMPLATE_CATALOG];

  if (filters.category) {
    rows = rows.filter((t) => t.category === filters.category);
  }
  if (filters.isFeatured) {
    rows = rows.filter((t) => t.isFeatured);
  }
  const q = filters.search?.trim().toLowerCase();
  if (q) {
    rows = rows.filter((t) => {
      const hay = `${t.name.en} ${t.name.ar} ${t.description.en} ${t.description.ar} ${t.tags.join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }

  switch (filters.sortBy) {
    case "rating":
      rows.sort((a, b) => b.rating - a.rating);
      break;
    case "downloads":
      rows.sort((a, b) => b.downloadCount - a.downloadCount);
      break;
    case "name":
      rows.sort((a, b) => a.name.en.localeCompare(b.name.en));
      break;
    default:
      rows.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  }

  return rows;
}

export function isTemplateCategory(value: string): value is TemplateCategory {
  return (
    value === "construction" ||
    value === "it" ||
    value === "consulting" ||
    value === "government" ||
    value === "healthcare" ||
    value === "general"
  );
}
