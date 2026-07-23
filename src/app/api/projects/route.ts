import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { parseJsonBody, projectCreateSchema } from "@/lib/validation";
import { withTenant, jsonOk } from "@/lib/api-controller";

export const dynamic = "force-dynamic";

// GET /api/projects — list tender projects for caller's workspace
export async function GET() {
  return withTenant("session", async ({ workspace }) => {
    const projects = await db.tenderProject.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: "desc" },
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

    const enriched = await Promise.all(
      projects.map(async (p) => {
        const checks = await db.complianceCheck.findMany({
          where: { projectId: p.id },
          select: { status: true },
        });
        const compliant = checks.filter((c) => c.status === "COMPLIANT").length;
        const score =
          checks.length > 0 ? Math.round((compliant / checks.length) * 100) : 0;
        return {
          ...p,
          complianceScore: score,
          latestAgentRun: p.agentRuns[0] ?? null,
        };
      })
    );

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
          body.etimadRef || `ETM-${Date.now().toString(36).toUpperCase()}`,
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
