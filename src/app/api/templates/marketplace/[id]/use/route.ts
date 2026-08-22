import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import {
  withTenant,
  jsonOk,
  parseJsonBody,
  ResourceNotFoundError,
  ApiError,
  type TenantHandlerContext,
} from "@/lib/api-controller";
import { sectionsFromTemplateTypes } from "@/lib/proposal-builder-engine";
import type { ProposalSection } from "@/lib/proposal-builder-types";
import {
  mapDbMarketplaceRow,
  marketplaceEntryVisibilityWhere,
  type ResolvedMarketplaceTemplate,
} from "@/lib/marketplace-template-resolve";
import {
  analyticsRequestOrigin,
  recordTemplateAnalyticsEvent,
} from "@/lib/analytics-collector";
import { recordMarketplaceApplication } from "@/lib/marketplace-usage";

type Params = { params: Promise<{ id: string }> };

const useTemplateSchema = z
  .object({
    projectId: z.string().min(1).optional(),
    proposalId: z.string().min(1).optional(),
    locale: z.enum(["ar", "en"]).default("ar"),
  })
  .strict();

type UseTemplateBody = z.infer<typeof useTemplateSchema>;

async function resolveDbTemplate(id: string, workspaceId: string) {
  const row = await db.templateMarketplaceEntry.findFirst({
    where: marketplaceEntryVisibilityWhere(id, workspaceId),
  });
  if (!row) throw new ResourceNotFoundError();
  if (row.isRetired) {
    throw new ApiError("Template has been retired", 409, "MARKETPLACE_ENTRY_RETIRED");
  }
  const mapped = mapDbMarketplaceRow(row);
  if (!mapped) throw new ResourceNotFoundError();
  return { template: mapped, dbRow: row };
}

/**
 * Appends the template's sections to an existing proposal of the caller's
 * workspace.
 */
async function appendTemplateSections(args: {
  workspaceId: string;
  userId: string;
  proposalId: string;
  sections: ProposalSection[];
  templateKey: string;
}): Promise<string | null> {
  const proposal = await db.generatedProposal.findFirst({
    where: { id: args.proposalId, workspaceId: args.workspaceId },
    select: { id: true },
  });
  if (!proposal) return null;

  const existing = await db.proposalBuilderSection.findMany({
    where: { proposalId: proposal.id },
    select: { sectionKey: true, sortOrder: true },
  });
  const takenKeys = new Set(existing.map((row) => row.sectionKey));
  let nextOrder = existing.reduce(
    (max, row) => (row.sortOrder > max ? row.sortOrder : max),
    -1,
  );

  for (const section of args.sections) {
    if (takenKeys.has(section.sectionKey)) continue;
    nextOrder += 1;
    await db.proposalBuilderSection.create({
      data: {
        proposalId: proposal.id,
        sectionKey: section.sectionKey,
        sectionType: section.sectionType,
        sortOrder: nextOrder,
        titleJson: section.title,
        contentJson: section.content,
        metadataJson: (section.metadata ?? {}) as object,
        isRequired: section.isRequired ?? false,
        isVisible: section.isVisible ?? true,
        validationJson: {},
        createdBy: args.userId,
      },
    });
    takenKeys.add(section.sectionKey);
  }

  await audit({
    userId: args.userId,
    action: "MARKETPLACE_TEMPLATE_USE",
    resource: "GeneratedProposal",
    resourceId: proposal.id,
    details: { templateKey: args.templateKey, sectionCount: args.sections.length, mode: "append" },
    success: true,
  }).catch(() => undefined);

  return proposal.id;
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
      }),
    ),
  );

  await audit({
    userId: args.userId,
    action: "MARKETPLACE_TEMPLATE_USE",
    resource: "GeneratedProposal",
    resourceId: proposal.id,
    details: { templateKey: args.templateKey, sectionCount: args.sections.length },
    success: true,
  }).catch(() => undefined);

  return proposal.id;
}

/**
 * Apply a marketplace template into a draft proposal shell.
 */
export async function POST(request: NextRequest, { params }: Params) {
  return withTenant("writer", async (ctx: TenantHandlerContext) => {
    const { id } = await params;
    const { template, dbRow } = await resolveDbTemplate(id, ctx.workspace.id);

    // Annotated so the fallback does not widen the body into a union and hide
    // `projectId`/`proposalId` from every later read.
    const body: UseTemplateBody = await parseJsonBody(
      request,
      useTemplateSchema,
    ).catch(() => ({ locale: "ar" as const }));

    const sections = sectionsFromTemplateTypes([...template.sectionTypes]);
    const title = { ar: template.name.ar, en: template.name.en };

    let proposalId: string | null = null;
    let firstApplication = false;

    if (body.proposalId) {
      proposalId = await appendTemplateSections({
        workspaceId: ctx.workspace.id,
        userId: ctx.userId,
        proposalId: body.proposalId,
        sections,
        templateKey: template.templateKey,
      });
      if (!proposalId) throw new ResourceNotFoundError();
    } else if (body.projectId) {
      proposalId = await persistTemplateDraft({
        workspaceId: ctx.workspace.id,
        userId: ctx.userId,
        projectId: body.projectId,
        title,
        locale: body.locale,
        sections,
        templateKey: template.templateKey,
      });
    }

    // Requirement 15.7 — one increment per (entry, proposal) pair.
    if (proposalId && dbRow) {
      const applied = await recordMarketplaceApplication({
        entryId: dbRow.id,
        proposalId,
        workspaceId: ctx.workspace.id,
        appliedById: ctx.userId,
      });
      firstApplication = applied.firstApplication;
    }

    // Analytics is appended only for a committed mutation, keyed on the persisted
    // proposal so a repeated application records no second row (req 4.1, 4.12).
    if (proposalId) {
      const origin = analyticsRequestOrigin({
        tenantWorkspaceId: ctx.workspace.id,
        actorUserId: ctx.userId,
      });

      await recordTemplateAnalyticsEvent({
        eventType: "template_used",
        entityId: template.id,
        mutationRef: proposalId,
        origin,
        metadata: {
          templateKey: template.templateKey,
          category: template.category,
          sectionCount: sections.length,
          proposalId,
          projectId: body.projectId ?? null,
          locale: body.locale,
        },
      });

      for (const section of sections) {
        await recordTemplateAnalyticsEvent({
          eventType: "section_added",
          entityId: section.sectionKey,
          mutationRef: `${proposalId}:${section.sectionKey}`,
          origin,
          metadata: {
            sectionType: section.sectionType,
            templateKey: template.templateKey,
            proposalId,
          },
        });
      }
    }

    return jsonOk({
      proposalId,
      persisted: Boolean(proposalId),
      firstApplication,
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
        projectId: body.projectId ?? null,
      },
    });
  }, "templates/marketplace/[id]/use POST");
}