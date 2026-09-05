import { db } from "@/lib/db";
import { withTenant, jsonOk } from "@/lib/api-controller";
import { trendPct } from "@/lib/stats-trends";
import {
  complianceScoreFromGroups,
  countForStatus,
} from "@/lib/stats-compliance";

export const dynamic = "force-dynamic";

// GET /api/stats — dashboard KPI summary (tenant-scoped)
export async function GET() {
  return withTenant("session", async ({ workspace }) => {
    const wid = workspace.id;
    const now = new Date();
    const last7dStart = new Date(now);
    last7dStart.setDate(last7dStart.getDate() - 7);
    const prior7dStart = new Date(now);
    prior7dStart.setDate(prior7dStart.getDate() - 14);

    const [
      projects,
      documents,
      proposals,
      agentRuns,
      compliance,
      pastProjects,
      last7dProjects,
      prior7dProjects,
      last7dDocuments,
      prior7dDocuments,
      last7dProposals,
      prior7dProposals,
      last7dCompliance,
      prior7dCompliance,
    ] = await Promise.all([
      db.tenderProject.count({ where: { workspaceId: wid } }),
      db.uploadedDocument.count({ where: { workspaceId: wid } }),
      db.generatedProposal.count({ where: { workspaceId: wid } }),
      // One aggregate row per status instead of every AgentRun/ComplianceCheck
      // row shipped to the function to be counted in JS.
      db.agentRun.groupBy({
        by: ["status"],
        where: { project: { workspaceId: wid } },
        _count: true,
      }),
      db.complianceCheck.groupBy({
        by: ["status"],
        where: { project: { workspaceId: wid } },
        _count: true,
      }),
      db.pastProject.count({ where: { workspaceId: wid } }),
      db.tenderProject.count({
        where: { workspaceId: wid, createdAt: { gte: last7dStart, lte: now } },
      }),
      db.tenderProject.count({
        where: {
          workspaceId: wid,
          createdAt: { gte: prior7dStart, lt: last7dStart },
        },
      }),
      db.uploadedDocument.count({
        where: { workspaceId: wid, createdAt: { gte: last7dStart, lte: now } },
      }),
      db.uploadedDocument.count({
        where: {
          workspaceId: wid,
          createdAt: { gte: prior7dStart, lt: last7dStart },
        },
      }),
      db.generatedProposal.count({
        where: { workspaceId: wid, createdAt: { gte: last7dStart, lte: now } },
      }),
      db.generatedProposal.count({
        where: {
          workspaceId: wid,
          createdAt: { gte: prior7dStart, lt: last7dStart },
        },
      }),
      db.complianceCheck.groupBy({
        by: ["status"],
        where: {
          project: { workspaceId: wid },
          createdAt: { gte: last7dStart, lte: now },
        },
        _count: true,
      }),
      db.complianceCheck.groupBy({
        by: ["status"],
        where: {
          project: { workspaceId: wid },
          createdAt: { gte: prior7dStart, lt: last7dStart },
        },
        _count: true,
      }),
    ]);

    const activeProjects = await db.tenderProject.count({
      where: {
        workspaceId: wid,
        status: { in: ["PARSING", "DRAFTING", "REVIEW", "DRAFT"] },
      },
    });

    const runningAgents = countForStatus(agentRuns, "RUNNING");
    const completedAgents = countForStatus(agentRuns, "COMPLETED");

    // null (not 100) when the workspace has no checks yet; the card shows "—".
    const avgCompliance = complianceScoreFromGroups(compliance);
    const last7dComplianceScore =
      complianceScoreFromGroups(last7dCompliance) ?? 0;
    const prior7dComplianceScore =
      complianceScoreFromGroups(prior7dCompliance) ?? 0;

    const statusBreakdown = await db.tenderProject.groupBy({
      by: ["status"],
      where: { workspaceId: wid },
      _count: true,
    });

    const docCategoryBreakdown = await db.uploadedDocument.groupBy({
      by: ["docCategory"],
      where: { workspaceId: wid },
      _count: true,
    });

    return jsonOk({
      workspace: {
        id: workspace.id,
        name: workspace.name,
        nameAr: workspace.nameAr,
        plan: workspace.plan,
      },
      kpis: {
        activeProjects,
        totalProjects: projects,
        proposalsGenerated: proposals,
        avgCompliance,
        documentsProcessed: documents,
        pastProjects,
        runningAgents,
        completedAgents,
      },
      trends: {
        projects: trendPct(last7dProjects, prior7dProjects),
        documents: trendPct(last7dDocuments, prior7dDocuments),
        proposals: trendPct(last7dProposals, prior7dProposals),
        compliance: trendPct(last7dComplianceScore, prior7dComplianceScore),
      },
      charts: {
        statusBreakdown: statusBreakdown.map((s) => ({
          status: s.status,
          count: s._count,
        })),
        docCategoryBreakdown: docCategoryBreakdown.map((d) => ({
          category: d.docCategory,
          count: d._count,
        })),
      },
    });
  }, "stats GET");
}
