/**
 * Shared extension remote-config catalog.
 * Chrome extension loads this via GET /api/platform-agent/extension/config
 * so clients do not hardcode portal/category business data.
 */

export type ExtensionPortal = {
  id: string;
  name: string;
  baseUrl: string;
  listUrl: string;
  detailUrlPattern: string;
  originPattern: string;
};

export type ExtensionCategory = {
  id: string;
  labelEn: string;
  labelAr: string;
  keywords: string[];
};

export const EXTENSION_DEFAULT_PORTALS: ExtensionPortal[] = [
  {
    id: "etimad",
    name: "Etimad",
    baseUrl: "https://tenders.etimad.sa",
    listUrl: "https://tenders.etimad.sa/Tender/AllTendersForVisitor",
    detailUrlPattern: "/Tender/Details",
    originPattern: "https://(tenders.)?etimad.sa",
  },
];

const KEYWORDS: Record<string, string[]> = {
  IT: [
    "تقنية",
    "برمجيات",
    "أنظمة",
    "حاسب",
    "شبكات",
    "سحابي",
    "رقمي",
    "software",
    "cloud",
    "network",
    "digital",
    "IT",
    "systems",
  ],
  construction: [
    "إنشاء",
    "بناء",
    "مقاولات",
    "تشييد",
    "construction",
    "building",
    "civil",
  ],
  consulting: [
    "استشار",
    "دراسة",
    "تحليل",
    "consulting",
    "advisory",
    "study",
  ],
  maintenance: [
    "صيانة",
    "تشغيل",
    "إصلاح",
    "maintenance",
    "operation",
    "repair",
  ],
  supply: ["توريد", "تجهيز", "شراء", "supply", "procurement"],
  services: ["خدمات", "تنظيف", "حراسة", "services", "cleaning", "security"],
  healthcare: ["صحة", "طبي", "مستشفى", "health", "medical", "hospital"],
  education: ["تعليم", "تدريب", "جامعة", "education", "training", "university"],
  security: ["أمن", "حماية", "مراقبة", "security", "protection"],
  transportation: ["نقل", "مواصلات", "طرق", "transport", "roads"],
  other: [],
};

const LABELS_EN: Record<string, string> = {
  IT: "IT & Technology",
  construction: "Construction",
  consulting: "Consulting",
  maintenance: "Maintenance",
  supply: "Supply",
  services: "Services",
  healthcare: "Healthcare",
  education: "Education",
  security: "Security",
  transportation: "Transportation",
  other: "Other",
};

const LABELS_AR: Record<string, string> = {
  IT: "تقنية المعلومات",
  construction: "إنشاءات",
  consulting: "استشارات",
  maintenance: "صيانة",
  supply: "توريد",
  services: "خدمات",
  healthcare: "صحة",
  education: "تعليم",
  security: "أمن",
  transportation: "نقل",
  other: "أخرى",
};

export const EXTENSION_CATEGORY_CATALOG: ExtensionCategory[] = Object.keys(
  KEYWORDS
).map((id) => ({
  id,
  labelEn: LABELS_EN[id] || id,
  labelAr: LABELS_AR[id] || id,
  keywords: KEYWORDS[id] || [],
}));

/** Map free-text sector labels from brand profile onto catalog category ids. */
export function mapSectorsToCategoryIds(sectors: string[]): string[] {
  const ids = new Set<string>();
  const aliases: Record<string, string> = {
    telecom: "IT",
    telecommunications: "IT",
    technology: "IT",
    tech: "IT",
    ict: "IT",
    health: "healthcare",
    medical: "healthcare",
    edu: "education",
    training: "education",
    gov: "consulting",
    finance: "consulting",
    energy: "maintenance",
  };
  for (const sector of sectors) {
    const lower = sector.toLowerCase().trim();
    const alias = aliases[lower];
    if (alias) ids.add(alias);
    for (const cat of EXTENSION_CATEGORY_CATALOG) {
      if (
        cat.id === "other" ||
        cat.id.toLowerCase() === lower ||
        cat.labelEn.toLowerCase().includes(lower) ||
        cat.labelAr.includes(sector) ||
        cat.keywords.some((k) => lower.includes(k.toLowerCase()) || sector.includes(k))
      ) {
        if (cat.id !== "other") ids.add(cat.id);
      }
    }
  }
  return [...ids];
}

export function buildExtensionMatchDefaults(input?: {
  sectors?: string[];
  capabilities?: string[];
  keywords?: string[];
  keywordsAr?: string[];
}) {
  const categories = mapSectorsToCategoryIds(input?.sectors ?? []);
  const keywords = [
    ...(input?.keywords ?? []),
    ...(input?.capabilities ?? []).filter((c) => /^[A-Za-z0-9 ._-]+$/.test(c)),
  ].slice(0, 40);
  const keywordsAr = [
    ...(input?.keywordsAr ?? []),
    ...(input?.capabilities ?? []).filter((c) => /[\u0600-\u06FF]/.test(c)),
  ].slice(0, 40);

  return {
    categories,
    keywords,
    keywordsAr,
    autoDownloadDocuments: false,
    autoStartProposal: false,
  };
}
