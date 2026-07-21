import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getBootstrapContext } from "@/lib/bootstrap";

export const dynamic = "force-dynamic";

// GET /api/brand — fetch brand profile + past projects
export async function GET() {
  const { workspace, brandProfile } = await getBootstrapContext();
  const pastProjects = await db.pastProject.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ brandProfile, pastProjects });
}

// PATCH /api/brand — update brand profile
export async function PATCH(req: NextRequest) {
  const { workspace, brandProfile } = await getBootstrapContext();
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
  return NextResponse.json({ brandProfile: updated });
}

// POST /api/brand — add past project
export async function POST(req: NextRequest) {
  const { workspace, brandProfile } = await getBootstrapContext();
  const body = await req.json();
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
    },
  });
  return NextResponse.json({ project });
}
