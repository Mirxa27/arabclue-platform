import { redactSensitiveText } from "@/lib/api-failure";
import { NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron-auth";
import { isEmailConfigured } from "@/lib/email";
import { dispatchPendingNotificationEmails } from "@/lib/notification-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/cron/notification-dispatch
 *
 * Claims PENDING NotificationDelivery email outbox rows and sends them via
 * Resend with a 10-second provider timeout and at most three attempts within
 * the 30-minute delivery deadline (requirements 17.4–17.6). Protected by
 * CRON_SECRET.
 */
export async function POST(req: NextRequest) {
  const denied = authorizeCron(req);
  if (denied) return denied;

  try {
    const summary = await dispatchPendingNotificationEmails({
      batchSize: 50,
      workerId: `vercel-cron-${crypto.randomUUID()}`,
    });

    return NextResponse.json({
      ok: summary.errors.length === 0,
      emailConfigured: isEmailConfigured(),
      ...summary,
      time: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: redactSensitiveText(
          err instanceof Error ? err.message : String(err)
        ),
        time: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
