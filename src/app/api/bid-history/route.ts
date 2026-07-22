import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withTenant, jsonOk, ApiError } from "@/lib/api-controller";
import { bidHistorySchema, parseJsonBody } from "@/lib/validation";
import { computeOnboardingSteps } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

export async function GET() {
  return withTenant("session", async ({ workspace }) => {
    const items = await db.bidHistoryNote.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: "desc" },
    });
    return jsonOk({ items });
  }, "bid-history");
}

export async function POST(req: NextRequest) {
  return withTenant("writer", async ({ workspace }) => {
    const parsed = await parseJsonBody(req, bidHistorySchema);
    if (!parsed.ok) return parsed.response;
    const d = parsed.data;
    const item = await db.bidHistoryNote.create({
      data: {
        workspaceId: workspace.id,
        entityName: d.entityName,
        sector: d.sector ?? null,
        outcome: d.outcome,
        notes: d.notes ?? null,
        bidDate: d.bidDate ? new Date(d.bidDate) : null,
      },
    });
    await computeOnboardingSteps(workspace.id);
    return jsonOk({ item }, { status: 201 });
  }, "bid-history");
}

export async function DELETE(req: NextRequest) {
  return withTenant("writer", async ({ workspace }) => {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) throw new ApiError("id required", 400);
    const existing = await db.bidHistoryNote.findFirst({
      where: { id, workspaceId: workspace.id },
    });
    if (!existing) throw new ApiError("not found", 404);
    await db.bidHistoryNote.delete({ where: { id } });
    await computeOnboardingSteps(workspace.id);
    return jsonOk({ ok: true });
  }, "bid-history");
}
