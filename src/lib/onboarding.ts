import { db } from "./db";
import type { OnboardingStepKey } from "./types";
import { ApiError } from "./api-controller";
export { ONBOARDING_STEPS } from "./onboarding-steps";
import { ONBOARDING_STEPS } from "./onboarding-steps";

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
