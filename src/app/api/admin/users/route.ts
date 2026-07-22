import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getBootstrapContext } from "@/lib/bootstrap";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { requireAdmin, canGrantRole } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import type { Role } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await getBootstrapContext();
  const users = await db.user.findMany({
    orderBy: { createdAt: "desc" },
    include: {
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
  return NextResponse.json({ users });
}

export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  if (!body.email || !body.name || !body.password) {
    return NextResponse.json(
      { error: "email, name, and password are required" },
      { status: 400 }
    );
  }
  const role = (body.role ?? "BIDDER") as Role;
  if (!canGrantRole(session.user.role, role)) {
    return NextResponse.json(
      { error: "Insufficient privileges to grant this role" },
      { status: 403 }
    );
  }
  const passwordHash = await hashPassword(String(body.password));
  const created = await db.user.create({
    data: {
      email: String(body.email).trim().toLowerCase(),
      name: body.name,
      passwordHash,
      role,
      mfaEnabled: body.mfaEnabled ?? false,
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
  const { passwordHash: _pw, ...safe } = created;
  return NextResponse.json({ user: safe });
}
