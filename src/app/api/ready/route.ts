import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getMyFatoorahPublicConfig } from "@/lib/myfatoorah";
import { productionInfrastructureReadiness } from "@/lib/production-readiness";
import {
  probeDistributedRateLimitBackend,
  requiresDistributedRateLimit,
} from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * GET /api/ready — readiness probe for load balancers.
 * Checks DB connectivity and critical configuration surface (not secrets).
 */
export async function GET() {
  const checks: Record<string, { ok: boolean; detail?: string }> = {};

  try {
    await db.$queryRaw`SELECT 1`;
    checks.database = { ok: true };
  } catch (err) {
    checks.database = {
      ok: false,
      detail: err instanceof Error ? err.message.slice(0, 120) : "unavailable",
    };
  }

  checks.nextauthSecret = {
    ok: Boolean(
      process.env.NEXTAUTH_SECRET && process.env.NEXTAUTH_SECRET.length >= 16
    ),
  };
  checks.encKey = {
    ok:
      process.env.NODE_ENV !== "production" ||
      Boolean(
        process.env.ARABCLUE_ENC_KEY && process.env.ARABCLUE_ENC_KEY.length >= 16
      ),
  };

  try {
    const activeProviders = await db.aIProviderConfig.count({
      where: { isActive: true },
    });
    checks.llmProviders = {
      ok: true,
      detail:
        activeProviders > 0
          ? `active:${activeProviders}`
          : "none_active_deterministic_fallback",
    };
  } catch {
    checks.llmProviders = { ok: false, detail: "provider_query_failed" };
  }

  try {
    const mf = await getMyFatoorahPublicConfig();
    checks.myfatoorah = {
      ok: true,
      detail: mf.configured
        ? `configured:${mf.environment ?? "unknown"}`
        : "not_configured",
    };
  } catch {
    checks.myfatoorah = { ok: false, detail: "config_error" };
  }

  const infrastructure = productionInfrastructureReadiness(process.env);
  checks.storage = infrastructure.storage;
  checks.rateLimit = infrastructure.rateLimit;
  checks.cron = infrastructure.cron;
  const distributedRateLimitRequired = requiresDistributedRateLimit(undefined);
  if (checks.rateLimit.ok && distributedRateLimitRequired) {
    const reachable = await probeDistributedRateLimitBackend();
    checks.rateLimit = {
      ok: reachable,
      detail: reachable ? "redis" : "redis_unavailable",
    };
  }
  if (!infrastructure.storage.ok) {
    console.warn(
      "[ready] BLOB_READ_WRITE_TOKEN unset on Vercel — uploads use /tmp and are lost on cold start"
    );
  }

  checks.email = {
    ok: true,
    detail: process.env.RESEND_API_KEY?.trim()
      ? "resend"
      : "degraded_no_resend",
  };

  const ready = Object.values(checks).every((c) => c.ok);
  const blobConfigured = Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
  const onVercel = Boolean(process.env.VERCEL);
  return NextResponse.json(
    {
      ready,
      service: "arabclue",
      checks,
      storage: blobConfigured
        ? "vercel_blob"
        : onVercel
          ? "ephemeral"
          : "local",
      rateLimit: checks.rateLimit.ok
        ? process.env.REDIS_URL?.trim()
          ? "redis"
          : "memory"
        : "unavailable",
      time: new Date().toISOString(),
    },
    { status: ready ? 200 : 503 }
  );
}
