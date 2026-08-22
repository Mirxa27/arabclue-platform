import { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma, type ProposalBuilderSection } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import {
  withTenant,
  jsonOk,
  parseJsonBody,
  parseSearchParams,
  requireTenantRecord,
  ApiError,
  type TenantHandlerContext,
} from "@/lib/api-controller";
import { resolveOwnedProjectId } from "@/lib/workspace-context";
import {
  analyticsRequestOrigin,
  recordProposalAnalyticsEvent,
  recordTemplateAnalyticsEvent,
} from "@/lib/analytics-collector";

export const dynamic = "force-dynamic";

/**
 * Upper bound on sections in a single save.
 *
 * The handler previously accepted anything that passed `Array.isArray` and
 * issued one `create` per element, so a large array became an unbounded write
 * loop on the request path.
 */
const MAX_BUILDER_SECTIONS = 200;

const localizedText = z.object({
  ar: z.string().max(20_000),
  en: z.string().max(20_000),
});

const builderSectionSchema = z.object({
  sectionKey: z.string().min(1).max(120),
  sectionType: z.string().min(1).max(120),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  title: localizedText,
  content: localizedText,
  metadata: z.record(z.string(), z.unknown()).optional(),
  isRequired: z.boolean().optional(),
  isVisible: z.boolean().optional(),
  validation: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Note the absence of `.strict()`.
 *
 * The client posts its whole `ProposalMetadata` and `ProposalSection` objects,
 * which carry fields this handler does not consume (`workspaceId`, `version`,
 * `status`, section `id`). Zod's default `strip` behaviour validates the fields
 * that are actually read and discards the rest, so the contract is enforced
 * without rejecting a legitimate client payload. Nothing outside this schema
 * reaches a query or a write.
 */
const builderSaveSchema = z.object({
  proposalId: z.string().min(1).optional(),
  sections: z.array(builderSectionSchema).max(MAX_BUILDER_SECTIONS),
  metadata: z.object({
    // Required on both paths: the update branch dereferenced `title.en`
    // unguarded, turning a missing field into a 500 instead of a 400.
    title: localizedText,
    projectId: z.string().min(1).optional(),
    locale: z.enum(["ar", "en"]),
  }),
});

const builderQuerySchema = z.object({ id: z.string().min(1) });

export async function GET(request: NextRequest) {
  return withTenant("session", async (ctx: TenantHandlerContext) => {
    const { id } = parseSearchParams(request, builderQuerySchema);

    const proposal = await db.generatedProposal.findUnique({
      where: { id },
      include: { builderSections: { orderBy: { sortOrder: "asc" } } },
    });
    requireTenantRecord(proposal, ctx.workspace.id);

    return jsonOk({
      ok: true,
      proposalId: proposal!.id,
      sections: proposal!.builderSections.map((s) => ({
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
        title: { ar: proposal!.titleAr ?? "", en: proposal!.title ?? "" },
        projectId: proposal!.projectId,
        workspaceId: proposal!.workspaceId,
        locale: proposal!.locale as "ar" | "en",
        version: proposal!.version,
      },
    });
  }, "proposals/builder GET");
}

export async function POST(request: NextRequest) {
  // `withTenant("writer")` replaces a raw getServerSession call, which skipped
  // the MFA step-up, the forced-password-change gate, and the writer-role check
  // — so a read-only REVIEWER could overwrite a proposal's sections.
  return withTenant("writer", async (ctx: TenantHandlerContext) => {
    const { proposalId, sections, metadata } = await parseJsonBody(
      request,
      builderSaveSchema
    );

    const isUpdate = Boolean(proposalId);

    if (!isUpdate && !metadata.projectId) {
      throw new ApiError(
        "Active project is required to create a proposal draft",
        400,
        "PROPOSAL_PROJECT_REQUIRED"
      );
    }

    // Ownership of a body-supplied projectId is verified before it becomes a
    // foreign key. It was previously written straight through, creating a
    // cross-tenant reference that later routes then read through.
    let ownedProjectId: string | null = null;
    if (metadata.projectId) {
      ownedProjectId = await resolveOwnedProjectId(
        metadata.projectId,
        ctx.workspace.id
      );
      if (!ownedProjectId) {
        throw new ApiError(
          "Project not found in this workspace",
          404,
          "PROJECT_NOT_FOUND"
        );
      }
    }

    if (isUpdate) {
      const existing = await db.generatedProposal.findUnique({
        where: { id: proposalId! },
        select: { id: true, workspaceId: true },
      });
      requireTenantRecord(existing, ctx.workspace.id);
    }

    // One transaction for the whole save. The previous shape was
    // `update` -> `deleteMany` -> N un-transacted `create`s, so a failure part
    // way through left the proposal with zero sections and no way back.
    const { proposal, createdSections } = await db.$transaction(async (tx) => {
      const target = isUpdate
        ? await tx.generatedProposal.update({
            where: { id: proposalId! },
            data: {
              title: metadata.title.en,
              titleAr: metadata.title.ar,
              locale: metadata.locale,
              version: { increment: 1 },
              updatedAt: new Date(),
            },
          })
        : await tx.generatedProposal.create({
            data: {
              workspaceId: ctx.workspace.id,
              projectId: ownedProjectId!,
              createdById: ctx.userId,
              title: metadata.title.en,
              titleAr: metadata.title.ar,
              type: "COMBINED",
              status: "DRAFT",
              locale: metadata.locale,
              version: 1,
            },
          });

      if (isUpdate) {
        await tx.proposalBuilderSection.deleteMany({
          where: { proposalId: target.id },
        });
      }

      const created: ProposalBuilderSection[] = [];
      for (const [index, s] of sections.entries()) {
        created.push(
          await tx.proposalBuilderSection.create({
            data: {
              proposalId: target.id,
              sectionKey: s.sectionKey,
              sectionType: s.sectionType,
              sortOrder: s.sortOrder ?? index,
              titleJson: s.title,
              contentJson: s.content,
              // Schema-validated above; Prisma's JSON input type is structural
              // and does not accept a bare Record.
              metadataJson: (s.metadata ?? {}) as Prisma.InputJsonValue,
              isRequired: s.isRequired ?? false,
              isVisible: s.isVisible ?? true,
              validationJson: (s.validation ?? {}) as Prisma.InputJsonValue,
              createdBy: ctx.userId,
            },
          })
        );
      }

      return { proposal: target, createdSections: created };
    });

    await audit({
      userId: ctx.userId,
      action: isUpdate ? "PROPOSAL_BUILDER_UPDATE" : "PROPOSAL_BUILDER_CREATE",
      resource: "GeneratedProposal",
      resourceId: proposal.id,
      details: { sectionCount: sections.length },
      success: true,
    });

    // Analytics runs after the builder writes commit. One bounded attempt per
    // committed mutation; a failure never changes this response (req 4.1, 4.4).
    const origin = analyticsRequestOrigin({
      tenantWorkspaceId: ctx.workspace.id,
      actorUserId: ctx.userId,
    });
    const locale = metadata.locale;

    await recordProposalAnalyticsEvent({
      eventType: isUpdate ? "proposal_edited" : "proposal_created",
      proposalId: proposal.id,
      mutationRef: proposal.version,
      origin,
      metadata: {
        revision: proposal.version,
        sectionCount: sections.length,
        locale,
        projectId: ownedProjectId ?? proposal.projectId,
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

    return jsonOk({
      ok: true,
      proposalId: proposal.id,
      workspaceId: proposal.workspaceId,
      version: proposal.version,
      sections: createdSections,
    });
  }, "proposals/builder POST");
}
