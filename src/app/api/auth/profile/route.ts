import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { audit } from "@/lib/audit";
import { rateLimitAsync as rateLimit } from "@/lib/rate-limit";
import { parseJsonBody, profileUpdateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** GET /api/auth/profile — current user profile (DB source of truth) */
export async function GET() {
  const session = await requireSession({ allowMustChangePassword: true });
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      locale: true,
      avatarUrl: true,
      mfaEnabled: true,
      mustChangePassword: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  return NextResponse.json({ user });
}

/**
 * PATCH /api/auth/profile — update name, locale, and/or email.
 * Email change requires currentPassword and uniqueness check.
 */
export async function PATCH(req: NextRequest) {
  try {
    const session = await requireSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rl = await rateLimit({
      key: `profile:${session.user.id}`,
      limit: 20,
      windowMs: 15 * 60 * 1000,
    });
    if (!rl.ok) {
      return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
    }

    const parsed = await parseJsonBody(req, profileUpdateSchema);
    if (!parsed.ok) return parsed.response;

    const { name, email, locale, currentPassword } = parsed.data;
    const existing = await db.user.findUnique({ where: { id: session.user.id } });
    if (!existing) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const data: {
      name?: string;
      email?: string;
      locale?: string;
    } = {};

    if (name !== undefined) data.name = name;
    if (locale !== undefined) data.locale = locale;

    if (email !== undefined) {
      const nextEmail = email.trim().toLowerCase();
      if (nextEmail !== existing.email) {
        const ok = await verifyPassword(currentPassword ?? "", existing.passwordHash);
        if (!ok) {
          return NextResponse.json(
            { error: "Current password is incorrect" },
            { status: 400 }
          );
        }
        const taken = await db.user.findUnique({ where: { email: nextEmail } });
        if (taken && taken.id !== existing.id) {
          return NextResponse.json({ error: "Email already in use" }, { status: 409 });
        }
        data.email = nextEmail;
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({
        user: {
          id: existing.id,
          email: existing.email,
          name: existing.name,
          role: existing.role,
          locale: existing.locale,
          avatarUrl: existing.avatarUrl,
          mfaEnabled: existing.mfaEnabled,
        },
      });
    }

    const updated = await db.user.update({
      where: { id: existing.id },
      data,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        locale: true,
        avatarUrl: true,
        mfaEnabled: true,
      },
    });

    await audit({
      userId: existing.id,
      action: "PROFILE_UPDATE",
      resource: "User",
      resourceId: existing.id,
      details: { fields: Object.keys(data) },
    });

    return NextResponse.json({ user: updated });
  } catch (err) {
    console.error("[auth/profile PATCH]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown" },
      { status: 500 }
    );
  }
}
