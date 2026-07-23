import type { OnboardingStepKey } from "./types";

/**
 * Client-safe onboarding step metadata.
 * Keep this free of db / auth / redis / LLM imports so dashboard UI can use it.
 */
export const ONBOARDING_STEPS: {
  key: OnboardingStepKey;
  required: boolean;
  labelEn: string;
  labelAr: string;
}[] = [
  { key: "brand", required: true, labelEn: "Brand identity", labelAr: "الهوية البصرية" },
  { key: "legal", required: true, labelEn: "Legal & compliance", labelAr: "القانوني والامتثال" },
  { key: "trackRecord", required: true, labelEn: "Track record", labelAr: "سجل المشاريع" },
  { key: "humanCapital", required: false, labelEn: "Human capital", labelAr: "رأس المال البشري" },
  { key: "methodologies", required: false, labelEn: "Methodologies", labelAr: "المنهجيات" },
  { key: "contentLibrary", required: false, labelEn: "Content library", labelAr: "مكتبة المحتوى" },
  { key: "partnerships", required: false, labelEn: "Partnerships", labelAr: "الشراكات" },
  { key: "sectors", required: false, labelEn: "Sectors & bid history", labelAr: "القطاعات وسجل العطاءات" },
  { key: "approvalChain", required: true, labelEn: "Approval chain", labelAr: "سلسلة الاعتماد" },
  { key: "restrictions", required: true, labelEn: "Restrictions", labelAr: "القيود والحساسيات" },
];
