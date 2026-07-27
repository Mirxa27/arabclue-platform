import { NextRequest } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import {
  withTenant,
  jsonOk,
  parseJsonBody,
  parseSearchParams,
  ApiError,
  type TenantHandlerContext,
} from "@/lib/api-controller";
import type { TemplateMarketplaceItem } from "@/lib/proposal-builder-types";
import { isTemplateCategory } from "@/lib/template-marketplace-catalog";

function parseSectionTypes(value: unknown): TemplateMarketplaceItem["sectionTypes"] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is TemplateMarketplaceItem["sectionTypes"][number] =>
      typeof item === "string",
  );
}

const localizedSchema = z.object({
  ar: z.string().min(1).max(500),
  en: z.string().min(1).max(500),
});

const sectionTypeSchema = z.array(z.string().min(1).max(100)).min(1).max(50);

const marketplaceListSchema = z
  .object({
    category: z.string().optional(),
    sortBy: z.enum(["newest", "rating", "downloads", "name"]).default("newest"),
    isFeatured: z.enum(["true", "false"]).optional(),
    search: z.string().max(200).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

const marketplaceCreateSchema = z
  .object({
    templateKey: z.string().min(1).max(100),
    name: localizedSchema,
    description: localizedSchema,
    category: z.string().min(1).max(100),
    industry: z.string().max(200).optional(),
    sectionTypes: sectionTypeSchema,
    previewData: z.record(z.string(), z.unknown()).optional(),
    isPublic: z.boolean().default(false),
    tags: z.array(z.string().max(100)).max(50).default([]),
  })
  .strict();

export async function GET(request: NextRequest) {
  return withTenant("session", async (ctx: TenantHandlerContext) => {
    const parsed = parseSearchParams(request, marketplaceListSchema);

    const category = parsed.category && isTemplateCategory(parsed.category) ? parsed.category : null;
    const search = parsed.search ?? null;

    const where: Record<string, unknown> = {
      AND: [
        { isRetired: false },
        {
          OR: [
            { workspaceId: ctx.workspace.id },
            { isPublic: true },
            { workspaceId: null },
          ],
        },
      ],
    };

    if (category) (where.AND as object[]).push({ category });
    if (parsed.isFeatured === "true") (where.AND as object[]).push({ isFeatured: true });
    if (search) {
      (where.AND as object[]).push({
        OR: [
          { nameJson: { path: ["en"], string_contains: search } },
          { nameJson: { path: ["ar"], string_contains: search } },
          { descriptionJson: { path: ["en"], string_contains: search } },
          { descriptionJson: { path: ["ar"], string_contains: search } },
        ],
      });
    }

    const orderBy =
      parsed.sortBy === "rating"
        ? { rating: "desc" as const }
        : parsed.sortBy === "downloads"
          ? { downloadCount: "desc" as const }
          : { createdAt: "desc" as const };

    const [rows, total] = await Promise.all([
      db.templateMarketplaceEntry.findMany({
        where,
        orderBy,
        skip: (parsed.page - 1) * parsed.pageSize,
        take: parsed.pageSize,
        include: {
          creator: { select: { id: true, name: true, avatarUrl: true } },
          workspace: { select: { id: true, name: true, nameAr: true } },
        },
      }),
      db.templateMarketplaceEntry.count({ where }),
    ]);

    return jsonOk({
      templates: rows.map((t) => ({
        id: t.id,
        templateKey: t.templateKey,
        name: t.nameJson as { ar: string; en: string },
        description: t.descriptionJson as { ar: string; en: string },
        category: isTemplateCategory(t.category) ? t.category : "general",
        industry: t.industry,
        sectionTypes: parseSectionTypes(t.sectionTypes),
        previewData:
          t.previewJson && typeof t.previewJson === "object"
            ? (t.previewJson as Record<string, unknown>)
            : null,
        rating: t.rating,
        ratingCount: t.ratingCount,
        downloadCount: t.downloadCount,
        usageCount: t.usageCount,
        isPublic: t.isPublic,
        isFeatured: t.isFeatured,
        version: t.version,
        tags: t.tags,
        createdBy: t.createdBy,
        createdAt: t.createdAt.toISOString(),
        source: t.workspaceId
          ? t.workspaceId === ctx.workspace.id
            ? "workspace"
            : "public"
          : "system",
      })),
      total,
      page: parsed.page,
      pageSize: parsed.pageSize,
      source: "database",
    });
  }, "templates/marketplace GET");
}

export async function POST(request: NextRequest) {
  return withTenant("writer", async (ctx: TenantHandlerContext) => {
    const body = await parseJsonBody(request, marketplaceCreateSchema);

    if (!isTemplateCategory(body.category)) {
      throw new ApiError("Invalid category", 400, "MARKETPLACE_INVALID_CATEGORY");
    }

    const existing = await db.templateMarketplaceEntry.findUnique({
      where: {
        workspaceId_templateKey: {
          workspaceId: ctx.workspace.id,
          templateKey: body.templateKey,
        },
      },
    });

    if (existing) {
      throw new ApiError("Template key already exists", 400, "TEMPLATE_KEY_IN_USE");
    }

    const template = await db.templateMarketplaceEntry.create({
      data: {
        workspaceId: ctx.workspace.id,
        templateKey: body.templateKey,
        nameJson: { ar: body.name.ar.trim(), en: body.name.en.trim() },
        descriptionJson: { ar: body.description.ar.trim(), en: body.description.en.trim() },
        category: body.category,
        industry: body.industry,
        sectionTypes: body.sectionTypes,
        // The schema already bounds this to a JSON object of unknown values;
        // the assertion only narrows it to Prisma's JSON input type.
        previewJson: (body.previewData ?? {}) as Prisma.InputJsonValue,
        isPublic: body.isPublic,
        isFeatured: false,
        version: 1,
        tags: body.tags,
        createdBy: ctx.userId,
      },
    });

    await audit({
      userId: ctx.userId,
      action: "TEMPLATE_CREATE",
      resource: "TemplateMarketplaceEntry",
      resourceId: template.id,
      details: { templateKey: body.templateKey, category: body.category },
      success: true,
    });

    return jsonOk({ template });
  }, "templates/marketplace POST");
}