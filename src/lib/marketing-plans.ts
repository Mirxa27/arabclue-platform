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
      "5 GB storage",
      "Core agent pipeline",
      "PDF export · Email support",
    ],
    featuresAr: [
      "10 عطاءات شهرياً",
      "50 مستند مناقصة",
      "5 غيغابايت تخزين",
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
      "250 documents · 25 GB storage",
      "Full agent suite + brand kit",
      "RAG company corpus",
      "PPTX · PDF · XLSX export",
      "Priority support",
    ],
    featuresAr: [
      "50 عطاءاً شهرياً",
      "250 مستنداً · 25 غيغابايت تخزين",
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
      "200 GB storage · 20M tokens / month",
      "Approval chain & reviewer roles",
      "All export formats · dedicated support",
      "On request: SSO · custom agents · audit export",
    ],
    featuresAr: [
      "عطاءات ومستندات بلا حد",
      "200 غيغابايت · 20 مليون رمز شهرياً",
      "سلسلة اعتماد وأدوار مراجعين",
      "جميع صيغ التصدير · دعم مخصص",
      "عند الطلب: الدخول الموحد · وكلاء مخصصون · تصدير سجل التدقيق",
    ],
  },
];

export function formatSar(amount: number, locale: "ar" | "en"): string {
  if (locale === "ar") {
    return `${amount.toLocaleString("ar-SA")} ر.س`;
  }
  return `SAR ${amount.toLocaleString("en-US")}`;
}
