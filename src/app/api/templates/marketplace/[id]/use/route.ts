import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { sectionsFromTemplateTypes } from "@/lib/proposal-builder-engine";
import type { ProposalSection } from "@/lib/proposal-builder-types";
import { isPrismaMissingTable } from "@/lib/prisma-missing-table";
import {
  mapDbMarketplaceRow,
  resolveMarketplaceTemplateFromCatalog,
  type ResolvedMarketplaceTemplate,
} from "@/lib/marketplace-template-resolve";

type Params = { params: Promise<{ id: string }> };

async function resolveTemplate(
  id: string,
  workspaceId: string
): Promise<ResolvedMarketplaceTemplate | null> {
  try {
    const row = await db.templateMarketplaceEntry.findFirst({
      where: {
        OR: [
          { id },
          { templateKey: id, workspaceId },
          { templateKey: id, workspaceId: null, isPublic: true },
        ],
      },
    });
    if (row) {
      const mapped = mapDbMarketplaceRow(row);
      if (mapped) {
        await db.templateMarketplaceEntry
          .update({
            where: { id: row.id },
            data: { usageCount: { increment: 1 } },
          })
          .catch(() => undefined);
        return mapped;
      }
    }
  } catch (error) {
    if (!isPrismaMissingTable(error)) {
      console.warn("[template-marketplace/use] DB lookup failed", error);
    }
  }
  return resolveMarketplaceTemplateFromCatalog(id);
}

async function persistTemplateDraft(args: {
  workspaceId: string;
  userId: string;
  projectId: string;
  title: { ar: string; en: string };
  locale: string;
  sections: ProposalSection[];
  templateKey: string;
}): Promise<string | null> {
  try {
    const project = await db.tenderProject.findFirst({
      where: { id: args.projectId, workspaceId: args.workspaceId },
      select: { id: true },
    });
    if (!project) return null;

    const proposal = await db.generatedProposal.create({
      data: {
        workspaceId: args.workspaceId,
        projectId: args.projectId,
        createdById: args.userId,
        title: args.title.en,
        titleAr: args.title.ar,
        type: "COMBINED",
        status: "DRAFT",
        locale: args.locale,
        version: 1,
      },
    });

    await Promise.all(
      args.sections.map((section, index) =>
        db.proposalBuilderSection.create({
          data: {
            proposalId: proposal.id,
            sectionKey: section.sectionKey,
            sectionType: section.sectionType,
            sortOrder: section.sortOrder ?? index,
            titleJson: section.title,
            contentJson: section.content,
            metadataJson: (section.metadata ?? {}) as object,
            isRequired: section.isRequired ?? false,
            isVisible: section.isVisible ?? true,
            validationJson: {},
            createdBy: args.userId,
          },
        })
      )
    );

    await audit({
      userId: args.userId,
      action: "MARKETPLACE_TEMPLATE_USE",
      resource: "GeneratedProposal",
      resourceId: proposal.id,
      details: {
        templateKey: args.templateKey,
        sectionCount: args.sections.length,
      },
      success: true,
    }).catch(() => undefined);

    return proposal.id;
  } catch (error) {
    console.warn(
      "[template-marketplace/use] could not persist proposal draft",
      error
    );
    return null;
  }
}

/**
 * Apply a marketplace template into a draft proposal shell.
 * Resolves DB templates when migrated; otherwise system catalog.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.user.workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const template = await resolveTemplate(id, session.user.workspaceId);

  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  let projectId: string | null = null;
  let locale = "ar";
  try {
    const body = (await request.json().catch(() => ({}))) as {
      projectId?: string;
      locale?: string;
    };
    if (typeof body.projectId === "string" && body.projectId.trim()) {
      projectId = body.projectId.trim();
    }
    if (body.locale === "en" || body.locale === "ar") {
      locale = body.locale;
    }
  } catch {
    // empty body is fine
  }

  const sections = sectionsFromTemplateTypes([...template.sectionTypes]);
  const title = {
    ar: template.name.ar,
    en: template.name.en,
  };

  let proposalId: string | null = null;
  if (projectId) {
    proposalId = await persistTemplateDraft({
      workspaceId: session.user.workspaceId,
      userId: session.user.id,
      projectId,
      title,
      locale,
      sections,
      templateKey: template.templateKey,
    });
  }

  return NextResponse.json({
    ok: true,
    proposalId,
    persisted: Boolean(proposalId),
    template: {
      id: template.id,
      templateKey: template.templateKey,
      name: template.name,
      category: template.category,
    },
    draft: {
      title,
      sections,
      source: template.source,
      projectId,
    },
    message: proposalId
      ? "Template draft saved. Open Proposal Builder to continue editing."
      : "Template draft prepared. Select a project in Proposal Builder to save.",
  });
}
