import { NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron-auth";
import { archiveOldAnalyticsEvents } from "@/lib/analytics-retention";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/cron/analytics-retention
 * Aggregates analytics events older than 90 days into daily summaries and
 * deletes the individual events. Runs on a periodic cron schedule.
 */
export async function POST(req: NextRequest) {
  const denied = authorizeCron(req);
  if (denied) return denied;

  try {
    const result = await archiveOldAnalyticsEvents();
    return NextResponse.json({
      ok: true,
      archivedEventCount: result.archivedEventCount,
      summaryBucketCount: result.summaryBucketCount,
      cutoff: result.cutoff,
      time: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[cron/analytics-retention]", err);
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.name : "analytics_retention_failed",
      },
      { status: 500 }
    );
  }
}

/** GET allowed for Vercel Cron (uses Authorization header). */
export async function GET(req: NextRequest) {
  return POST(req);
}
