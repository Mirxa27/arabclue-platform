import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withTenant, jsonOk, ApiError } from "@/lib/api-controller";
import { certificateSchema, parseJsonBody } from "@/lib/validation";
import { computeOnboardingSteps } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

export async function GET() {
  return withTenant("session", async ({ workspace }) => {
    const items = await db.certificate.findMany({
      where: { workspaceId: workspace.id },
      orderBy: [{ expiresAt: "asc" }, { createdAt: "desc" }],
    });
    return jsonOk({ items });
  }, "certificates");
}

export async function POST(req: NextRequest) {
  return withTenant("writer", async ({ workspace }) => {
    const parsed = await parseJsonBody(req, certificateSchema);
    if (!parsed.ok) return parsed.response;
    const d = parsed.data;
    const item = await db.certificate.create({
      data: {
        workspaceId: workspace.id,
        certType: d.certType,
        name: d.name,
        number: d.number ?? null,
        issuer: d.issuer ?? null,
        issuedAt: d.issuedAt ? new Date(d.issuedAt) : null,
        expiresAt: d.expiresAt ? new Date(d.expiresAt) : null,
        filePath: d.filePath ?? null,
        alertDays: d.alertDays ?? 30,
        notes: d.notes ?? null,
      },
    });
    await computeOnboardingSteps(workspace.id);
    return jsonOk({ item }, { status: 201 });
  }, "certificates");
}

export async function PATCH(req: NextRequest) {
  return withTenant("writer", async ({ workspace }) => {
    const body = await req.json().catch(() => ({}));
    const id = typeof body.id === "string" ? body.id : null;
    if (!id) throw new ApiError("id required", 400);
    const existing = await db.certificate.findFirst({
      where: { id, workspaceId: workspace.id },
    });
    if (!existing) throw new ApiError("not found", 404);
    const parsed = certificateSchema.partial().safeParse(body);
    if (!parsed.success) throw new ApiError("Validation failed", 400);
    const d = parsed.data;
    const item = await db.certificate.update({
      where: { id },
      data: {
        ...(d.certType !== undefined ? { certType: d.certType } : {}),
        ...(d.name !== undefined ? { name: d.name } : {}),
        ...(d.number !== undefined ? { number: d.number } : {}),
        ...(d.issuer !== undefined ? { issuer: d.issuer } : {}),
        ...(d.issuedAt !== undefined
          ? { issuedAt: d.issuedAt ? new Date(d.issuedAt) : null }
          : {}),
        ...(d.expiresAt !== undefined
          ? { expiresAt: d.expiresAt ? new Date(d.expiresAt) : null }
          : {}),
        ...(d.alertDays !== undefined ? { alertDays: d.alertDays } : {}),
        ...(d.notes !== undefined ? { notes: d.notes } : {}),
      },
    });
    return jsonOk({ item });
  }, "certificates");
}

export async function DELETE(req: NextRequest) {
  return withTenant("writer", async ({ workspace }) => {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) throw new ApiError("id required", 400);
    const existing = await db.certificate.findFirst({
      where: { id, workspaceId: workspace.id },
    });
    if (!existing) throw new ApiError("not found", 404);
    await db.certificate.delete({ where: { id } });
    await computeOnboardingSteps(workspace.id);
    return jsonOk({ ok: true });
  }, "certificates");
}
