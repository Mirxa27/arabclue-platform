import { PrismaClient } from "@prisma/client";

/**
 * Prefer Neon Prisma URL (pooled + pgbouncer-safe) when present.
 * Falls back to DATABASE_URL.
 */
function resolveDatabaseUrl(): string | undefined {
  return (
    process.env.POSTGRES_PRISMA_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    undefined
  );
}

const datasourceUrl = resolveDatabaseUrl();

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["error", "warn"],
    ...(datasourceUrl ? { datasources: { db: { url: datasourceUrl } } } : {}),
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
