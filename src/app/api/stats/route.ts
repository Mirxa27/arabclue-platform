import { db } from "@/lib/db";
import { withTenant, jsonOk } from "@/lib/api-controller";

export const dynamic = "force-dynamic";

// GET /api/stats — dashboard KPI summary (tenant-scoped)
export async function GET() {
  return withTenant("session", async ({ workspace }) => {
    const wid = workspace.id;

    const [projects, documents, proposals, agentRuns, compliance, pastProjects] =
      await Promise.all([
        db.tenderProject.count({ where: { workspaceId: wid } }),
        db.uploadedDocument.count({ where: { workspaceId: wid } }),
        db.generatedProposal.count({ where: { workspaceId: wid } }),
        db.agentRun.findMany({
          where: { project: { workspaceId: wid } },
          select: { status: true, overallProgress: true },
        }),
        db.complianceCheck.findMany({
          where: { project: { workspaceId: wid } },
          select: { status: true, complianceLevel: true },
        }),
        db.pastProject.count({ where: { workspaceId: wid } }),
      ]);

    const activeProjects = await db.tenderProject.count({
      where: {
        workspaceId: wid,
        status: { in: ["PARSING", "DRAFTING", "REVIEW", "DRAFT"] },
      },
    });

    const runningAgents = agentRuns.filter((a) => a.status === "RUNNING").length;
    const completedAgents = agentRuns.filter(
      (a) => a.status === "COMPLETED"
    ).length;

    const compliant = compliance.filter((c) => c.status === "COMPLIANT").length;
    const avgCompliance =
      compliance.length > 0
        ? Math.round((compliant / compliance.length) * 100)
        : 100;

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
