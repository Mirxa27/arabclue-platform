export type ReadinessCheck = {
  readonly ok: boolean;
  readonly detail: string;
};

export type ProductionInfrastructureEnvironment = {
  readonly NODE_ENV?: string;
  readonly VERCEL?: string;
  readonly BLOB_READ_WRITE_TOKEN?: string;
  readonly REDIS_URL?: string;
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
  const redisConfigured = configured(env.REDIS_URL);
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
      // Prefer Redis when configured. Memory is acceptable on single-node
      // hosts and Vercel Hobby (no Redis). Multi-instance Redis remains recommended.
      ok: true,
      detail: redisConfigured
        ? "redis"
        : production
          ? onVercel
            ? "memory_vercel"
            : "memory_single_instance"
          : "memory_development",
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
