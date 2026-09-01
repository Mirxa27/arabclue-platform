/**
 * Sliding-window rate limiter.
 * Uses Redis when REDIS_URL is set (multi-instance safe); otherwise in-memory.
 */

import { randomUUID } from "node:crypto";

type Bucket = { timestamps: number[] };

const buckets = new Map<string, Bucket>();

export function requiresDistributedRateLimit(
  requested: boolean | undefined,
  env: {
    readonly NODE_ENV?: string;
    readonly VERCEL?: string;
    readonly REDIS_URL?: string;
  } = process.env
): boolean {
  if (requested === true) return true;
  if (requested === false) return false;
  // Only fail-closed on Redis when Redis is actually configured.
  // Otherwise allow in-memory limits (Hostinger / Vercel Hobby).
  return Boolean(env.REDIS_URL?.trim());
}

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
  ping: () => Promise<string>;
  on: (
    event: "error" | "end",
    listener: (error?: unknown) => void
  ) => unknown;
  isOpen: boolean;
  isReady: boolean;
  destroy: () => void;
};

let redisClient: RedisClient | null | undefined;
let redisConnectingClient: RedisClient | undefined;
let redisInit: Promise<RedisClient | null> | null = null;
let redisRetryAfter = 0;
let redisGeneration = 0;
const REDIS_RETRY_DELAY_MS = 5_000;
const REDIS_CONNECT_TIMEOUT_MS = 1_000;
const REDIS_COMMAND_TIMEOUT_MS = 1_000;
/**
 * Upper bound for acquiring a usable client: module load, connect, and ping.
 * Keeps a fail-closed answer inside the caller's budget even on a cold start.
 */
const REDIS_ACQUIRE_TIMEOUT_MS = 2_000;

function destroyRedisClient(client: RedisClient | undefined): void {
  if (!client) return;
  try {
    client.destroy();
  } catch {
    // The client may already be closed. State invalidation still proceeds.
  }
}

function markRedisUnavailable(
  client?: RedisClient,
  generation = redisGeneration
): void {
  if (generation !== redisGeneration) return;
  if (
    client &&
    ((redisClient && redisClient !== client) ||
      (redisConnectingClient &&
        redisConnectingClient !== client &&
        redisClient !== client))
  ) {
    return;
  }
  destroyRedisClient(client);
  if (!client || redisClient === client) redisClient = null;
  if (redisConnectingClient === client) redisConnectingClient = undefined;
  redisClient = null;
  redisRetryAfter = Date.now() + REDIS_RETRY_DELAY_MS;
}

function invalidateAllRedisConnections(): void {
  const readyClient = redisClient ?? undefined;
  const connectingClient = redisConnectingClient;
  redisGeneration += 1;
  redisClient = null;
  redisConnectingClient = undefined;
  redisRetryAfter = Date.now() + REDIS_RETRY_DELAY_MS;
  destroyRedisClient(readyClient);
  if (connectingClient !== readyClient) destroyRedisClient(connectingClient);
}

class RedisDeadlineError extends Error {
  constructor(label: string) {
    super(`Redis ${label} timed out`);
    this.name = "RedisDeadlineError";
  }
}

async function withRedisDeadline<T>(
  operation: Promise<T>,
  timeoutMs: number,
  label: string,
  onTimeout: () => void
): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      onTimeout();
      reject(new RedisDeadlineError(label));
    }, timeoutMs);
  });
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
  }
}

async function runRedisCommand<T>(
  client: RedisClient,
  command: () => Promise<T>,
  label: string
): Promise<T> {
  if (!client.isReady) {
    markRedisUnavailable(client);
    throw new Error("Redis client is not ready");
  }
  try {
    return await withRedisDeadline(
      command(),
      REDIS_COMMAND_TIMEOUT_MS,
      label,
      () => markRedisUnavailable(client)
    );
  } catch (error) {
    markRedisUnavailable(client);
    throw error;
  }
}

export function redisReconnectAllowed(
  retryAfter: number,
  now = Date.now()
): boolean {
  return now >= retryAfter;
}

