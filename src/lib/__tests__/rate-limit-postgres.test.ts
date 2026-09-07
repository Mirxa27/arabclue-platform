/**
 * The database-backed limiter and lease, driven through a fake of the two raw
 * Prisma calls it makes. The fake implements the same statements' semantics
 * (upsert-and-return-count; conditional insert under a live-count) so the
 * assertions cover window arithmetic, refusal accounting, lease expiry and the
 * fail-closed deadline without a network round-trip.
 */
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

type WindowRow = { key: string; windowStart: bigint; count: number; expiresAt: Date };
type LeaseRow = { token: string; key: string; expiresAt: Date };
type RawQuery = { strings?: readonly string[]; sql?: string; values?: unknown[] };

const windows = new Map<string, WindowRow>();
const leases = new Map<string, LeaseRow>();
let hang = false;

function sqlText(query: RawQuery): string {
  return (query.strings ?? [query.sql ?? ""]).join("?").replace(/\s+/g, " ").trim();
}
function values(query: RawQuery): readonly unknown[] {
  return query.values ?? [];
}
const never = () => new Promise<never>(() => {});

function liveLeases(key: string, now: Date): LeaseRow[] {
  return [...leases.values()]
    .filter((l) => l.key === key && l.expiresAt > now)
    .sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime());
}
function purge<T extends { expiresAt: Date }>(table: Map<string, T>, cutoff: Date): number {
  let n = 0;
  for (const [id, row] of table) if (row.expiresAt < cutoff) { table.delete(id); n++; }
  return n;
}

mock.module("../db", () => ({
  db: {
    $queryRaw: mock(async (query: RawQuery) => {
      if (hang) return never();
      const text = sqlText(query);
      if (text.startsWith('INSERT INTO "RateLimitWindow"')) {
        // The initial count is a literal in the statement, not a bound value.
        const [key, windowStart, expiresAt] = values(query) as [string, bigint, Date];
        const id = `${key}|${windowStart}`;
        const row = windows.get(id) ?? { key, windowStart, count: 0, expiresAt };
        row.count += 1;
        windows.set(id, row);
        return [{ count: row.count }];
      }
      if (text.startsWith('SELECT "expiresAt" FROM "RateLimitLease"')) {
        const [key, now] = values(query) as [string, Date];
        return liveLeases(key, now).slice(0, 1).map((l) => ({ expiresAt: l.expiresAt }));
      }
      if (text.startsWith("SELECT 1 AS ok")) return [];
      throw new Error(`unexpected query: ${text}`);
    }),
    $executeRaw: mock(async (query: RawQuery) => {
      if (hang) return never();
      const text = sqlText(query);
      if (text.startsWith('INSERT INTO "RateLimitLease"')) {
        const [token, key, expiresAt, keyAgain, now, limit] = values(query) as
          [string, string, Date, string, Date, number];
        expect(keyAgain).toBe(key);
        if (liveLeases(key, now).length >= limit) return 0;
        leases.set(token, { token, key, expiresAt });
        return 1;
      }
      if (text.startsWith('DELETE FROM "RateLimitLease" WHERE "token"')) {
        const [token] = values(query) as [string];
        return leases.delete(token) ? 1 : 0;
      }
      if (text.startsWith('DELETE FROM "RateLimitWindow" WHERE "expiresAt"')) {
        return purge(windows, (values(query) as [Date])[0]);
      }
      if (text.startsWith('DELETE FROM "RateLimitLease" WHERE "expiresAt"')) {
        return purge(leases, (values(query) as [Date])[0]);
      }
      throw new Error(`unexpected statement: ${text}`);
    }),
  },
}));

const {
  postgresAcquireLease,
  postgresRateLimit,
  postgresReleaseLease,
  probePostgresRateLimitBackend,
  windowStartFor,
} = await import("../rate-limit-postgres");

beforeEach(() => {
  windows.clear();
  leases.clear();
  hang = false;
});
afterEach(() => {
  hang = false;
});


