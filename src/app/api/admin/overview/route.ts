import { db } from "@/lib/db";
import { getBootstrapContext } from "@/lib/bootstrap";
import { jsonOk, withAdmin } from "@/lib/api-controller";

export const dynamic = "force-dynamic";

export async function GET() {
  return withAdmin(async () => {
    await getBootstrapContext();

    const [
      totalUsers,
      activeUsers,
      totalWorkspaces,
      totalProjects,
      totalProposals,
      totalDocuments,
      totalAgentRuns,
      totalAuditLogs,
      activeProviders,
      activeSubs,
      plans,
    ] = await Promise.all([
      db.user.count(),
      db.user.count({ where: { active: true } }),
      db.workspace.count(),
      db.tenderProject.count(),
      db.generatedProposal.count(),
      db.uploadedDocument.count(),
      db.agentRun.count(),
      db.auditLog.count(),
      db.aIProviderConfig.count({ where: { isActive: true } }),
      db.subscription.count({ where: { status: "ACTIVE" } }),
      db.subscriptionPlan.count(),
    ]);

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentAudit = await db.auditLog.count({
      where: { createdAt: { gte: yesterday } },
    });

    const usersByRole = await db.user.groupBy({
      by: ["role"],
      _count: true,
    });

    const auditByAction = await db.auditLog.groupBy({
      by: ["action"],
      _count: true,
      orderBy: { _count: { action: "desc" } },
      take: 8,
    });

    return jsonOk({
      kpis: {
        totalUsers,
        activeUsers,
        totalWorkspaces,
        totalProjects,
        totalProposals,
        totalDocuments,
        totalAgentRuns,
        totalAuditLogs,
        activeProviders,
        activeSubscriptions: activeSubs,
        totalPlans: plans,
        recentAudit24h: recentAudit,
      },
      charts: {
        usersByRole: usersByRole.map((u) => ({ role: u.role, count: u._count })),
        auditByAction: auditByAction.map((a) => ({ action: a.action, count: a._count })),
      },
    });
  }, "admin/overview");
}
