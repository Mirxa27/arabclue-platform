import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getBootstrapContext } from "@/lib/bootstrap";
import { jsonOk, withAdmin } from "@/lib/api-controller";
import {
  ANALYTICS_ACTIVATION_FUNNEL,
  activationFunnelFromCounts,
  type AnalyticsEventType,
} from "@/lib/analytics-collector";

/** Window for the operator funnel and the audit breakdown. */
const OVERVIEW_WINDOW_DAYS = 30;

/**
 * Distinct workspaces that reached each funnel stage in the window. Events
 * are per action (a workspace uploads many documents); the funnel counts
 * workspaces, so the operator reads "12 of 40 signups ran the agents".
 */
async function funnelWorkspaceCounts(since: Date) {
  const types = ANALYTICS_ACTIVATION_FUNNEL.map((s) => s.eventType);
  const rows = await db.$queryRaw<{ eventType: string; workspaces: bigint | number }[]>`
    SELECT "eventType", COUNT(DISTINCT "workspaceId") AS "workspaces"
    FROM "AnalyticsEvent"
    WHERE "createdAt" >= ${since} AND "eventType" IN (${Prisma.join(types)})
    GROUP BY "eventType"
  `;
  const counts: Partial<Record<AnalyticsEventType, number>> = {};
  for (const row of rows) {
    counts[row.eventType as AnalyticsEventType] = Number(row.workspaces);
  }
  return counts;
}

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
    const windowStart = new Date(
      Date.now() - OVERVIEW_WINDOW_DAYS * 24 * 60 * 60 * 1000
    );
    const [recentAudit, usersByRole, auditByAction, funnelCounts] =
      await Promise.all([
        db.auditLog.count({ where: { createdAt: { gte: yesterday } } }),
        db.user.groupBy({ by: ["role"], _count: true }),
        // Bounded to the window: the all-time scan dominated this page's load.
        db.auditLog.groupBy({
          by: ["action"],
          where: { createdAt: { gte: windowStart } },
          _count: true,
          orderBy: { _count: { action: "desc" } },
          take: 8,
        }),
        funnelWorkspaceCounts(windowStart).catch(() => null),
      ]);

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
      /** Workspaces per activation stage over the window; null if analytics is unavailable. */
      funnel: funnelCounts
        ? {
            windowDays: OVERVIEW_WINDOW_DAYS,
            stages: activationFunnelFromCounts(funnelCounts),
          }
        : null,
    });
  }, "admin/overview");
}
