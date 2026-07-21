import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getBootstrapContext } from "@/lib/bootstrap";

export const dynamic = "force-dynamic";

// GET /api/stats — dashboard KPI summary
export async function GET() {
  try {
    const { workspace } = await getBootstrapContext();
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
    const completedAgents = agentRuns.filter((a) => a.status === "COMPLETED").length;

    const compliant = compliance.filter((c) => c.status === "COMPLIANT").length;
    const avgCompliance =
      compliance.length > 0
        ? Math.round((compliant / compliance.length) * 100)
        : 100;

    // Status breakdown for project distribution chart
    const statusBreakdown = await db.tenderProject.groupBy({
      by: ["status"],
      where: { workspaceId: wid },
      _count: true,
    });

    // Document category breakdown
    const docCategoryBreakdown = await db.uploadedDocument.groupBy({
      by: ["docCategory"],
      where: { workspaceId: wid },
      _count: true,
    });

    return NextResponse.json({
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
  } catch (err) {
    console.error("[stats] error", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "unknown" },
      { status: 500 }
    );
  }
}
