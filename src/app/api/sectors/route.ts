import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withTenant, jsonOk, ApiError } from "@/lib/api-controller";
import { targetSectorSchema, parseJsonBody } from "@/lib/validation";
import { computeOnboardingSteps } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

export async function GET() {
  return withTenant("session", async ({ workspace }) => {
    const items = await db.targetSector.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { sector: "asc" },
    });
    return jsonOk({ items });
  }, "sectors");
}

export async function POST(req: NextRequest) {
  return withTenant("writer", async ({ workspace }) => {
    const parsed = await parseJsonBody(req, targetSectorSchema);
    if (!parsed.ok) return parsed.response;
    const d = parsed.data;
    const item = await db.targetSector.upsert({
      where: {
        workspaceId_sector: { workspaceId: workspace.id, sector: d.sector },
      },
      create: {
        workspaceId: workspace.id,
        sector: d.sector,
        notes: d.notes ?? null,
      },
      update: { notes: d.notes ?? null },
    });
    await computeOnboardingSteps(workspace.id);
    return jsonOk({ item }, { status: 201 });
  }, "sectors");
}

export async function DELETE(req: NextRequest) {
  return withTenant("writer", async ({ workspace }) => {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) throw new ApiError("id required", 400);
    const existing = await db.targetSector.findFirst({
      where: { id, workspaceId: workspace.id },
    });
    if (!existing) throw new ApiError("not found", 404);
    await db.targetSector.delete({ where: { id } });
    await computeOnboardingSteps(workspace.id);
    return jsonOk({ ok: true });
  }, "sectors");
}
