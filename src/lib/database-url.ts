/**
 * Single source of truth for the PostgreSQL connection string.
 *
 * Lives apart from `db.ts` deliberately. Tests replace the whole `db` module
 * with `mock.module("../db", ...)`, so anything exported from there disappears
 * for every consumer in that test process. Keeping the resolver here lets
 * `db.ts` and `ensure-db.ts` agree on the connection without the readiness
 * check breaking whenever a test fakes the client.
 */

/**
 * Prefer the Neon Prisma URL (pooled and pgbouncer-safe) when present, then
 * fall back to `DATABASE_URL`.
 *
 * Vercel + Neon sets `POSTGRES_PRISMA_URL` and may not set `DATABASE_URL` at
 * all, so a check that reads only the latter reports failure on a deployment
 * that is connecting perfectly well.
 */
export function resolveDatabaseUrl(): string | undefined {
  return (
    process.env.POSTGRES_PRISMA_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    undefined
  );
}
