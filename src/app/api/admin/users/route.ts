import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getBootstrapContext } from "@/lib/bootstrap";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { canGrantRole } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { jsonApiFailure, jsonOk, parseJsonBody, withAdmin } from "@/lib/api-controller";
import { toPublicAdminUser } from "@/lib/admin-user-public";
import { adminUserCreateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  return withAdmin(async () => {
  await getBootstrapContext();
  const users = await db.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      locale: true,
      active: true,
      mfaEnabled: true,
      avatarUrl: true,
      mustChangePassword: true,
      lastLoginAt: true,
      createdAt: true,
      updatedAt: true,
      subscription: { include: { plan: true } },
      _count: {
        select: {
          projects: true,
          documents: true,
          proposals: true,
          agentRuns: true,
          auditLogs: true,
        },
      },
    },
  });
  return jsonOk({ users });
  }, "admin/users");
}

export async function POST(req: NextRequest) {
  return withAdmin(async (session) => {
  const body = await parseJsonBody(req, adminUserCreateSchema);
  const role = body.role ?? "BIDDER";
  if (!canGrantRole(session.user.role, role)) {
    return jsonApiFailure("ADMIN_REQUIRED", { status: 403 });
  }
  if (body.mfaEnabled === true) {
    return jsonApiFailure("MFA_NOT_SET_UP", { status: 400 });
  }
  const passwordHash = await hashPassword(body.password);
  const created = await db.user.create({
    data: {
      email: body.email.trim().toLowerCase(),
      name: body.name,
      passwordHash,
      role,
      mfaEnabled: false,
      locale: body.locale ?? "ar",
      active: true,
    },
  });
  await audit({
    userId: session.user.id,
    action: AUDIT_ACTIONS.USER_CREATE,
    resource: "User",
    resourceId: created.id,
    details: { email: created.email, role: created.role },
    severity: "WARN",
  });
  return NextResponse.json({
    user: toPublicAdminUser(created as unknown as Record<string, unknown>),
  });
  }, "admin/users");
}
