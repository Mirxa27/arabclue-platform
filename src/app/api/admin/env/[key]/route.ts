import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getBootstrapContext } from "@/lib/bootstrap";
import { jsonApiFailure, parseJsonBody, withAdmin } from "@/lib/api-controller";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { decryptValue, maskSecret, rotateEncryption } from "@/lib/crypto";
import { isSecretEnvKey } from "@/lib/constants";
import { adminEnvPatchSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

// PATCH /api/admin/env/[key] — rotate the encryption for a setting
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  return withAdmin(async (session) => {
  const { key } = await params;
  await getBootstrapContext();
  const body = await parseJsonBody(req, adminEnvPatchSchema);

  const existing = await db.envSetting.findUnique({ where: { key } });
  if (!existing) return jsonApiFailure("RESOURCE_NOT_FOUND", { status: 404 });

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

  // Generic update (category, description, isSecret).
  //
  // isSecret may be raised but never lowered below the allowlist verdict.
  // Without this an ADMIN could PATCH { isSecret: false } onto NEXTAUTH_SECRET
  // or ARABCLUE_ENC_KEY and then read the plaintext from the list endpoint,
  // sidestepping the SUPER_ADMIN reveal gate entirely.
  const requestedSecret =
    typeof body.isSecret === "boolean" ? body.isSecret : undefined;
  const nextSecret =
    requestedSecret === undefined
      ? undefined
      : requestedSecret || isSecretEnvKey(key);

  if (requestedSecret === false && nextSecret === true) {
    return jsonApiFailure("ENV_SECRECY_REQUIRED", { status: 400 });
  }

  const updated = await db.envSetting.update({
    where: { key },
    data: {
      category: body.category ?? undefined,
      description: body.description ?? undefined,
      isSecret: nextSecret,
      lastEditedBy: session.user.id,
    },
  });

  // This branch previously wrote no audit entry at all, so a metadata change on
  // a credential row left no trace.
  await audit({
    userId: session.user.id,
    action: AUDIT_ACTIONS.ENV_UPDATE,
    resource: "EnvSetting",
    resourceId: updated.id,
    details: {
      key,
      action: "METADATA_UPDATE",
      categoryChanged: body.category != null,
      descriptionChanged: body.description != null,
      isSecretChanged: nextSecret !== undefined,
    },
    severity: "WARN",
  });

  return NextResponse.json({ setting: { ...updated, value: maskSecret(decryptValue(updated.valueEncrypted)) } });
  }, "admin/env/[key]");
}

// DELETE /api/admin/env/[key]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  return withAdmin(async (session) => {
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
  }, "admin/env/[key]");
}
