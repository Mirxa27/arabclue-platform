/**
 * Production uses Neon Postgres; schema migrations run as an explicit,
 * operator-approved release step before a compatible application deployment.
 * This helper only verifies connectivity (no SQLite /tmp bootstrap).
 */
import { db } from "./db";
import { resolveDatabaseUrl } from "./database-url";

let ensurePromise: Promise<void> | null = null;

export async function ensureDatabaseReady(): Promise<void> {
  if (!ensurePromise) {
    ensurePromise = doEnsure().catch((err) => {
      ensurePromise = null;
      throw err;
    });
  }
  await ensurePromise;
}

async function doEnsure(): Promise<void> {
  // Resolve exactly as the Prisma client does: Vercel + Neon supplies
  // POSTGRES_PRISMA_URL and may not set DATABASE_URL at all, so checking only
  // the latter made this gate fail on a perfectly healthy deployment.
  const url = resolveDatabaseUrl() ?? "";
  if (!url || (!url.startsWith("postgresql://") && !url.startsWith("postgres://"))) {
    throw new Error(
      "A PostgreSQL connection string is required: set POSTGRES_PRISMA_URL (Neon pooled) or DATABASE_URL"
    );
  }
  await db.$queryRaw`SELECT 1`;
}
