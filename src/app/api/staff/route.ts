import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withTenant, jsonOk, ApiError } from "@/lib/api-controller";
import { staffMemberSchema, parseJsonBody } from "@/lib/validation";
import { computeOnboardingSteps } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

function serialize(item: {
  requirementTags: string | null;
  [k: string]: unknown;
}) {
  return {
    ...item,
    requirementTags: item.requirementTags
      ? (() => {
          try {
            return JSON.parse(item.requirementTags!) as string[];
          } catch {
            return item.requirementTags!.split(",").map((s) => s.trim());
          }
        })()
      : [],
  };
}

export async function GET() {
  return withTenant("session", async ({ workspace }) => {
    const items = await db.staffMember.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: "desc" },
    });
    return jsonOk({ items: items.map(serialize) });
  }, "staff");
}

export async function POST(req: NextRequest) {
  return withTenant("writer", async ({ workspace }) => {
    const parsed = await parseJsonBody(req, staffMemberSchema);
    if (!parsed.ok) return parsed.response;
    const d = parsed.data;
    const item = await db.staffMember.create({
      data: {
        workspaceId: workspace.id,
        name: d.name,
        nameAr: d.nameAr ?? null,
        roleTitle: d.roleTitle,
        roleTitleAr: d.roleTitleAr ?? null,
        certifications: d.certifications ?? null,
        cvSummary: d.cvSummary ?? null,
        requirementTags: d.requirementTags
          ? JSON.stringify(d.requirementTags)
          : null,
        active: d.active ?? true,
      },
    });
    await computeOnboardingSteps(workspace.id);
    return jsonOk({ item: serialize(item) }, { status: 201 });
  }, "staff");
}

export async function PATCH(req: NextRequest) {
  return withTenant("writer", async ({ workspace }) => {
    const body = await req.json().catch(() => ({}));
    const id = typeof body.id === "string" ? body.id : null;
    if (!id) throw new ApiError("id required", 400);
    const existing = await db.staffMember.findFirst({
      where: { id, workspaceId: workspace.id },
    });
    if (!existing) throw new ApiError("not found", 404);
    const parsed = staffMemberSchema.partial().safeParse(body);
    if (!parsed.success) throw new ApiError("Validation failed", 400);
    const d = parsed.data;
    const item = await db.staffMember.update({
      where: { id },
      data: {
        ...(d.name !== undefined ? { name: d.name } : {}),
        ...(d.nameAr !== undefined ? { nameAr: d.nameAr } : {}),
        ...(d.roleTitle !== undefined ? { roleTitle: d.roleTitle } : {}),
        ...(d.roleTitleAr !== undefined ? { roleTitleAr: d.roleTitleAr } : {}),
        ...(d.certifications !== undefined
          ? { certifications: d.certifications }
          : {}),
        ...(d.cvSummary !== undefined ? { cvSummary: d.cvSummary } : {}),
        ...(d.requirementTags !== undefined
          ? { requirementTags: JSON.stringify(d.requirementTags) }
          : {}),
        ...(d.active !== undefined ? { active: d.active } : {}),
      },
    });
    return jsonOk({ item: serialize(item) });
  }, "staff");
}

export async function DELETE(req: NextRequest) {
  return withTenant("writer", async ({ workspace }) => {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) throw new ApiError("id required", 400);
    const existing = await db.staffMember.findFirst({
      where: { id, workspaceId: workspace.id },
    });
    if (!existing) throw new ApiError("not found", 404);
    await db.staffMember.delete({ where: { id } });
    await computeOnboardingSteps(workspace.id);
    return jsonOk({ ok: true });
  }, "staff");
}
