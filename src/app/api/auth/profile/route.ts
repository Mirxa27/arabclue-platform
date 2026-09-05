import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { audit } from "@/lib/audit";
import {
  describeRateLimitDenial,
  rateLimitAsync as rateLimit,
} from "@/lib/rate-limit";
import { parseJsonBody, profileUpdateSchema } from "@/lib/validation";
import {
  jsonApiFailure,
  jsonRateLimitFailure,
} from "@/lib/api-controller";
import { createPrismaAccountService } from "@/lib/account-service-prisma";
import type { VerificationEmailDelivery } from "@/lib/account-service";
import { extractClientIp } from "@/lib/login-rate-limit";

export const dynamic = "force-dynamic";

const UNIQUE_CONSTRAINT_ERROR = "P2002";

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === UNIQUE_CONSTRAINT_ERROR
  );
}

/** GET /api/auth/profile — current user profile (DB source of truth) */
export async function GET() {
  const session = await requireSession({ allowMustChangePassword: true });
  if (!session) {
    return jsonApiFailure("AUTHENTICATION_REQUIRED", { status: 401 });
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
    return jsonApiFailure("RESOURCE_NOT_FOUND", { status: 404 });
  }
  return NextResponse.json({ user });
}

/**
 * PATCH /api/auth/profile — update name, locale, and/or email.
 *
 * An email change requires the current password and puts the account back
 * into the unverified state: `emailVerified` is cleared, every other session
 * is revoked, and a fresh verification link is mailed to the new address
 * through the same account service registration uses. Previously the new,
 * unproven address inherited the old address's verified flag.
 */
export async function PATCH(req: NextRequest) {
  try {
    const session = await requireSession();
    if (!session) {
      return jsonApiFailure("AUTHENTICATION_REQUIRED", { status: 401 });
    }

    const rl = await rateLimit({
      key: `profile:${session.user.id}`,
      limit: 20,
      windowMs: 15 * 60 * 1000,
    });
    if (!rl.ok) {
      return jsonRateLimitFailure(
        describeRateLimitDenial(rl),
        "PROFILE_UPDATE_RATE_LIMITED",
      );
    }

    const parsed = await parseJsonBody(req, profileUpdateSchema);
    if (!parsed.ok) return parsed.response;

    const { name, email, locale, currentPassword } = parsed.data;
    const existing = await db.user.findUnique({ where: { id: session.user.id } });
    if (!existing) {
      return jsonApiFailure("RESOURCE_NOT_FOUND", { status: 404 });
    }

    const data: {
      name?: string;
      email?: string;
      locale?: string;
    } = {};

    if (name !== undefined) data.name = name;
    if (locale !== undefined) data.locale = locale;

    let emailChanged = false;
    if (email !== undefined) {
      const nextEmail = email.trim().toLowerCase();
      if (nextEmail !== existing.email) {
        const ok = await verifyPassword(currentPassword ?? "", existing.passwordHash);
        if (!ok) {
          return jsonApiFailure("PASSWORD_INCORRECT", { status: 400 });
        }
        data.email = nextEmail;
        emailChanged = true;
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

    const userSelect = {
      id: true,
      email: true,
      name: true,
      role: true,
      locale: true,
      avatarUrl: true,
      mfaEnabled: true,
    } as const;

    let updated: {
      id: string;
      email: string;
      name: string | null;
      role: string;
      locale: string;
      avatarUrl: string | null;
      mfaEnabled: boolean;
    };
    let emailDelivery: VerificationEmailDelivery | null = null;

    if (emailChanged) {
      // One transaction: the new address, the cleared verification, and the
      // revocation of every other session commit together or not at all. The
      // unique index on User.email is the only arbiter of collisions — no
      // read-then-write race.
      try {
        [updated] = await db.$transaction([
          db.user.update({
            where: { id: existing.id },
            data: { ...data, emailVerified: false, emailVerifiedAt: null },
            select: userSelect,
          }),
          db.userSession.deleteMany({
            where: session.sessionToken
              ? { userId: existing.id, NOT: { token: session.sessionToken } }
              : { userId: existing.id },
          }),
        ]);
      } catch (err) {
        if (isUniqueConstraintError(err)) {
          return jsonApiFailure("EMAIL_ALREADY_IN_USE", { status: 409 });
        }
        throw err;
      }

      // Same issuance path as registration and the resend route: replaces any
      // outstanding token and mails the new address. Its own limiter (3 per
      // hour per address/IP) applies; a throttled send is reported, not fatal —
      // the account is already unverified and the resend route can reissue.
      const reissue = await createPrismaAccountService().resendVerificationEmail({
        email: updated.email,
        sourceAddress: extractClientIp(req.headers),
      });
      emailDelivery = reissue.ok ? reissue.emailDelivery : null;
    } else {
      updated = await db.user.update({
        where: { id: existing.id },
        data,
        select: userSelect,
      });
    }

    await audit({
      userId: existing.id,
      action: "PROFILE_UPDATE",
      resource: "User",
      resourceId: existing.id,
      details: {
        fields: Object.keys(data),
        ...(emailChanged
          ? { emailVerificationReset: true, emailDelivery }
          : {}),
      },
    });

    return NextResponse.json({
      user: updated,
      ...(emailChanged
        ? { emailVerification: { required: true, emailDelivery } }
        : {}),
    });
  } catch (err) {
    console.error("[auth/profile PATCH]", err);
    return jsonApiFailure("INTERNAL_ERROR", { status: 500 });
  }
}
