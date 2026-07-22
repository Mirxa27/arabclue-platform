import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withTenant, jsonOk } from "@/lib/api-controller";
import { computeOnboardingSteps, ONBOARDING_STEPS } from "@/lib/onboarding";
import { onboardingPatchSchema, parseJsonBody } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  return withTenant("session", async ({ workspace }) => {
    const status = await computeOnboardingSteps(workspace.id);
    return jsonOk({
      ...status,
      stepDefs: ONBOARDING_STEPS,
      workspace: {
        id: workspace.id,
        name: workspace.name,
        nameAr: workspace.nameAr,
        crNumber: workspace.crNumber,
        vatNumber: workspace.vatNumber,
      },
    });
  }, "onboarding");
}

export async function PATCH(req: NextRequest) {
  return withTenant("writer", async ({ workspace }) => {
    const parsed = await parseJsonBody(req, onboardingPatchSchema);
    if (!parsed.ok) return parsed.response;

    const existing = await db.onboardingProgress.findUnique({
      where: { workspaceId: workspace.id },
    });

    await db.onboardingProgress.upsert({
      where: { workspaceId: workspace.id },
      create: {
        workspaceId: workspace.id,
        restrictionsReviewed: parsed.data.restrictionsReviewed ?? false,
        completedSteps: JSON.stringify(parsed.data.completedSteps ?? {}),
      },
      update: {
        ...(parsed.data.restrictionsReviewed !== undefined
          ? { restrictionsReviewed: parsed.data.restrictionsReviewed }
          : {}),
        ...(parsed.data.completedSteps
          ? {
              completedSteps: JSON.stringify({
                ...(existing?.completedSteps
                  ? JSON.parse(existing.completedSteps)
                  : {}),
                ...parsed.data.completedSteps,
              }),
            }
          : {}),
      },
    });

    const status = await computeOnboardingSteps(workspace.id);
    return jsonOk(status);
  }, "onboarding");
}
