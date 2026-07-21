import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getBootstrapContext } from "@/lib/bootstrap";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { encryptValue, decryptValue, maskSecret, rotateEncryption } from "@/lib/crypto";
import { ENV_CATALOG } from "@/lib/constants";

export const dynamic = "force-dynamic";

// GET /api/admin/env — returns all settings with masked secret values
export async function GET(req: NextRequest) {
  const { user } = await getBootstrapContext();
  const reveal = req.nextUrl.searchParams.get("reveal") === "1";
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
      userId: user.id,
      action: AUDIT_ACTIONS.ENV_UPDATE,
      resource: "EnvSetting",
      details: { action: "REVEAL_ALL", count: settings.length },
      severity: "WARN",
    });
  }

  return NextResponse.json({ settings: result, catalog: ENV_CATALOG });
}

// POST /api/admin/env — create or update a setting (encrypts the value)
export async function POST(req: NextRequest) {
  const { user } = await getBootstrapContext();
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
  const encrypted = encryptValue(value);

  const setting = await db.envSetting.upsert({
    where: { key },
    update: {
      valueEncrypted: encrypted,
      category: category ?? undefined,
      description: description ?? undefined,
      isSecret: secret,
      lastEditedBy: user.id,
      lastRotatedAt: new Date(),
    },
    create: {
      key,
      valueEncrypted: encrypted,
      category: category ?? "GENERAL",
      description: description ?? null,
      isSecret: secret,
      lastEditedBy: user.id,
      lastRotatedAt: new Date(),
    },
  });

  await audit({
    userId: user.id,
    action: AUDIT_ACTIONS.ENV_UPDATE,
    resource: "EnvSetting",
    resourceId: setting.id,
    details: { key, category: setting.category, action: "SET" },
    severity: "WARN",
  });

  return NextResponse.json({ setting: { ...setting, value: maskSecret(value) } });
}
