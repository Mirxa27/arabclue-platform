import { Prisma } from "@prisma/client";
import { db } from "./db";

/**
 * Marketplace usage accounting — Requirement 15.7 and Property 31.
 *
 * The entry usage count increments by exactly one for the first application of
 * an entry to a proposal and stays unchanged for every later application of the
 * same entry to the same proposal. The invariant is carried by the
 * `TemplateMarketplaceApplication` unique constraint on `(entryId, proposalId)`
 * rather than by a read-then-write check, so concurrent requests cannot both
 * observe "not yet applied" and both increment.
 */

export interface MarketplaceApplicationInput {
  readonly entryId: string;
  readonly proposalId: string;
  readonly workspaceId: string;
  readonly appliedById: string;
}

export interface MarketplaceApplicationResult {
  /** True when this call created the (entry, proposal) pair and incremented the count. */
  readonly firstApplication: boolean;
  /** Usage count after this call. */
  readonly usageCount: number;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

/**
 * Records an application of a marketplace entry to a proposal, incrementing the
 * entry usage count only on the first application of that pair.
 *
 * Throws when the entry does not exist. A missing-table error propagates so the
 * caller's Schema_Guard converts it to a bilingual 503.
 */
export async function recordMarketplaceApplication(
  input: MarketplaceApplicationInput
): Promise<MarketplaceApplicationResult> {
  try {
    return await db.$transaction(async (tx) => {
      await tx.templateMarketplaceApplication.create({
        data: {
          entryId: input.entryId,
          proposalId: input.proposalId,
          workspaceId: input.workspaceId,
          appliedById: input.appliedById,
        },
      });

      const entry = await tx.templateMarketplaceEntry.update({
        where: { id: input.entryId },
        data: { usageCount: { increment: 1 } },
        select: { usageCount: true },
      });

      return { firstApplication: true, usageCount: entry.usageCount };
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;

    // The pair already exists: leave the usage count exactly as stored.
    const entry = await db.templateMarketplaceEntry.findUnique({
      where: { id: input.entryId },
      select: { usageCount: true },
    });
    return {
      firstApplication: false,
      usageCount: entry?.usageCount ?? 0,
    };
  }
}

/** Number of distinct proposals an entry has been applied to. */
export async function countMarketplaceApplications(
  entryId: string
): Promise<number> {
  return db.templateMarketplaceApplication.count({ where: { entryId } });
}

export interface MarketplaceEntryCounts {
  readonly rating: number;
  readonly ratingCount: number;
  readonly usageCount: number;
  readonly downloadCount: number;
}

/**
 * Rewrites an entry's engagement columns from the tables that record the
 * events: the average and count of its ratings, the count of proposals it was
 * applied to. `downloadCount` has no writer anywhere and goes to zero.
 *
 * Exists because the system catalog rows were seeded, before the catalog was
 * zeroed, with invented figures ("4.8 ★ (126) · 920") that the seed's update
 * path then preserved for months. The seed calls this for every system entry.
 */
export async function reconcileMarketplaceEntryCounts(
  entryId: string,
  client: Pick<typeof db, "templateMarketplaceRating" | "templateMarketplaceApplication" | "templateMarketplaceEntry"> = db,
): Promise<MarketplaceEntryCounts> {
  const [ratings, usageCount] = await Promise.all([
    client.templateMarketplaceRating.aggregate({
      where: { entryId },
      _avg: { rating: true },
      _count: { _all: true },
    }),
    client.templateMarketplaceApplication.count({ where: { entryId } }),
  ]);
  const ratingCount = ratings._count._all;
  const rating = ratingCount > 0 && ratings._avg.rating != null ? Math.round(ratings._avg.rating * 10) / 10 : 0;
  const counts: MarketplaceEntryCounts = { rating, ratingCount, usageCount, downloadCount: 0 };
  await client.templateMarketplaceEntry.update({ where: { id: entryId }, data: counts });
  return counts;
}
