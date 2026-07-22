import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getBootstrapContext } from "@/lib/bootstrap";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/admin/overview — admin dashboard KPI summary
export async function GET() {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

  // Recent audit activity (last 24h)
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentAudit = await db.auditLog.count({
    where: { createdAt: { gte: yesterday } },
  });

  // Users by role
  const usersByRole = await db.user.groupBy({
    by: ["role"],
    _count: true,
  });

  // Audit by action (top 8)
  const auditByAction = await db.auditLog.groupBy({
    by: ["action"],
    _count: true,
    orderBy: { _count: { action: "desc" } },
    take: 8,
  });

  return NextResponse.json({
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
}
