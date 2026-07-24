import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession, requireWriter } from "@/lib/auth";
import { embedText } from "@/lib/llm";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { getTenantContext } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";

// GET /api/brand — fetch brand profile + past projects
export async function GET() {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { workspace, brandProfile } = await getTenantContext(session.user.id);
  const company = {
    name: workspace.name,
    nameAr: workspace.nameAr,
    crNumber: workspace.crNumber,
    vatNumber: workspace.vatNumber,
  };
  const pastProjects = await db.pastProject.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ brandProfile, company, pastProjects });
}

// PATCH /api/brand — update brand profile
export async function PATCH(req: NextRequest) {
  const session = await requireWriter();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { brandProfile } = await getTenantContext(session.user.id);
  if (!brandProfile) {
    return NextResponse.json({ error: "No brand profile" }, { status: 400 });
  }
  const body = await req.json();
  const updated = await db.brandProfile.update({
    where: { id: brandProfile.id },
    data: {
      logoUrl: body.logoUrl,
      primaryColor: body.primaryColor,
      secondaryColor: body.secondaryColor,
      accentColor: body.accentColor,
      fontFamily: body.fontFamily,
      tagline: body.tagline,
      taglineAr: body.taglineAr,
      vision2030Alignment: body.vision2030Alignment,
    },
  });
  await audit({
    userId: session.user.id,
    action: "BRAND_UPDATE",
    resource: "BrandProfile",
    resourceId: updated.id,
  });
  return NextResponse.json({ brandProfile: updated });
}

// POST /api/brand — add past project with embedding for RAG
export async function POST(req: NextRequest) {
  const session = await requireWriter();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { workspace, brandProfile } = await getTenantContext(session.user.id);
  if (!brandProfile) {
    return NextResponse.json({ error: "No brand profile" }, { status: 400 });
  }
  const body = await req.json();
  if (!body.title || !body.summary) {
    return NextResponse.json({ error: "title and summary are required" }, { status: 400 });
  }

  const embeddingText = [
    body.title,
    body.titleAr,
    body.clientName,
    body.sector,
    body.summary,
    body.summaryAr,
    body.tags,
  ]
    .filter(Boolean)
    .join("\n");
  const embedding = await embedText(embeddingText);

  const project = await db.pastProject.create({
    data: {
      workspaceId: workspace.id,
      brandProfileId: brandProfile.id,
      title: body.title,
      titleAr: body.titleAr,
      clientName: body.clientName,
      clientNameAr: body.clientNameAr,
      sector: body.sector,
      contractValue: body.contractValue ?? null,
      currency: "SAR",
      startDate: body.startDate ? new Date(body.startDate) : null,
      endDate: body.endDate ? new Date(body.endDate) : null,
      outcome: body.outcome ?? "SUCCESSFUL",
      summary: body.summary,
      summaryAr: body.summaryAr,
      tags: body.tags,
      embeddingJson: JSON.stringify(embedding),
    },
  });
  await audit({
    userId: session.user.id,
    action: AUDIT_ACTIONS.DOC_UPLOAD,
    resource: "PastProject",
    resourceId: project.id,
    details: { title: project.title },
  });
  return NextResponse.json({ project });
}

/** PUT /api/brand — update past project approval / revoke */
export async function PUT(req: NextRequest) {
  const session = await requireWriter();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { workspace } = await getTenantContext(session.user.id);
  const body = await req.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : null;
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  const existing = await db.pastProject.findFirst({
    where: { id, workspaceId: workspace.id },
  });
  if (!existing) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const data: {
    approved?: boolean;
    revokedAt?: Date | null;
    title?: string;
    summary?: string;
  } = {};
  if (typeof body.approved === "boolean") data.approved = body.approved;
  if (body.revokedAt === null) data.revokedAt = null;
  else if (typeof body.revokedAt === "string") {
    data.revokedAt = new Date(body.revokedAt);
  }
  if (typeof body.title === "string" && body.title.trim()) {
    data.title = body.title.trim();
  }
  if (typeof body.summary === "string" && body.summary.trim()) {
    data.summary = body.summary.trim();
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No updatable fields" }, { status: 400 });
  }

  const project = await db.pastProject.update({
    where: { id },
    data,
  });
  await audit({
    userId: session.user.id,
    action: "PAST_PROJECT_UPDATE",
    resource: "PastProject",
    resourceId: project.id,
    details: { approved: project.approved, revokedAt: project.revokedAt },
  });
  return NextResponse.json({ project });
}
