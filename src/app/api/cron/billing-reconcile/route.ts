import { redactSensitiveText } from "@/lib/api-failure";
import { NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron-auth";
import { reconcilePendingCheckouts } from "@/lib/billing";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST /api/cron/billing-reconcile — MyFatoorah pending checkout reconciliation */
export async function POST(req: NextRequest) {
  const denied = authorizeCron(req);
  if (denied) return denied;

  try {
    const result = await reconcilePendingCheckouts({
      olderThanMinutes: 5,
      limit: 50,
    });
    return NextResponse.json({
      ok: true,
      ...result,
      time: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[cron/billing-reconcile]", err);
    return NextResponse.json(
      {
        ok: false,
        error: redactSensitiveText(err instanceof Error ? err.message : "reconcile failed"),
      },
      { status: 500 }
    );
  }
}

/** GET allowed for Vercel Cron (uses Authorization header). */
export async function GET(req: NextRequest) {
  return POST(req);
}
