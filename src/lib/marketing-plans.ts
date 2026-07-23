/** Marketing-facing plan copy aligned with DEFAULT_PLANS quotas. */

export type MarketingPlan = {
  code: "STARTER" | "PRO" | "ENTERPRISE";
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
  priceMonthly: number;
  priceYearly: number;
  highlight: boolean;
  featuresEn: string[];
  featuresAr: string[];
};

export const MARKETING_PLANS: MarketingPlan[] = [
  {
    code: "STARTER",
    nameEn: "Starter",
    nameAr: "المبتدئ",
    descriptionEn: "For solo bidders getting started",
    descriptionAr: "للمتنافسين الفرديين في البداية",
    priceMonthly: 299,
    priceYearly: 2990,
    highlight: false,
    featuresEn: [
      "10 proposals / month",
      "50 tender documents",
      "1 workspace",
      "Core agent pipeline",
      "PDF export · Email support",
    ],
    featuresAr: [
      "10 عطاءات شهرياً",
      "50 مستند مناقصة",
      "مساحة عمل واحدة",
      "خط وكلاء أساسي",
      "تصدير PDF · دعم بالبريد",
    ],
  },
  {
    code: "PRO",
    nameEn: "Professional",
    nameAr: "الاحترافي",
    descriptionEn: "For growing bid teams",
    descriptionAr: "لفرق العطاءات المتنامية",
    priceMonthly: 999,
    priceYearly: 9990,
    highlight: true,
    featuresEn: [
      "50 proposals / month",
      "250 documents · 3 workspaces",
      "Full agent suite + brand kit",
      "RAG company corpus",
      "PPTX · PDF · XLSX export",
      "Priority support",
    ],
    featuresAr: [
      "50 عطاءاً شهرياً",
      "250 مستنداً · 3 مساحات عمل",
      "وكلاء كاملون + هوية العلامة",
      "قاعدة معرفة الشركة",
      "تصدير PPTX · PDF · XLSX",
      "دعم ذو أولوية",
    ],
  },
  {
    code: "ENTERPRISE",
    nameEn: "Enterprise",
    nameAr: "المؤسسات",
    descriptionEn: "For large organizations",
    descriptionAr: "للمؤسسات الكبيرة",
    priceMonthly: 2999,
    priceYearly: 29990,
    highlight: false,
    featuresEn: [
      "Unlimited proposals & documents",
      "20 workspaces · audit trail",
      "RBAC · dedicated support",
      "Custom AI provider routing",
      "Enterprise RBAC & audit controls",
    ],
    featuresAr: [
      "عطاءات ومستندات بلا حد",
      "20 مساحة عمل · سجل تدقيق",
      "صلاحيات أدوار · دعم مخصص",
      "توجيه مخصص لمزودي الذكاء",
      "ضوابط RBAC وتدقيق مؤسسي",
    ],
  },
];

export function formatSar(amount: number, locale: "ar" | "en"): string {
  if (locale === "ar") {
    return `${amount.toLocaleString("ar-SA")} ر.س`;
  }
  return `SAR ${amount.toLocaleString("en-US")}`;
}