async function getRedis(): Promise<RedisClient | null> {
  if (redisClient?.isReady) return redisClient;
  if (redisClient) markRedisUnavailable(redisClient);
  if (
    redisClient === null &&
    !redisReconnectAllowed(redisRetryAfter)
  ) {
    return null;
  }
  if (redisInit) return redisInit;
  const generation = ++redisGeneration;
  const initialization = (async () => {
    const url = process.env.REDIS_URL?.trim();
    if (!url) {
      markRedisUnavailable(undefined, generation);
      return null;
    }
    let client: RedisClient | undefined;
    try {
      const { createClient } = await import("redis");
      const createdClient = createClient({
        url,
        socket: {
          connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
          reconnectStrategy: false,
        },
      }) as unknown as RedisClient;
      client = createdClient;
      redisConnectingClient = createdClient;
      createdClient.on("error", (error: unknown) => {
        if (generation !== redisGeneration) return;
        console.warn("[rate-limit] redis client error", error);
        markRedisUnavailable(createdClient, generation);
      });
      createdClient.on("end", () => {
        markRedisUnavailable(createdClient, generation);
      });
      await withRedisDeadline(
        createdClient.connect(),
        REDIS_CONNECT_TIMEOUT_MS,
        "connect",
        () => markRedisUnavailable(createdClient, generation)
      );
      if (!createdClient.isReady || generation !== redisGeneration) {
        throw new Error("Redis connection did not become ready");
      }
      const pong = await runRedisCommand(
        createdClient,
        () => createdClient.ping(),
        "ping"
      );
      if (pong !== "PONG") throw new Error("Redis ping failed");
      if (generation !== redisGeneration) {
        // A newer acquisition superseded this one while it was in flight.
        destroyRedisClient(createdClient);
        return null;
      }
      redisClient = createdClient;
      redisConnectingClient = undefined;
      redisRetryAfter = 0;
      return createdClient;
    } catch (err) {
      console.warn("[rate-limit] redis unavailable", err);
      markRedisUnavailable(client, generation);
      return null;
    }
  })();
  redisInit = initialization;
  try {
    // The whole acquisition is bounded, not just the connect and the ping. A
    // cold `import("redis")` can cost seconds on a first invocation, and an
    // unbounded acquisition would stall every rate-limited request behind it.
    return await withRedisDeadline(
      initialization,
      REDIS_ACQUIRE_TIMEOUT_MS,
      "acquire",
      () => invalidateAllRedisConnections()
    );
  } catch {
    return null;
  } finally {
    if (redisInit === initialization) redisInit = null;
  }
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
  const result = await runRedisCommand(
    opts.client,
    () =>
      opts.client.eval(
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
      ),
    "rate-limit command"
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
  if (redisClient?.isReady) {
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
  const requireDistributed = requiresDistributedRateLimit(
    opts.requireDistributed
  );
  const client = await getRedis();
  if (client?.isReady) {
    try {
      return {
        ...(await redisRateLimit({ ...opts, client })),
        backend: "redis",
      };
    } catch (err) {
      console.warn("[rate-limit] redis op failed", err);
      markRedisUnavailable(client);
      if (requireDistributed) {
        return {
          ok: false,
          remaining: 0,
          retryAfterMs: 5_000,
          backend: "unavailable",
        };
      }
    }
  }
  if (requireDistributed) {
    return {
      ok: false,
      remaining: 0,
      retryAfterMs: 5_000,
      backend: "unavailable",
    };
  }
  return { ...memoryRateLimit(opts), backend: "memory" };
}

export function describeRateLimitDenial(result: {
  readonly backend: "redis" | "memory" | "unavailable";
  readonly retryAfterMs: number;
}): {
  readonly status: 429 | 503;
  readonly retryAfterSeconds: number;
} {
  // No machine token: 503 already says the limiter is down and 429 already
  // says the caller is over budget, and a lowercase string beside them was
  // only ever echoed into a response body no one could read.
  return {
    status: result.backend === "unavailable" ? 503 : 429,
    retryAfterSeconds: Math.max(
      1,
      Math.ceil(result.retryAfterMs / 1_000)
    ),
  };
}

/** Bounded connectivity probe shared by readiness and guarded operations. */
export async function probeDistributedRateLimitBackend(
  timeoutMs = 1_500
): Promise<boolean> {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 5_000) {
    throw new RangeError("Redis readiness timeout is invalid");
  }
  const probe = (async () => {
    const client = await getRedis();
    if (!client?.isReady) return false;
    try {
      return (
        (await runRedisCommand(client, () => client.ping(), "readiness ping")) ===
        "PONG"
      );
    } catch (error) {
      console.warn("[rate-limit] redis readiness probe failed", error);
      markRedisUnavailable(client);
      return false;
    }
  })();
  try {
    return await withRedisDeadline(
      probe,
      timeoutMs,
      "readiness probe",
      invalidateAllRedisConnections
    );
  } catch (error) {
    if (!(error instanceof RedisDeadlineError)) {
      console.warn("[rate-limit] redis readiness probe failed", error);
    }
    return false;
  }
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
  if (!client?.isReady) {
    return { status: "unavailable", retryAfterMs: 5_000 };
  }
  const now = Date.now();
  const token = randomUUID();
  try {
    const result = await runRedisCommand(
      client,
      () =>
        client.eval(
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
        ),
      "lease acquisition"
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
  if (!client?.isReady) return;
  try {
    await runRedisCommand(
      client,
      () =>
        client.eval(`return redis.call("ZREM", KEYS[1], ARGV[1])`, {
          keys: [`lease:${options.key}`],
          arguments: [options.token],
        }),
      "lease release"
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
