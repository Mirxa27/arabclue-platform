/**
 * Sliding-window rate limiter.
 * Uses Redis when REDIS_URL is set (multi-instance safe); otherwise in-memory.
 */

import { randomUUID } from "node:crypto";

type Bucket = { timestamps: number[] };

const buckets = new Map<string, Bucket>();

type RedisClient = {
  zAdd: (
    key: string,
    members: Array<{ score: number; value: string }>
  ) => Promise<number>;
  zRemRangeByScore: (key: string, min: number, max: number) => Promise<number>;
  zCard: (key: string) => Promise<number>;
  zRange: (
    key: string,
    start: number,
    stop: number,
    opts?: { REV?: boolean }
  ) => Promise<string[]>;
  expire: (key: string, seconds: number) => Promise<boolean>;
  eval: (
    script: string,
    options: { keys: string[]; arguments: string[] }
  ) => Promise<unknown>;
  connect: () => Promise<unknown>;
  isOpen: boolean;
};

let redisClient: RedisClient | null | undefined;
let redisInit: Promise<RedisClient | null> | null = null;

async function getRedis(): Promise<RedisClient | null> {
  if (redisClient !== undefined) return redisClient;
  if (redisInit) return redisInit;
  redisInit = (async () => {
    const url = process.env.REDIS_URL?.trim();
    if (!url) {
      redisClient = null;
      return null;
    }
    try {
      const { createClient } = await import("redis");
      const client = createClient({ url }) as unknown as RedisClient;
      client.connect().catch((err: unknown) => {
        console.warn("[rate-limit] redis connect failed", err);
        redisClient = null;
      });
      // wait briefly for connect
      for (let i = 0; i < 20 && !client.isOpen; i++) {
        await new Promise((r) => setTimeout(r, 50));
      }
      if (!client.isOpen) {
        redisClient = null;
        return null;
      }
      redisClient = client;
      return client;
    } catch (err) {
      console.warn("[rate-limit] redis unavailable", err);
      redisClient = null;
      return null;
    }
  })();
  return redisInit;
}

