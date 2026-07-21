import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getBootstrapContext } from "@/lib/bootstrap";

export const dynamic = "force-dynamic";

// GET /api/projects — list tender projects
export async function GET() {
  const { workspace } = await getBootstrapContext();
  const projects = await db.tenderProject.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: { documents: true, proposals: true, agentRuns: true, complianceChecks: true },
      },
      agentRuns: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, status: true, overallProgress: true },
      },
    },
  });

  // Attach compliance score per project
  const enriched = await Promise.all(
    projects.map(async (p) => {
      const checks = await db.complianceCheck.findMany({
        where: { projectId: p.id },
        select: { status: true },
      });
      const compliant = checks.filter((c) => c.status === "COMPLIANT").length;
      const score = checks.length > 0 ? Math.round((compliant / checks.length) * 100) : 0;
      return { ...p, complianceScore: score, latestAgentRun: p.agentRuns[0] ?? null };
    })
  );

  return NextResponse.json({ projects: enriched });
}

// POST /api/projects — create a tender project
export async function POST(req: NextRequest) {
  const { workspace } = await getBootstrapContext();
  const user = await db.user.findFirst({
    where: { workspaces: { some: { workspaceId: workspace.id } } },
  });
  const body = await req.json();
  const project = await db.tenderProject.create({
    data: {
      workspaceId: workspace.id,
      createdById: user!.id,
      etimadRef: body.etimadRef || `ETM-${Date.now().toString(36).toUpperCase()}`,
      title: body.title,
      titleAr: body.titleAr,
      category: body.category || "IT",
      budget: body.budget ?? null,
      currency: body.currency || "SAR",
      submissionDeadline: body.submissionDeadline ? new Date(body.submissionDeadline) : null,
      saudizationTarget: body.saudizationTarget ?? 35,
      localContentTarget: body.localContentTarget ?? 40,
      status: "DRAFT",
    },
  });
  return NextResponse.json({ project });
}
