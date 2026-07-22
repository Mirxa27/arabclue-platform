import { db } from "./db";
import type { OnboardingStepKey } from "./types";
import { ApiError } from "./api-controller";

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

export async function computeOnboardingSteps(workspaceId: string): Promise<{
  steps: Record<OnboardingStepKey, boolean>;
  restrictionsReviewed: boolean;
  readyForProposals: boolean;
  missing: OnboardingStepKey[];
}> {
  const [
    workspace,
    brand,
    certCount,
    pastCount,
    staffCount,
    methodCount,
    libraryCount,
    partnerCount,
    sectorCount,
    bidCount,
    policy,
    restrictionsReviewedRow,
  ] = await Promise.all([
    db.workspace.findUnique({ where: { id: workspaceId } }),
    db.brandProfile.findFirst({ where: { workspaceId } }),
    db.certificate.count({ where: { workspaceId } }),
    db.pastProject.count({ where: { workspaceId } }),
    db.staffMember.count({ where: { workspaceId, active: true } }),
    db.methodologyAsset.count({ where: { workspaceId } }),
    db.contentLibraryItem.count({ where: { workspaceId } }),
    db.partnership.count({ where: { workspaceId } }),
    db.targetSector.count({ where: { workspaceId } }),
    db.bidHistoryNote.count({ where: { workspaceId } }),
    db.approvalPolicy.findUnique({
      where: { workspaceId },
      include: { steps: true },
    }),
    db.onboardingProgress.findUnique({ where: { workspaceId } }),
  ]);

  const restrictionsReviewed =
    restrictionsReviewedRow?.restrictionsReviewed === true;

  const steps: Record<OnboardingStepKey, boolean> = {
    brand: !!(
      brand &&
      (brand.logoUrl || brand.tagline || brand.taglineAr || brand.primaryColor)
    ),
    legal: !!(workspace?.crNumber || workspace?.vatNumber || certCount > 0),
    trackRecord: pastCount > 0 || staffCount > 0,
    humanCapital: staffCount > 0,
    methodologies: methodCount > 0,
    contentLibrary: libraryCount > 0,
    partnerships: partnerCount > 0,
    sectors: sectorCount > 0 || bidCount > 0,
    approvalChain: !!(policy && policy.steps.length > 0),
    restrictions: restrictionsReviewed,
  };

  const missing = ONBOARDING_STEPS.filter(
    (s) => s.required && !steps[s.key]
  ).map((s) => s.key);

  const readyForProposals = missing.length === 0;

  await db.onboardingProgress.upsert({
    where: { workspaceId },
    create: {
      workspaceId,
      completedSteps: JSON.stringify(steps),
      restrictionsReviewed,
      readyForProposals,
    },
    update: {
      completedSteps: JSON.stringify(steps),
      readyForProposals,
    },
  });

  return { steps, restrictionsReviewed, readyForProposals, missing };
}

export async function assertOnboardingReady(workspaceId: string): Promise<void> {
  const status = await computeOnboardingSteps(workspaceId);
  if (!status.readyForProposals) {
    throw new ApiError(
      `Complete account onboarding before generating proposals. Missing: ${status.missing.join(", ")}`,
      403,
      "ONBOARDING_INCOMPLETE"
    );
  }
}
