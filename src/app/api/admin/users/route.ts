import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getBootstrapContext } from "@/lib/bootstrap";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";

export const dynamic = "force-dynamic";

// GET /api/admin/users — list all users with their subscriptions + usage
export async function GET() {
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

// POST /api/admin/users — create a new user
export async function POST(req: NextRequest) {
  const { user: admin } = await getBootstrapContext();
  const body = await req.json();
  const created = await db.user.create({
    data: {
      email: body.email,
      name: body.name,
      passwordHash: "$argon2id$demo$" + (body.password ?? "placeholder"),
      role: body.role ?? "BIDDER",
      mfaEnabled: body.mfaEnabled ?? false,
      locale: body.locale ?? "ar",
      active: true,
    },
  });
  await audit({
    userId: admin.id,
    action: AUDIT_ACTIONS.USER_CREATE,
    resource: "User",
    resourceId: created.id,
    details: { email: created.email, role: created.role },
    severity: "WARN",
  });
  return NextResponse.json({ user: created });
}
