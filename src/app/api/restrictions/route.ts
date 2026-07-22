import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withTenant, jsonOk, ApiError } from "@/lib/api-controller";
import { restrictionSchema, parseJsonBody } from "@/lib/validation";
import { computeOnboardingSteps } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

export async function GET() {
  return withTenant("session", async ({ workspace }) => {
    const items = await db.restriction.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: "desc" },
    });
    const progress = await db.onboardingProgress.findUnique({
      where: { workspaceId: workspace.id },
    });
    return jsonOk({
      items,
      restrictionsReviewed: progress?.restrictionsReviewed ?? false,
    });
  }, "restrictions");
}

export async function POST(req: NextRequest) {
  return withTenant("writer", async ({ workspace }) => {
    const parsed = await parseJsonBody(req, restrictionSchema);
    if (!parsed.ok) return parsed.response;
    const d = parsed.data;
    const item = await db.restriction.create({
      data: {
        workspaceId: workspace.id,
        restrictionType: d.restrictionType,
        text: d.text,
        active: d.active ?? true,
      },
    });
    return jsonOk({ item }, { status: 201 });
  }, "restrictions");
}

export async function DELETE(req: NextRequest) {
  return withTenant("writer", async ({ workspace }) => {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) throw new ApiError("id required", 400);
    const existing = await db.restriction.findFirst({
      where: { id, workspaceId: workspace.id },
    });
    if (!existing) throw new ApiError("not found", 404);
    await db.restriction.delete({ where: { id } });
    return jsonOk({ ok: true });
  }, "restrictions");
}
