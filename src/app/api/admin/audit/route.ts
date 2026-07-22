import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getBootstrapContext } from "@/lib/bootstrap";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/admin/audit — paginated audit trail (immutable, read-only)
export async function GET(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await getBootstrapContext();
  const action = req.nextUrl.searchParams.get("action");
  const severity = req.nextUrl.searchParams.get("severity");
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? 100);

  const logs = await db.auditLog.findMany({
    where: {
      ...(action ? { action } : {}),
      ...(severity ? { severity } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 500),
    include: {
      user: { select: { id: true, name: true, email: true, role: true } },
    },
  });

  // Summary counts by action + severity
  const allLogs = await db.auditLog.groupBy({
    by: ["action"],
    _count: true,
  });
  const bySeverity = await db.auditLog.groupBy({
    by: ["severity"],
    _count: true,
  });

  return NextResponse.json({
    logs,
    summary: {
      total: allLogs.reduce((s, g) => s + g._count, 0),
      byAction: allLogs.map((g) => ({ action: g.action, count: g._count })),
      bySeverity: bySeverity.map((g) => ({ severity: g.severity, count: g._count })),
    },
  });
}
