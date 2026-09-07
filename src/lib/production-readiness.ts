export type ReadinessCheck = {
  readonly ok: boolean;
  readonly detail: string;
};

import {
  distributedRateLimitBackend,
  type RateLimitEnvironment,
} from "./rate-limit-backend";

export type ProductionInfrastructureEnvironment = RateLimitEnvironment & {
  readonly BLOB_READ_WRITE_TOKEN?: string;
  readonly CRON_SECRET?: string;
};

function configured(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

/**
 * Required infrastructure is fail-open for local development and fail-closed
 * in production. Vercel additionally requires durable Blob storage because its
 * local filesystem is ephemeral.
 */
export function productionInfrastructureReadiness(
  env: ProductionInfrastructureEnvironment
): {
  readonly storage: ReadinessCheck;
  readonly rateLimit: ReadinessCheck;
  readonly cron: ReadinessCheck;
} {
  const production = env.NODE_ENV === "production";
  const onVercel = configured(env.VERCEL);
  const blobConfigured = configured(env.BLOB_READ_WRITE_TOKEN);
  const sharedBackend = distributedRateLimitBackend(env);
  const cronConfigured = (env.CRON_SECRET?.trim().length ?? 0) >= 16;

  return {
    storage: {
      ok: !onVercel || blobConfigured,
      detail: blobConfigured
        ? "vercel_blob"
        : onVercel
          ? "ephemeral_/tmp"
          : "local_uploads",
    },
    rateLimit: {
      // A shared backend (Redis, or the platform database) whenever the
      // deployment runs more than one instance; Vercel production always
      // resolves to one unless RATE_LIMIT_BACKEND=memory opts out, in which
      // case per-instance counters are not a rate limit: fail closed there.
      ok: sharedBackend !== null || !(production && onVercel),
      detail: sharedBackend ?? (production
        ? onVercel
          ? "shared_backend_disabled_on_vercel"
          : "memory_single_instance"
        : "memory_development"),
    },
    cron: {
      ok: !production || cronConfigured,
      detail: cronConfigured
        ? "configured"
        : production
          ? "CRON_SECRET_missing_or_short"
          : "not_required_in_development",
    },
  };
}
