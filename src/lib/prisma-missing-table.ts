import { Prisma } from "@prisma/client";

/**
 * True when Prisma reports a missing table/relation (common on Neon before Phase 4 migration).
 */
export function isPrismaMissingTable(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === "P2021" || error.code === "P2010";
  }
  if (error instanceof Error) {
    return /does not exist|P2021|P2010/i.test(error.message);
  }
  return false;
}
