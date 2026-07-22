import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getBootstrapContext } from "@/lib/bootstrap";
import { requireAdmin } from "@/lib/auth";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { decryptValue, maskSecret, rotateEncryption } from "@/lib/crypto";

export const dynamic = "force-dynamic";

// PATCH /api/admin/env/[key] — rotate the encryption for a setting
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { key } = await params;
  await getBootstrapContext();
  const body = await req.json();

  const existing = await db.envSetting.findUnique({ where: { key } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (body.rotate) {
    // Re-encrypt with a fresh IV
    const rotated = rotateEncryption(existing.valueEncrypted);
    const updated = await db.envSetting.update({
      where: { key },
      data: { valueEncrypted: rotated, lastRotatedAt: new Date(), lastEditedBy: session.user.id },
    });
    await audit({
      userId: session.user.id,
      action: AUDIT_ACTIONS.ENV_ROTATE,
      resource: "EnvSetting",
      resourceId: updated.id,
      details: { key },
      severity: "WARN",
    });
    return NextResponse.json({ setting: { ...updated, value: maskSecret(decryptValue(rotated)) } });
  }

  // Generic update (category, description, isSecret)
  const updated = await db.envSetting.update({
    where: { key },
    data: {
      category: body.category ?? undefined,
      description: body.description ?? undefined,
      isSecret: body.isSecret ?? undefined,
      lastEditedBy: session.user.id,
    },
  });
  return NextResponse.json({ setting: { ...updated, value: maskSecret(decryptValue(updated.valueEncrypted)) } });
}

// DELETE /api/admin/env/[key]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { key } = await params;
  await getBootstrapContext();
  await db.envSetting.delete({ where: { key } });
  await audit({
    userId: session.user.id,
    action: AUDIT_ACTIONS.ENV_UPDATE,
    resource: "EnvSetting",
    details: { key, action: "DELETE" },
    severity: "WARN",
  });
  return NextResponse.json({ ok: true });
}
