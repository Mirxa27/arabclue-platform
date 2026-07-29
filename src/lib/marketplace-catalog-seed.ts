/**
 * Persist the frozen SYSTEM_TEMPLATE_CATALOG into TemplateMarketplaceEntry
 * (workspaceId null). Idempotent upsert by templateKey for system rows.
 */

import { db } from "./db";
import { asSchemaMigrationPendingError } from "./api-failure";
import { SYSTEM_TEMPLATE_CATALOG } from "./template-marketplace-catalog";

type PrismaClientLike = typeof db;

export type MarketplaceCatalogSeedResult = Readonly<{
  seeded: number;
  updated: number;
  skipped: boolean;
  reason?: string;
}>;

async function resolveSystemActorId(
  client: PrismaClientLike
): Promise<string | null> {
  const email = (
    process.env.BOOTSTRAP_ADMIN_EMAIL || "admin@arabclue.com"
  )
    .trim()
    .toLowerCase();
  const byEmail = await client.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (byEmail) return byEmail.id;

  const admin = await client.user.findFirst({
    where: { role: { in: ["SUPER_ADMIN", "ADMIN"] }, active: true },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return admin?.id ?? null;
}

export async function ensureSystemMarketplaceCatalogSeeded(
  client: PrismaClientLike = db
): Promise<MarketplaceCatalogSeedResult> {
  try {
    const actorId = await resolveSystemActorId(client);
    if (!actorId) {
      return { seeded: 0, updated: 0, skipped: true, reason: "NO_SYSTEM_ACTOR" };
    }

    let seeded = 0;
    let updated = 0;

    for (const item of SYSTEM_TEMPLATE_CATALOG) {
      const existing = await client.templateMarketplaceEntry.findFirst({
        where: { workspaceId: null, templateKey: item.templateKey },
        select: { id: true },
      });

      const baseData = {
        nameJson: item.name,
        descriptionJson: item.description,
        category: item.category,
        industry: item.industry,
        sectionTypes: item.sectionTypes,
        isPublic: item.isPublic,
        isFeatured: item.isFeatured,
        isRetired: false,
        version: item.version,
        tags: item.tags,
      };

      if (existing) {
        await client.templateMarketplaceEntry.update({
          where: { id: existing.id },
          data: baseData,
        });
        updated += 1;
      } else {
        await client.templateMarketplaceEntry.create({
          data: {
            workspaceId: null,
            templateKey: item.templateKey,
            ...baseData,
            rating: item.rating,
            ratingCount: item.ratingCount,
            downloadCount: item.downloadCount,
            usageCount: item.usageCount,
            createdBy: actorId,
          },
        });
        seeded += 1;
      }
    }

    return { seeded, updated, skipped: false };
  } catch (error) {
    const pending = asSchemaMigrationPendingError(error);
    if (pending) throw pending;
    throw error;
  }
}
