import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getBootstrapContext } from "@/lib/bootstrap";
import { jsonOk, parseSearchParams, withAdmin } from "@/lib/api-controller";
import { adminAuditQuerySchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return withAdmin(async () => {
    await getBootstrapContext();
    const { action, severity, limit } = parseSearchParams(req, adminAuditQuerySchema);

    const logs = await db.auditLog.findMany({
      where: {
        ...(action ? { action } : {}),
        ...(severity ? { severity } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit ?? 100,
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
      },
    });

    const allLogs = await db.auditLog.groupBy({
      by: ["action"],
      _count: true,
    });
    const bySeverity = await db.auditLog.groupBy({
      by: ["severity"],
      _count: true,
    });

    return jsonOk({
      logs,
      summary: {
        total: allLogs.reduce((s, g) => s + g._count, 0),
        byAction: allLogs.map((g) => ({ action: g.action, count: g._count })),
        bySeverity: bySeverity.map((g) => ({ severity: g.severity, count: g._count })),
      },
    });
  }, "admin/audit");
}
