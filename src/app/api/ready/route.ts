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
    ok: Boolean(process.env.NEXTAUTH_SECRET && process.env.NEXTAUTH_SECRET.length >= 16),
  };
  checks.encKey = {
    ok:
      process.env.NODE_ENV !== "production" ||
      Boolean(process.env.ARABCLUE_ENC_KEY && process.env.ARABCLUE_ENC_KEY.length >= 16),
  };

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

  const ready = Object.values(checks).every((c) => c.ok);
  return NextResponse.json(
    {
      ready,
      service: "arabclue",
      checks,
      time: new Date().toISOString(),
    },
    { status: ready ? 200 : 503 }
  );
}
