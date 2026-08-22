import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getBootstrapContext } from "@/lib/bootstrap";
import { parseJsonBody, parseSearchParams, withAdmin } from "@/lib/api-controller";
import { adminEnvUpsertSchema } from "@/lib/validation";
import { z } from "zod";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { encryptValue, decryptValue, maskSecret } from "@/lib/crypto";
import { ENV_CATALOG, isSecretEnvKey } from "@/lib/constants";

export const dynamic = "force-dynamic";

// GET /api/admin/env — returns all settings with masked secret values
const envRevealQuerySchema = z.object({
  reveal: z.enum(["0", "1"]).optional(),
});

export async function GET(req: NextRequest) {
  return withAdmin(async (session) => {
  await getBootstrapContext();
  const { reveal: revealFlag } = parseSearchParams(req, envRevealQuerySchema);
  const reveal = revealFlag === "1";
  if (reveal) {
    if (session.user.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Only SUPER_ADMIN can reveal secret values" },
        { status: 403 }
      );
    }
  }
  const settings = await db.envSetting.findMany({
    orderBy: [{ category: "asc" }, { key: "asc" }],
  });

  const result = settings.map((s) => {
    const plain = decryptValue(s.valueEncrypted);
    // Effective secrecy is the stored flag OR the allowlist verdict, so a row
    // whose isSecret was flipped to false still masks. Secrecy can be raised by
    // data but never lowered by it.
    const secret = s.isSecret || isSecretEnvKey(s.key);
    return {
      id: s.id,
      key: s.key,
      category: s.category,
      description: s.description,
      isSecret: secret,
      isRequired: s.isRequired,
      value: secret && !reveal ? maskSecret(plain) : plain,
      isMasked: secret && !reveal,
      lastRotatedAt: s.lastRotatedAt,
      lastEditedBy: s.lastEditedBy,
      updatedAt: s.updatedAt,
    };
  });

  if (reveal) {
    await audit({
      userId: session.user.id,
      action: AUDIT_ACTIONS.ENV_UPDATE,
      resource: "EnvSetting",
      details: { action: "REVEAL_ALL", count: settings.length },
      severity: "WARN",
    });
  }

  return NextResponse.json({ settings: result, catalog: ENV_CATALOG });
  }, "admin/env");
}

// CRITICAL env keys that must never be overwritten via API without SUPER_ADMIN + extra caution
const CRITICAL_ENV_KEYS = new Set(["ARABCLUE_ENC_KEY", "NEXTAUTH_SECRET", "DATABASE_URL"]);

// POST /api/admin/env — create or update a setting (encrypts the value)
export async function POST(req: NextRequest) {
  return withAdmin(async (session) => {
  const { key, value, category, description, isSecret } = await parseJsonBody(
    req,
    adminEnvUpsertSchema
  );

  // Secrecy is the allowlist verdict OR an explicit request to treat it as
  // secret — never the caller's `isSecret: false`. The previous form,
  // `isSecret ?? heuristic`, let an ADMIN post
  // `{ key: "MYFATOORAH_API_KEY", isSecret: false }` and write a credential
  // that the SUPER_ADMIN gate below was supposed to protect.
  const secret = isSecretEnvKey(key) || isSecret === true;

  // Secret / critical writes require SUPER_ADMIN
  if ((secret || CRITICAL_ENV_KEYS.has(key)) && session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json(
      { error: "Only SUPER_ADMIN can modify secret or critical env keys" },
      { status: 403 }
    );
  }

  // Extra guard: prevent DATABASE_URL overwrite via API in production (breaks all connections)
  if (key === "DATABASE_URL" && process.env.NODE_ENV === "production" && process.env.VERCEL) {
    return NextResponse.json({ error: "DATABASE_URL cannot be changed via API in production" }, { status: 403 });
  }

  await getBootstrapContext();

  const encrypted = encryptValue(value);

  const setting = await db.envSetting.upsert({
    where: { key },
    update: {
      valueEncrypted: encrypted,
      category: category ?? undefined,
      description: description ?? undefined,
      isSecret: secret,
      lastEditedBy: session.user.id,
      lastRotatedAt: new Date(),
    },
    create: {
      key,
      valueEncrypted: encrypted,
      category: category ?? "GENERAL",
      description: description ?? null,
      isSecret: secret,
      lastEditedBy: session.user.id,
      lastRotatedAt: new Date(),
    },
  });

  await audit({
    userId: session.user.id,
    action: AUDIT_ACTIONS.ENV_UPDATE,
    resource: "EnvSetting",
    resourceId: setting.id,
    details: { key, category: setting.category, action: "SET", critical: CRITICAL_ENV_KEYS.has(key) },
    severity: CRITICAL_ENV_KEYS.has(key) ? "CRITICAL" : "WARN",
  });

  return NextResponse.json({ setting: { ...setting, value: maskSecret(value) } });
  }, "admin/env");
}
