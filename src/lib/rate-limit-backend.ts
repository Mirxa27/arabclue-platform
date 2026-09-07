/**
 * Which store a deployment shares its rate limits through. Pure, so the
 * readiness report and the limiter itself resolve the same answer from the
 * same environment and cannot disagree.
 */

export type RateLimitEnvironment = {
  readonly NODE_ENV?: string;
  readonly VERCEL?: string;
  readonly REDIS_URL?: string;
  readonly RATE_LIMIT_BACKEND?: string;
};

/** Backend a deployment is configured to share its limits through. */
export type DistributedRateLimitBackend = "redis" | "postgres" | null;

/**
 * Redis when REDIS_URL is set. Otherwise the database on Vercel in production
 * (every function instance has its own memory, and the database is the one
 * store they all share) or when `RATE_LIMIT_BACKEND=postgres` asks for it on a
 * multi-node self-host. `RATE_LIMIT_BACKEND=memory` opts a single-node host out.
 */
export function distributedRateLimitBackend(
  env: RateLimitEnvironment = process.env
): DistributedRateLimitBackend {
  if (env.REDIS_URL?.trim()) return "redis";
  const requested = env.RATE_LIMIT_BACKEND?.trim().toLowerCase();
  if (requested === "postgres") return "postgres";
  if (requested === "memory") return null;
  if (env.NODE_ENV === "production" && Boolean(env.VERCEL?.trim())) {
    return "postgres";
  }
  return null;
}
