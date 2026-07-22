import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withTenant, jsonOk, ApiError } from "@/lib/api-controller";
import { methodologySchema, parseJsonBody } from "@/lib/validation";
import { computeOnboardingSteps } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

export async function GET() {
  return withTenant("session", async ({ workspace }) => {
    const items = await db.methodologyAsset.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: "desc" },
    });
    return jsonOk({ items });
  }, "methodologies");
}

export async function POST(req: NextRequest) {
  return withTenant("writer", async ({ workspace }) => {
    const parsed = await parseJsonBody(req, methodologySchema);
    if (!parsed.ok) return parsed.response;
    const d = parsed.data;
    const item = await db.methodologyAsset.create({
      data: {
        workspaceId: workspace.id,
        category: d.category,
        title: d.title,
        titleAr: d.titleAr ?? null,
        bodyMd: d.bodyMd,
        approved: d.approved ?? true,
      },
    });
    await computeOnboardingSteps(workspace.id);
    return jsonOk({ item }, { status: 201 });
  }, "methodologies");
}

export async function PATCH(req: NextRequest) {
  return withTenant("writer", async ({ workspace }) => {
    const body = await req.json().catch(() => ({}));
    const id = typeof body.id === "string" ? body.id : null;
    if (!id) throw new ApiError("id required", 400);
    const existing = await db.methodologyAsset.findFirst({
      where: { id, workspaceId: workspace.id },
    });
    if (!existing) throw new ApiError("not found", 404);
    const parsed = methodologySchema.partial().safeParse(body);
    if (!parsed.success) throw new ApiError("Validation failed", 400);
    const d = parsed.data;
    const item = await db.methodologyAsset.update({
      where: { id },
      data: {
        ...(d.category !== undefined ? { category: d.category } : {}),
        ...(d.title !== undefined ? { title: d.title } : {}),
        ...(d.titleAr !== undefined ? { titleAr: d.titleAr } : {}),
        ...(d.bodyMd !== undefined ? { bodyMd: d.bodyMd } : {}),
        ...(d.approved !== undefined ? { approved: d.approved } : {}),
      },
    });
    return jsonOk({ item });
  }, "methodologies");
}

export async function DELETE(req: NextRequest) {
  return withTenant("writer", async ({ workspace }) => {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) throw new ApiError("id required", 400);
    const existing = await db.methodologyAsset.findFirst({
      where: { id, workspaceId: workspace.id },
    });
    if (!existing) throw new ApiError("not found", 404);
    await db.methodologyAsset.delete({ where: { id } });
    await computeOnboardingSteps(workspace.id);
    return jsonOk({ ok: true });
  }, "methodologies");
}
