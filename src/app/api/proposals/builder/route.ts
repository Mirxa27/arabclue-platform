import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import {
  analyticsRequestOrigin,
  recordProposalAnalyticsEvent,
  recordTemplateAnalyticsEvent,
} from "@/lib/analytics-collector";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const proposalId = searchParams.get("id");

  if (!proposalId) return NextResponse.json({ error: "Missing proposal ID" }, { status: 400 });

  const proposal = await db.generatedProposal.findUnique({
    where: { id: proposalId },
    include: {
      builderSections: {
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!proposal) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Check workspace access
  if (proposal.workspaceId !== session.user.workspaceId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    ok: true,
    proposalId: proposal.id,
    sections: proposal.builderSections.map((s) => ({
      id: s.id,
      sectionKey: s.sectionKey,
      sectionType: s.sectionType,
      sortOrder: s.sortOrder,
      title: s.titleJson,
      content: s.contentJson,
      metadata: s.metadataJson,
      isRequired: s.isRequired,
      isVisible: s.isVisible,
      validation: s.validationJson,
    })),
    metadata: {
      title: { ar: proposal.titleAr ?? "", en: proposal.title ?? "" },
      projectId: proposal.projectId,
      workspaceId: proposal.workspaceId,
      locale: proposal.locale as "ar" | "en",
      version: proposal.version,
    },
  });
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const { proposalId, sections, metadata } = body;

    if (!sections || !Array.isArray(sections)) {
      return NextResponse.json({ error: "Invalid sections" }, { status: 400 });
    }

    if (!proposalId && (!metadata?.projectId || typeof metadata.projectId !== "string")) {
      return NextResponse.json(
        { error: "Active project is required to create a proposal draft" },
        { status: 400 }
      );
    }

    // If proposalId exists, update; else create
    let proposal;
    if (proposalId) {
      proposal = await db.generatedProposal.findUnique({ where: { id: proposalId } });
      if (!proposal || proposal.workspaceId !== session.user.workspaceId) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      // Update proposal
      await db.generatedProposal.update({
        where: { id: proposalId },
        data: {
          title: metadata.title.en,
          titleAr: metadata.title.ar,
          locale: metadata.locale,
          version: { increment: 1 },
          updatedAt: new Date(),
        },
      });

      // Delete existing sections and recreate
      await db.proposalBuilderSection.deleteMany({ where: { proposalId } });
    } else {
      // Create new proposal
      proposal = await db.generatedProposal.create({
        data: {
          workspaceId: session.user.workspaceId,
          projectId: metadata.projectId,
          createdById: session.user.id,
          title: metadata.title.en,
          titleAr: metadata.title.ar,
          type: "COMBINED",
          status: "DRAFT",
          locale: metadata.locale,
          version: 1,
        },
      });
    }

    // Create sections
    const createdSections = await Promise.all(
      sections.map((s: any, index: number) =>
        db.proposalBuilderSection.create({
          data: {
            proposalId: proposal.id,
            sectionKey: s.sectionKey,
            sectionType: s.sectionType,
            sortOrder: s.sortOrder ?? index,
            titleJson: s.title,
            contentJson: s.content,
            metadataJson: s.metadata ?? {},
            isRequired: s.isRequired ?? false,
            isVisible: s.isVisible ?? true,
            validationJson: s.validation ?? {},
            createdBy: session.user.id,
          },
        })
      )
    );

    await audit({
      userId: session.user.id,
      action: proposalId ? "PROPOSAL_BUILDER_UPDATE" : "PROPOSAL_BUILDER_CREATE",
      resource: "GeneratedProposal",
      resourceId: proposal.id,
      details: { sectionCount: sections.length },
      success: true,
    });

    const revision = proposal.version + (proposalId ? 1 : 0);
    // Analytics runs after the builder writes commit. One bounded attempt per
    // committed mutation; a failure never changes this response (req 4.1, 4.4).
    const origin = analyticsRequestOrigin({
      tenantWorkspaceId: session.user.workspaceId,
      actorUserId: session.user.id,
    });
    const locale = metadata?.locale === "en" ? "en" : "ar";

    await recordProposalAnalyticsEvent({
      eventType: proposalId ? "proposal_edited" : "proposal_created",
      proposalId: proposal.id,
      mutationRef: revision,
      origin,
      metadata: {
        revision,
        sectionCount: sections.length,
        locale,
        projectId: metadata?.projectId ?? proposal.projectId,
      },
    });

    for (const created of createdSections) {
      await recordTemplateAnalyticsEvent({
        eventType: "section_added",
        entityId: created.sectionKey,
        mutationRef: created.id,
        origin,
        metadata: {
          sectionType: created.sectionType,
          proposalId: proposal.id,
          locale,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      proposalId: proposal.id,
      workspaceId: proposal.workspaceId,
      version: revision,
      sections: createdSections,
    });
  } catch (error) {
    console.error("Builder save error:", error);
    const message =
      error instanceof Error && /does not exist|P2021|P2010/i.test(error.message)
        ? "Proposal builder storage is not migrated on this database yet. Export HTML locally or contact an admin."
        : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}