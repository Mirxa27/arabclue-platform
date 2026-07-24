import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getMyFatoorahPublicConfig } from "@/lib/myfatoorah";

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

  const onVercel = Boolean(process.env.VERCEL);
  const blobConfigured = Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
  checks.storage = {
    ok: !onVercel || blobConfigured,
    detail: blobConfigured
      ? "vercel_blob"
      : onVercel
        ? "ephemeral_/tmp"
        : "local_uploads",
  };
  if (onVercel && !blobConfigured) {
    console.warn(
      "[ready] BLOB_READ_WRITE_TOKEN unset on Vercel — uploads use /tmp and are lost on cold start"
    );
  }

  checks.rateLimit = {
    ok: true,
    detail: process.env.REDIS_URL?.trim() ? "redis" : "memory",
  };

  checks.email = {
    ok: true,
    detail: process.env.RESEND_API_KEY?.trim()
      ? "resend"
      : "degraded_no_resend",
  };

  checks.cron = {
    ok: true,
    detail:
      process.env.CRON_SECRET && process.env.CRON_SECRET.length >= 16
        ? "configured"
        : "CRON_SECRET_missing",
  };

  const ready = Object.values(checks).every((c) => c.ok);
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
      rateLimit: process.env.REDIS_URL?.trim() ? "redis" : "memory",
      time: new Date().toISOString(),
    },
    { status: ready ? 200 : 503 }
  );
}
