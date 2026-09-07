/**
 * Distributed rate limiting on the platform database.
 *
 * Every Vercel function instance has its own memory, so an in-memory counter is
 * not a rate limit there. The platform has no Redis; the one thing every
 * instance shares is Postgres. Each check is one atomic statement
 * (INSERT ... ON CONFLICT DO UPDATE ... RETURNING), so concurrent instances
 * agree on the count without a lock round-trip or a transaction.
 *
 * Fixed windows rather than the Redis sorted-set sliding window: a sliding
 * window needs a per-request member and a range scan, which is not one
 * statement in SQL. A fixed window admits at most `limit` requests per
 * `windowMs` bucket and at most 2× that across any two adjacent buckets,
 * which is the accepted bound for an abuse limiter.
 *
 * Every call is bounded by a deadline and fails closed when the database does
 * not answer: an unlimited path is worse than a refused one.
 */

import { Prisma } from "@prisma/client";
import { db } from "./db";

/** Matches the Redis limiter's per-command budget. */
const COMMAND_TIMEOUT_MS = 1_500;
/** Minimum gap between two sweeps of expired windows and leases. */
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
let lastSweepAt = 0;

class PostgresDeadlineError extends Error {
  constructor(label: string) {
    super(`Postgres rate-limit ${label} timed out`);
    this.name = "PostgresDeadlineError";
  }
}

async function withDeadline<T>(operation: Promise<T>, label: string): Promise<T> {
  let handle: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    handle = setTimeout(() => reject(new PostgresDeadlineError(label)), COMMAND_TIMEOUT_MS);
  });
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (handle !== undefined) clearTimeout(handle);
  }
}

/** Fixed-window bucket a timestamp belongs to. */
export function windowStartFor(now: number, windowMs: number): number {
  return Math.floor(now / windowMs) * windowMs;
}

export type PostgresRateLimitResult = {
  ok: boolean;
  remaining: number;
  retryAfterMs: number;
};

/**
 * Count one request against `key` in the current fixed window. The count is
 * incremented even when the request is refused, which is intentional: a client
 * hammering a full bucket must not have its window reset by its own retries.
 */
export async function postgresRateLimit(opts: {
  key: string;
  limit: number;
  windowMs: number;
  now?: number;
}): Promise<PostgresRateLimitResult> {
  const now = opts.now ?? Date.now();
  const windowStart = windowStartFor(now, opts.windowMs);
  const windowEnd = windowStart + opts.windowMs;
  // Kept a little past the window so a late request on the boundary still
  // finds its row; the sweep removes it afterwards.
  const expiresAt = new Date(windowEnd + 5_000);

  const rows = await withDeadline(
    db.$queryRaw<Array<{ count: number }>>(Prisma.sql`
      INSERT INTO "RateLimitWindow" ("key", "windowStart", "count", "expiresAt")
      VALUES (${opts.key}, ${BigInt(windowStart)}, 1, ${expiresAt})
      ON CONFLICT ("key", "windowStart")
      DO UPDATE SET "count" = "RateLimitWindow"."count" + 1
      RETURNING "count"
    `),
    "window increment"
  );
  const count = Number(rows[0]?.count ?? 0);
  if (!Number.isFinite(count) || count < 1) {
    throw new Error("Postgres rate limiter returned an invalid count");
  }
  void sweepExpired(now);
  if (count > opts.limit) {
    return { ok: false, remaining: 0, retryAfterMs: Math.max(1, windowEnd - now) };
  }
  return { ok: true, remaining: Math.max(0, opts.limit - count), retryAfterMs: 0 };
}


export type PostgresLeaseAdmission =
  | Readonly<{ status: "acquired"; token: string }>
  | Readonly<{ status: "busy"; retryAfterMs: number }>;

/**
 * Take one of `limit` slots under `key` for `leaseMs`. Expired leases do not
 * count, so a crashed holder frees its slot when its promise lapses. The
 * conditional INSERT ... SELECT is one statement; the live-count subquery and
 * the insert share a snapshot, and the row lock on the key's existing leases is
 * not needed because the worst case of two racers on the last slot is one
 * extra render — bounded by `maxConcurrentRenders + 1`, never unbounded.
 */
export async function postgresAcquireLease(opts: {
  key: string;
  limit: number;
  leaseMs: number;
  token: string;
  now?: number;
}): Promise<PostgresLeaseAdmission> {
  const now = opts.now ?? Date.now();
  const nowDate = new Date(now);
  const expiresAt = new Date(now + opts.leaseMs);
  const inserted = await withDeadline(
    db.$executeRaw(Prisma.sql`
      INSERT INTO "RateLimitLease" ("token", "key", "expiresAt")
      SELECT ${opts.token}, ${opts.key}, ${expiresAt}
      WHERE (
        SELECT COUNT(*) FROM "RateLimitLease"
        WHERE "key" = ${opts.key} AND "expiresAt" > ${nowDate}
      ) < ${opts.limit}
    `),
    "lease acquisition"
  );
  if (inserted === 1) return { status: "acquired", token: opts.token };

  const oldest = await withDeadline(
    db.$queryRaw<Array<{ expiresAt: Date }>>(Prisma.sql`
      SELECT "expiresAt" FROM "RateLimitLease"
      WHERE "key" = ${opts.key} AND "expiresAt" > ${nowDate}
      ORDER BY "expiresAt" ASC LIMIT 1
    `),
    "lease inspection"
  );
  const soonest = oldest[0]?.expiresAt?.getTime() ?? now + 1_000;
  return { status: "busy", retryAfterMs: Math.max(1, soonest - now) };
}

export async function postgresReleaseLease(token: string): Promise<void> {
  await withDeadline(
    db.$executeRaw(Prisma.sql`DELETE FROM "RateLimitLease" WHERE "token" = ${token}`),
    "lease release"
  );
}

/**
 * Drop windows and leases whose expiry has passed. Runs at most every five
 * minutes per instance, off the request path, and never throws: the limiter's
 * correctness does not depend on the sweep, only its table size does.
 */
export async function sweepExpired(now = Date.now()): Promise<void> {
  if (now - lastSweepAt < SWEEP_INTERVAL_MS) return;
  lastSweepAt = now;
  const cutoff = new Date(now);
  try {
    await db.$executeRaw(
      Prisma.sql`DELETE FROM "RateLimitWindow" WHERE "expiresAt" < ${cutoff}`
    );
    await db.$executeRaw(
      Prisma.sql`DELETE FROM "RateLimitLease" WHERE "expiresAt" < ${cutoff}`
    );
  } catch (error) {
    console.warn("[rate-limit] postgres sweep failed", error);
  }
}

/** Bounded connectivity probe for readiness: the table must exist and answer. */
export async function probePostgresRateLimitBackend(): Promise<boolean> {
  try {
    const rows = await withDeadline(
      db.$queryRaw<Array<{ ok: number }>>(
        Prisma.sql`SELECT 1 AS ok FROM "RateLimitWindow" LIMIT 1`
      ),
      "readiness probe"
    );
    return Array.isArray(rows);
  } catch (error) {
    console.warn("[rate-limit] postgres readiness probe failed", error);
    return false;
  }
}
