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
