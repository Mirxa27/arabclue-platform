import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getBootstrapContext } from "@/lib/bootstrap";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";

export const dynamic = "force-dynamic";

// PATCH /api/admin/ai-providers/[id] — update config OR activate
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { user } = await getBootstrapContext();
  const body = await req.json();

  // Activation is a special transactional op: deactivate all others first
  if (body.isActive === true) {
    await db.aIProviderConfig.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    });
    await audit({
      userId: user.id,
      action: AUDIT_ACTIONS.AI_PROVIDER_ACTIVATE,
      resource: "AIProviderConfig",
      resourceId: id,
      severity: "WARN",
    });
  }

  const updated = await db.aIProviderConfig.update({
    where: { id },
    data: {
      ...body,
      // never allow setting these via generic patch
      id: undefined,
      createdAt: undefined,
      updatedAt: undefined,
    },
  });

  await audit({
    userId: user.id,
    action: AUDIT_ACTIONS.AI_PROVIDER_UPDATE,
    resource: "AIProviderConfig",
    resourceId: id,
    details: { changes: body },
  });

  return NextResponse.json({ provider: updated });
}

// DELETE /api/admin/ai-providers/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { user } = await getBootstrapContext();
  const existing = await db.aIProviderConfig.findUnique({ where: { id } });
  if (existing?.isActive) {
    return NextResponse.json(
      { error: "Cannot delete the active provider. Activate another first." },
      { status: 400 }
    );
  }
  await db.aIProviderConfig.delete({ where: { id } });
  await audit({
    userId: user.id,
    action: AUDIT_ACTIONS.AI_PROVIDER_DELETE,
    resource: "AIProviderConfig",
    resourceId: id,
    details: { name: existing?.name },
    severity: "WARN",
  });
  return NextResponse.json({ ok: true });
}
