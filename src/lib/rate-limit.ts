/**
 * Simple in-memory sliding-window rate limiter for auth endpoints.
 * Suitable for single-node deploy; replace with Redis for multi-instance.
 */

type Bucket = { timestamps: number[] };

const buckets = new Map<string, Bucket>();

export function rateLimit(opts: {
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

/** Periodic cleanup to avoid unbounded memory */
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) {
    b.timestamps = b.timestamps.filter((t) => now - t < 60 * 60 * 1000);
    if (b.timestamps.length === 0) buckets.delete(k);
  }
}, 5 * 60 * 1000).unref?.();