describe("fixed windows", () => {
  test("window start is the floor of now to the window size", () => {
    expect(windowStartFor(59_999, 60_000)).toBe(0);
    expect(windowStartFor(60_000, 60_000)).toBe(60_000);
    expect(windowStartFor(119_999, 60_000)).toBe(60_000);
    expect(windowStartFor(1_000_000, 1)).toBe(1_000_000);
  });

  test("admits `limit` requests in a window and refuses the next with the time to the window end", async () => {
    const now = 120_000 + 15_000;
    const results = [];
    for (let i = 0; i < 4; i++) {
      results.push(await postgresRateLimit({ key: "k", limit: 3, windowMs: 60_000, now }));
    }
    expect(results.map((r) => r.ok)).toEqual([true, true, true, false]);
    expect(results.map((r) => r.remaining)).toEqual([2, 1, 0, 0]);
    expect(results[3].retryAfterMs).toBe(45_000);
  });

  test("refused requests still count, so retries cannot reopen a full window", async () => {
    for (let i = 0; i < 5; i++) {
      await postgresRateLimit({ key: "k", limit: 1, windowMs: 60_000, now: 60_000 });
    }
    expect(windows.get(`k|${BigInt(60_000)}`)?.count).toBe(5);
  });

  test("keys are independent and a new window starts clean", async () => {
    await postgresRateLimit({ key: "a", limit: 1, windowMs: 60_000, now: 0 });
    const other = await postgresRateLimit({ key: "b", limit: 1, windowMs: 60_000, now: 0 });
    expect(other.ok).toBe(true);
    const second = await postgresRateLimit({ key: "a", limit: 1, windowMs: 60_000, now: 59_999 });
    expect(second.ok).toBe(false);
    const next = await postgresRateLimit({ key: "a", limit: 1, windowMs: 60_000, now: 60_000 });
    expect(next.ok).toBe(true);
  });

  test("rows are stamped to expire just after their window", async () => {
    await postgresRateLimit({ key: "k", limit: 1, windowMs: 60_000, now: 30_000 });
    expect(windows.get(`k|${BigInt(0)}`)?.expiresAt.getTime()).toBe(65_000);
  });
});

describe("capacity leases", () => {
  test("hands out `limit` slots, then reports busy until the soonest lease lapses", async () => {
    const a = await postgresAcquireLease({ key: "render", limit: 2, leaseMs: 10_000, token: "t1", now: 0 });
    const b = await postgresAcquireLease({ key: "render", limit: 2, leaseMs: 5_000, token: "t2", now: 1_000 });
    const c = await postgresAcquireLease({ key: "render", limit: 2, leaseMs: 10_000, token: "t3", now: 2_000 });
    expect(a).toEqual({ status: "acquired", token: "t1" });
    expect(b).toEqual({ status: "acquired", token: "t2" });
    expect(c).toEqual({ status: "busy", retryAfterMs: 4_000 });
  });

  test("an expired lease frees its slot without a release", async () => {
    await postgresAcquireLease({ key: "render", limit: 1, leaseMs: 1_000, token: "crashed", now: 0 });
    const after = await postgresAcquireLease({ key: "render", limit: 1, leaseMs: 1_000, token: "next", now: 1_001 });
    expect(after.status).toBe("acquired");
  });

  test("release removes exactly the token's lease", async () => {
    await postgresAcquireLease({ key: "render", limit: 1, leaseMs: 60_000, token: "t1", now: 0 });
    await postgresReleaseLease("t1");
    const again = await postgresAcquireLease({ key: "render", limit: 1, leaseMs: 60_000, token: "t2", now: 1 });
    expect(again.status).toBe("acquired");
    expect(leases.has("t1")).toBe(false);
  });
});

describe("fail closed", () => {
  test("a database that does not answer rejects inside the deadline instead of admitting", async () => {
    hang = true;
    const started = Date.now();
    await expect(
      postgresRateLimit({ key: "k", limit: 1, windowMs: 60_000 })
    ).rejects.toThrow(/timed out/);
    expect(Date.now() - started).toBeLessThan(3_000);
  }, 5_000);

  test("the readiness probe answers false rather than throwing", async () => {
    expect(await probePostgresRateLimitBackend()).toBe(true);
    hang = true;
    expect(await probePostgresRateLimitBackend()).toBe(false);
  }, 5_000);
});
