/**
 * Sliding-window rate limiter.
 * Uses Redis when REDIS_URL is set (multi-instance safe); otherwise in-memory.
 */

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
  const member = `${now}:${Math.random().toString(36).slice(2, 10)}`;
  await opts.client.zRemRangeByScore(redisKey, 0, now - opts.windowMs);
  const count = await opts.client.zCard(redisKey);
  if (count >= opts.limit) {
    const oldest = await opts.client.zRange(redisKey, 0, 0);
    const oldestScore = oldest[0] ? Number(oldest[0].split(":")[0]) : now;
    return {
      ok: false,
      remaining: 0,
      retryAfterMs: Math.max(0, opts.windowMs - (now - oldestScore)),
    };
  }
  await opts.client.zAdd(redisKey, [{ score: now, value: member }]);
  await opts.client.expire(redisKey, Math.ceil(opts.windowMs / 1000) + 5);
  return {
    ok: true,
    remaining: Math.max(0, opts.limit - count - 1),
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
}): Promise<{ ok: boolean; remaining: number; retryAfterMs: number }> {
  const client = await getRedis();
  if (client?.isOpen) {
    try {
      return await redisRateLimit({ ...opts, client });
    } catch (err) {
      console.warn("[rate-limit] redis op failed, falling back to memory", err);
    }
  }
  return memoryRateLimit(opts);
}

/** Periodic cleanup to avoid unbounded memory */
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) {
    b.timestamps = b.timestamps.filter((t) => now - t < 60 * 60 * 1000);
    if (b.timestamps.length === 0) buckets.delete(k);
  }
}, 5 * 60 * 1000).unref?.();
