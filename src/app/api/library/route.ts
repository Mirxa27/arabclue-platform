import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withTenant, jsonOk, ApiError } from "@/lib/api-controller";
import { libraryItemSchema, parseJsonBody } from "@/lib/validation";
import { computeOnboardingSteps } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

export async function GET() {
  return withTenant("session", async ({ workspace }) => {
    const items = await db.contentLibraryItem.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: "desc" },
    });
    return jsonOk({ items });
  }, "library");
}

export async function POST(req: NextRequest) {
  return withTenant("writer", async ({ workspace }) => {
    const parsed = await parseJsonBody(req, libraryItemSchema);
    if (!parsed.ok) return parsed.response;
    const d = parsed.data;
    const item = await db.contentLibraryItem.create({
      data: {
        workspaceId: workspace.id,
        title: d.title,
        titleAr: d.titleAr ?? null,
        category: d.category ?? "BOILERPLATE",
        bodyMd: d.bodyMd,
        tags: d.tags ?? null,
        restricted: d.restricted ?? false,
        approved: d.approved ?? true,
      },
    });
    await computeOnboardingSteps(workspace.id);
    return jsonOk({ item }, { status: 201 });
  }, "library");
}

export async function PATCH(req: NextRequest) {
  return withTenant("writer", async ({ workspace }) => {
    const body = await req.json().catch(() => ({}));
    const id = typeof body.id === "string" ? body.id : null;
    if (!id) throw new ApiError("id required", 400);
    const existing = await db.contentLibraryItem.findFirst({
      where: { id, workspaceId: workspace.id },
    });
    if (!existing) throw new ApiError("not found", 404);
    const parsed = libraryItemSchema.partial().safeParse(body);
    if (!parsed.success) throw new ApiError("Validation failed", 400);
    const d = parsed.data;
    const item = await db.contentLibraryItem.update({
      where: { id },
      data: {
        ...(d.title !== undefined ? { title: d.title } : {}),
        ...(d.titleAr !== undefined ? { titleAr: d.titleAr } : {}),
        ...(d.category !== undefined ? { category: d.category } : {}),
        ...(d.bodyMd !== undefined ? { bodyMd: d.bodyMd } : {}),
        ...(d.tags !== undefined ? { tags: d.tags } : {}),
        ...(d.restricted !== undefined ? { restricted: d.restricted } : {}),
        ...(d.approved !== undefined ? { approved: d.approved } : {}),
      },
    });
    return jsonOk({ item });
  }, "library");
}

export async function DELETE(req: NextRequest) {
  return withTenant("writer", async ({ workspace }) => {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) throw new ApiError("id required", 400);
    const existing = await db.contentLibraryItem.findFirst({
      where: { id, workspaceId: workspace.id },
    });
    if (!existing) throw new ApiError("not found", 404);
    await db.contentLibraryItem.delete({ where: { id } });
    await computeOnboardingSteps(workspace.id);
    return jsonOk({ ok: true });
  }, "library");
}
