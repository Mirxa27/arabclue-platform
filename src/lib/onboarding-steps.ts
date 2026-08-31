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
  // Not required to generate. A first-time bidder has no delivered project, and
  // the gate only counts PastProject rows carrying an approved evidence
  // document — so requiring it locked new customers out of the product with no
  // action available to them. Nothing is loosened about what may be *cited*:
  // runTechnicalArchitect already degrades to "standards-based and proposed
  // approach only" when no approved project ranks (agents/technical.ts:131), so
  // an empty track record produces an honest proposal, not an invented one.
  // The step still appears incomplete in guided setup.
  { key: "trackRecord", required: false, labelEn: "Track record", labelAr: "سجل المشاريع" },
  { key: "humanCapital", required: false, labelEn: "Human capital", labelAr: "رأس المال البشري" },
  { key: "methodologies", required: false, labelEn: "Methodologies", labelAr: "المنهجيات" },
  { key: "contentLibrary", required: false, labelEn: "Content library", labelAr: "مكتبة المحتوى" },
  { key: "partnerships", required: false, labelEn: "Partnerships", labelAr: "الشراكات" },
  { key: "sectors", required: false, labelEn: "Sectors & bid history", labelAr: "القطاعات وسجل العطاءات" },
  { key: "approvalChain", required: true, labelEn: "Approval chain", labelAr: "سلسلة الاعتماد" },
  { key: "restrictions", required: true, labelEn: "Restrictions", labelAr: "القيود والحساسيات" },
];
