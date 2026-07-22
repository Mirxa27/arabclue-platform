import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getBootstrapContext } from "@/lib/bootstrap";
import { requireAdmin, requireSuperAdmin } from "@/lib/auth";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { encryptValue, decryptValue, maskSecret } from "@/lib/crypto";
import { ENV_CATALOG } from "@/lib/constants";

export const dynamic = "force-dynamic";

// GET /api/admin/env — returns all settings with masked secret values
export async function GET(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await getBootstrapContext();
  const reveal = req.nextUrl.searchParams.get("reveal") === "1";
  if (reveal) {
    const superAdmin = await requireSuperAdmin();
    if (!superAdmin) {
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
    return {
      id: s.id,
      key: s.key,
      category: s.category,
      description: s.description,
      isSecret: s.isSecret,
      isRequired: s.isRequired,
      value: s.isSecret && !reveal ? maskSecret(plain) : plain,
      isMasked: s.isSecret && !reveal,
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
}

// CRITICAL env keys that must never be overwritten via API without SUPER_ADMIN + extra caution
const CRITICAL_ENV_KEYS = new Set(["ARABCLUE_ENC_KEY", "NEXTAUTH_SECRET", "DATABASE_URL"]);

// POST /api/admin/env — create or update a setting (encrypts the value)
export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  const { key, value, category, description, isSecret } = body as {
    key: string;
    value: string;
    category?: string;
    description?: string;
    isSecret?: boolean;
  };

  if (!key || value === undefined) {
    return NextResponse.json({ error: "key and value required" }, { status: 400 });
  }

  const secret = isSecret ?? (key.includes("KEY") || key.includes("SECRET") || key.includes("PASSWORD"));

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
}
