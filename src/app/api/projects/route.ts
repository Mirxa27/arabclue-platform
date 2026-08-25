import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { parseJsonBody, projectCreateSchema } from "@/lib/validation";
import { withTenant, jsonOk } from "@/lib/api-controller";

export const dynamic = "force-dynamic";

// GET /api/projects — list tender projects for caller's workspace
export async function GET() {
  return withTenant("session", async ({ workspace }) => {
    // Bound the result set. Sorting by updatedAt keeps the freshest work
    // near the top for workspaces that accumulate many drafts.
    const projects = await db.tenderProject.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { updatedAt: "desc" },
      take: 100,
      include: {
        _count: {
          select: {
            documents: true,
            proposals: true,
            agentRuns: true,
            complianceChecks: true,
          },
        },
        agentRuns: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true, status: true, overallProgress: true },
        },
      },
    });

    // Compliance score was previously computed with one findMany per project
    // (N+1). A single groupBy over (projectId, status) collapses that into
    // one round trip. Skipped entirely when there are no projects.
    const projectIds = projects.map((p) => p.id);
    const totalsByProject = new Map<string, { total: number; compliant: number }>();
    if (projectIds.length > 0) {
      const grouped = await db.complianceCheck.groupBy({
        by: ["projectId", "status"],
        where: { projectId: { in: projectIds } },
        _count: { _all: true },
      });
      for (const row of grouped) {
        const bucket =
          totalsByProject.get(row.projectId) ?? { total: 0, compliant: 0 };
        bucket.total += row._count._all;
        if (row.status === "COMPLIANT") {
          bucket.compliant += row._count._all;
        }
        totalsByProject.set(row.projectId, bucket);
      }
    }

    const enriched = projects.map((p) => {
      const bucket = totalsByProject.get(p.id);
      const score =
        bucket && bucket.total > 0
          ? Math.round((bucket.compliant / bucket.total) * 100)
          : 0;
      return {
        ...p,
        complianceScore: score,
        latestAgentRun: p.agentRuns[0] ?? null,
      };
    });

    return jsonOk({ projects: enriched });
  }, "projects GET");
}

// POST /api/projects — create a tender project
export async function POST(req: NextRequest) {
  return withTenant("writer", async ({ session, workspace }) => {
    const parsed = await parseJsonBody(req, projectCreateSchema);
    if (!parsed.ok) return parsed.response;

    const body = parsed.data;
    const project = await db.tenderProject.create({
      data: {
        workspaceId: workspace.id,
        createdById: session.user.id,
        etimadRef:
          body.etimadRef || `ETM-${crypto.randomUUID().toUpperCase()}`,
        title: body.title,
        titleAr: body.titleAr ?? null,
        category: body.category || "IT",
        budget: body.budget ?? null,
        currency: body.currency || "SAR",
        submissionDeadline: body.submissionDeadline
          ? new Date(body.submissionDeadline)
          : null,
        saudizationTarget: body.saudizationTarget ?? null,
        localContentTarget: body.localContentTarget ?? null,
        status: "DRAFT",
      },
    });
    await audit({
      userId: session.user.id,
      action: AUDIT_ACTIONS.PROJECT_CREATE,
      resource: "TenderProject",
      resourceId: project.id,
      details: { title: project.title, etimadRef: project.etimadRef },
    });
    return jsonOk({ project });
  }, "projects POST");
}
