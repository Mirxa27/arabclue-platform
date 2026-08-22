import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import {
  withTenant,
  jsonOk,
  parseJsonBody,
  ResourceNotFoundError,
  type TenantHandlerContext,
} from "@/lib/api-controller";
import { marketplaceEntryVisibilityWhere } from "@/lib/marketplace-template-resolve";

type Params = { params: Promise<{ id: string }> };

const ratingSchema = z
  .object({
    rating: z.number().int().min(1).max(5),
  })
  .strict();

async function resolveEntry(id: string, workspaceId: string) {
  const entry = await db.templateMarketplaceEntry.findFirst({
    where: marketplaceEntryVisibilityWhere(id, workspaceId),
  });
  if (!entry) throw new ResourceNotFoundError();
  if (entry.isRetired && entry.workspaceId !== workspaceId) {
    throw new ResourceNotFoundError();
  }
  return entry;
}

/**
 * POST /api/templates/marketplace/[id]/rate
 * Upserts one integer 1–5 rating per user per entry and recomputes the
 * one-decimal average atomically.
 */
export async function POST(request: NextRequest, { params }: Params) {
  return withTenant("session", async (ctx: TenantHandlerContext) => {
    const { id } = await params;
    const { rating } = await parseJsonBody(request, ratingSchema);
    const entry = await resolveEntry(id, ctx.workspace.id);

    const { rounded, ratingCount } = await db.$transaction(async (tx) => {
      await tx.templateMarketplaceRating.upsert({
        where: {
          entryId_userId: { entryId: entry.id, userId: ctx.userId },
        },
        create: { entryId: entry.id, userId: ctx.userId, rating },
        update: { rating },
      });

      const aggregation = await tx.templateMarketplaceRating.aggregate({
        where: { entryId: entry.id },
        _avg: { rating: true },
        _count: { rating: true },
      });

      const avgRating = aggregation._avg.rating ?? 0;
      const count = aggregation._count.rating ?? 0;
      const nextAverage = Math.round(avgRating * 10) / 10;

      await tx.templateMarketplaceEntry.update({
        where: { id: entry.id },
        data: { rating: nextAverage, ratingCount: count },
      });

      return { rounded: nextAverage, ratingCount: count };
    });

    await audit({
      userId: ctx.userId,
      action: "MARKETPLACE_TEMPLATE_RATE",
      resource: "TemplateMarketplaceEntry",
      resourceId: entry.id,
      details: { templateKey: entry.templateKey, rating },
      success: true,
    });

    return jsonOk({ userRating: rating, averageRating: rounded, ratingCount });
  }, "templates/marketplace/[id]/rate POST");
}

/**
 * GET /api/templates/marketplace/[id]/rate
 * Get the current user's rating for a marketplace template entry.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  return withTenant("session", async (ctx: TenantHandlerContext) => {
    const { id } = await params;
    const entry = await resolveEntry(id, ctx.workspace.id);

    const userRating = await db.templateMarketplaceRating.findUnique({
      where: {
        entryId_userId: { entryId: entry.id, userId: ctx.userId },
      },
    });

    return jsonOk({
      userRating: userRating?.rating ?? null,
      averageRating: entry.rating,
      ratingCount: entry.ratingCount,
    });
  }, "templates/marketplace/[id]/rate GET");
}