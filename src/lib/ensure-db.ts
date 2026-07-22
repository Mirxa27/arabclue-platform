/**
 * Production uses Neon Postgres — schema is applied via `prisma migrate deploy`.
 * This helper only verifies connectivity (no SQLite /tmp bootstrap).
 */
import { db } from "./db";

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
  const url = process.env.DATABASE_URL?.trim() ?? "";
  if (!url || (!url.startsWith("postgresql://") && !url.startsWith("postgres://"))) {
    throw new Error(
      "DATABASE_URL must be a PostgreSQL connection string (e.g. Neon pooled URL)"
    );
  }
  await db.$queryRawUnsafe(`SELECT 1`);
}