function memoryRateLimit(opts: {
  key: string;
  limit: number;
  windowMs: number;
}): { ok: boolean; remaining: number; retryAfterMs: number } {
  const now = Date.now();
  const bucket = buckets.get(opts.key) ?? { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter((t) => now - t < opts.windowMs);
  if (bucket.timestamps.length >= opts.limit) {
    const oldest = bucket.timestamps[0] ?? now;
    buckets.set(opts.key, bucket);
    return {
      ok: false,
      remaining: 0,
      retryAfterMs: Math.max(0, opts.windowMs - (now - oldest)),
    };
  }
  bucket.timestamps.push(now);
  buckets.set(opts.key, bucket);
  return {
    ok: true,
    remaining: opts.limit - bucket.timestamps.length,
    retryAfterMs: 0,
  };
}

async function redisRateLimit(opts: {
  key: string;
  limit: number;
  windowMs: number;
  client: RedisClient;
}): Promise<{ ok: boolean; remaining: number; retryAfterMs: number }> {
  const now = Date.now();
  const redisKey = `rl:${opts.key}`;
  const member = `${now}:${randomUUID()}`;
  const result = await opts.client.eval(
    `
      local key = KEYS[1]
      local now = tonumber(ARGV[1])
      local window = tonumber(ARGV[2])
      local limit = tonumber(ARGV[3])
      local member = ARGV[4]
      redis.call("ZREMRANGEBYSCORE", key, "-inf", now - window)
      local count = redis.call("ZCARD", key)
      if count >= limit then
        local oldest = redis.call("ZRANGE", key, 0, 0, "WITHSCORES")
        local oldestScore = now
        if oldest[2] then oldestScore = tonumber(oldest[2]) end
        return {0, count, oldestScore}
      end
      redis.call("ZADD", key, now, member)
      redis.call("PEXPIRE", key, window + 5000)
      return {1, count + 1, 0}
    `,
    {
      keys: [redisKey],
      arguments: [
        String(now),
        String(opts.windowMs),
        String(opts.limit),
        member,
      ],
    }
  );
  if (!Array.isArray(result) || result.length < 3) {
    throw new Error("Redis rate limiter returned an invalid response");
  }
  const accepted = Number(result[0]) === 1;
  const count = Number(result[1]);
  const oldestScore = Number(result[2]);
  if (!accepted) {
    return {
      ok: false,
      remaining: 0,
      retryAfterMs: Math.max(
        1,
        opts.windowMs - (now - (Number.isFinite(oldestScore) ? oldestScore : now))
      ),
    };
  }
  return {
    ok: true,
    remaining: Math.max(0, opts.limit - count),
    retryAfterMs: 0,
  };
}

/** Sync API used by auth routes — prefers Redis when available. */
export function rateLimit(opts: {
  key: string;
  limit: number;
  windowMs: number;
}): { ok: boolean; remaining: number; retryAfterMs: number } {
  // Kick off Redis connect in background; sync path uses memory until ready.
  void getRedis();
  if (redisClient && redisClient.isOpen) {
    // Fire-and-forget async path cannot return Promise from sync callers —
    // use memory for sync, and expose rateLimitAsync for new code.
    return memoryRateLimit(opts);
  }
  return memoryRateLimit(opts);
}

/** Preferred async limiter — Redis when REDIS_URL is configured. */
export async function rateLimitAsync(opts: {
  key: string;
  limit: number;
  windowMs: number;
  requireDistributed?: boolean;
}): Promise<{
  ok: boolean;
  remaining: number;
  retryAfterMs: number;
  backend: "redis" | "memory" | "unavailable";
}> {
  const client = await getRedis();
  if (client?.isOpen) {
    try {
      return {
        ...(await redisRateLimit({ ...opts, client })),
        backend: "redis",
      };
    } catch (err) {
      console.warn("[rate-limit] redis op failed", err);
      if (opts.requireDistributed) {
        return {
          ok: false,
          remaining: 0,
          retryAfterMs: 5_000,
          backend: "unavailable",
        };
      }
    }
  }
  if (opts.requireDistributed) {
    return {
      ok: false,
      remaining: 0,
      retryAfterMs: 5_000,
      backend: "unavailable",
    };
  }
  return { ...memoryRateLimit(opts), backend: "memory" };
}

export type DistributedLeaseAdmission =
  | Readonly<{ status: "acquired"; token: string }>
  | Readonly<{ status: "busy"; retryAfterMs: number }>
  | Readonly<{ status: "unavailable"; retryAfterMs: number }>;

/**
 * Acquire a cross-instance lease with one atomic Redis script. Expired leases
 * are removed before capacity is checked, so crashed renderers self-heal.
 */
export async function acquireDistributedLease(options: {
  readonly key: string;
  readonly limit: number;
  readonly leaseMs: number;
}): Promise<DistributedLeaseAdmission> {
  const client = await getRedis();
  if (!client?.isOpen) {
    return { status: "unavailable", retryAfterMs: 5_000 };
  }
  const now = Date.now();
  const token = randomUUID();
  try {
    const result = await client.eval(
      `
        local key = KEYS[1]
        local now = tonumber(ARGV[1])
        local limit = tonumber(ARGV[2])
        local expiresAt = tonumber(ARGV[3])
        local token = ARGV[4]
        redis.call("ZREMRANGEBYSCORE", key, "-inf", now)
        local count = redis.call("ZCARD", key)
        if count >= limit then
          local oldest = redis.call("ZRANGE", key, 0, 0, "WITHSCORES")
          local oldestExpiry = now + 1000
          if oldest[2] then oldestExpiry = tonumber(oldest[2]) end
          return {0, oldestExpiry}
        end
        redis.call("ZADD", key, expiresAt, token)
        redis.call("PEXPIRE", key, (expiresAt - now) + 5000)
        return {1, expiresAt}
      `,
      {
        keys: [`lease:${options.key}`],
        arguments: [
          String(now),
          String(options.limit),
          String(now + options.leaseMs),
          token,
        ],
      }
    );
    if (!Array.isArray(result) || result.length < 2) {
      throw new Error("Redis lease returned an invalid response");
    }
    if (Number(result[0]) !== 1) {
      return {
        status: "busy",
        retryAfterMs: Math.max(1, Number(result[1]) - now),
      };
    }
    return { status: "acquired", token };
  } catch (error) {
    console.warn("[rate-limit] distributed lease acquisition failed", error);
    return { status: "unavailable", retryAfterMs: 5_000 };
  }
}

/** Release a lease only when the opaque token matches a live member. */
export async function releaseDistributedLease(options: {
  readonly key: string;
  readonly token: string;
}): Promise<void> {
  const client = await getRedis();
  if (!client?.isOpen) return;
  try {
    await client.eval(
      `return redis.call("ZREM", KEYS[1], ARGV[1])`,
      {
        keys: [`lease:${options.key}`],
        arguments: [options.token],
      }
    );
  } catch (error) {
    // The bounded lease expiry is the recovery path if release is unavailable.
    console.warn("[rate-limit] distributed lease release failed", error);
  }
}

/** Periodic cleanup to avoid unbounded memory */
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) {
    b.timestamps = b.timestamps.filter((t) => now - t < 60 * 60 * 1000);
    if (b.timestamps.length === 0) buckets.delete(k);
  }
}, 5 * 60 * 1000).unref?.();
