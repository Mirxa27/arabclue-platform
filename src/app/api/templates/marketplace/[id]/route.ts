import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import {
  withTenant,
  jsonOk,
  ResourceNotFoundError,
  ApiError,
  type TenantHandlerContext,
} from "@/lib/api-controller";
import { isTemplateCategory } from "@/lib/template-marketplace-catalog";

type Params = { params: Promise<{ id: string }> };

function parseSectionTypes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

/**
 * GET /api/templates/marketplace/[id]
 * Returns a single marketplace entry. Retired entries are visible only to the
 * publishing workspace.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  return withTenant("session", async (ctx: TenantHandlerContext) => {
    const { id } = await params;
    const workspaceId = ctx.workspace.id;

    const row = await db.templateMarketplaceEntry.findFirst({
      where: {
        OR: [
          { id },
          { templateKey: id, workspaceId },
          { templateKey: id, workspaceId: null, isPublic: true },
          { templateKey: id, isPublic: true },
        ],
      },
      include: {
        workspace: { select: { id: true, name: true, nameAr: true } },
        creator: { select: { id: true, name: true, avatarUrl: true } },
      },
    });

    if (!row) throw new ResourceNotFoundError();

    // Retired entries are invisible to non-publishing workspaces
    if (row.isRetired && row.workspaceId !== workspaceId) {
      throw new ResourceNotFoundError();
    }

    return jsonOk({
      entry: {
        id: row.id,
        templateKey: row.templateKey,
        name: row.nameJson as { ar: string; en: string },
        description: row.descriptionJson as { ar: string; en: string },
        category: isTemplateCategory(row.category) ? row.category : "general",
        industry: row.industry,
        sectionTypes: parseSectionTypes(row.sectionTypes),
        previewData:
          row.previewJson && typeof row.previewJson === "object"
            ? (row.previewJson as Record<string, unknown>)
            : null,
        rating: row.rating,
        ratingCount: row.ratingCount,
        usageCount: row.usageCount,
        downloadCount: row.downloadCount,
        tags: row.tags,
        isPublic: row.isPublic,
        isFeatured: row.isFeatured,
        isRetired: row.isRetired,
        version: row.version,
        publisher: row.workspace
          ? { id: row.workspace.id, name: row.workspace.name, nameAr: row.workspace.nameAr }
          : null,
        creator: row.creator
          ? { id: row.creator.id, name: row.creator.name, avatarUrl: row.creator.avatarUrl }
          : null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        source: row.workspaceId
          ? row.workspaceId === workspaceId
            ? "workspace"
            : "public"
          : "system",
      },
    });
  }, "templates/marketplace/[id] GET");
}

/**
 * DELETE /api/templates/marketplace/[id]
 * Retires a marketplace entry. Only the publishing workspace can retire.
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  return withTenant("writer", async (ctx: TenantHandlerContext) => {
    const { id } = await params;
    const workspaceId = ctx.workspace.id;

    const row = await db.templateMarketplaceEntry.findFirst({
      where: {
        OR: [{ id }, { templateKey: id, workspaceId }],
      },
    });

    if (!row) throw new ResourceNotFoundError();

    // Only publishing workspace can retire
    if (row.workspaceId !== workspaceId) {
      throw new ApiError("Only the publisher can retire", 403, "MARKETPLACE_RETIRE_FORBIDDEN");
    }

    if (row.isRetired) {
      return jsonOk({ alreadyRetired: true });
    }

    await db.templateMarketplaceEntry.update({
      where: { id: row.id },
      data: { isRetired: true },
    });

    await audit({
      userId: ctx.userId,
      action: "MARKETPLACE_TEMPLATE_RETIRE",
      resource: "TemplateMarketplaceEntry",
      resourceId: row.id,
      details: { templateKey: row.templateKey },
      success: true,
    });

    return jsonOk({ retired: true });
  }, "templates/marketplace/[id] DELETE");
}