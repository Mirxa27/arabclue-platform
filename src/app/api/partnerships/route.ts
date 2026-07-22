import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withTenant, jsonOk, ApiError } from "@/lib/api-controller";
import { partnershipSchema, parseJsonBody } from "@/lib/validation";
import { computeOnboardingSteps } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

export async function GET() {
  return withTenant("session", async ({ workspace }) => {
    const items = await db.partnership.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: "desc" },
    });
    return jsonOk({ items });
  }, "partnerships");
}

export async function POST(req: NextRequest) {
  return withTenant("writer", async ({ workspace }) => {
    const parsed = await parseJsonBody(req, partnershipSchema);
    if (!parsed.ok) return parsed.response;
    const d = parsed.data;
    const item = await db.partnership.create({
      data: {
        workspaceId: workspace.id,
        name: d.name,
        partnerType: d.partnerType,
        scope: d.scope ?? null,
        docsNote: d.docsNote ?? null,
        filePath: d.filePath ?? null,
      },
    });
    await computeOnboardingSteps(workspace.id);
    return jsonOk({ item }, { status: 201 });
  }, "partnerships");
}

export async function DELETE(req: NextRequest) {
  return withTenant("writer", async ({ workspace }) => {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) throw new ApiError("id required", 400);
    const existing = await db.partnership.findFirst({
      where: { id, workspaceId: workspace.id },
    });
    if (!existing) throw new ApiError("not found", 404);
    await db.partnership.delete({ where: { id } });
    await computeOnboardingSteps(workspace.id);
    return jsonOk({ ok: true });
  }, "partnerships");
}
