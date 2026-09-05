import { redactSensitiveText } from "@/lib/api-failure";
import { NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron-auth";
import { isEmailConfigured } from "@/lib/email";
import {
  NOTIFICATION_DISPATCH_BUDGET_MS,
  dispatchPendingNotificationEmails,
} from "@/lib/notification-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/cron/notification-dispatch
 *
 * Daily sweep of the NotificationDelivery email outbox: rows the inline
 * post-commit attempt could not deliver are claimed and sent with a 10-second
 * provider timeout, at most three attempts within the 26-hour delivery
 * deadline (requirements 17.4–17.6). The sweep stops claiming after 45 seconds
 * so it always returns inside maxDuration. Protected by CRON_SECRET.
 */
export async function POST(req: NextRequest) {
  const denied = authorizeCron(req);
  if (denied) return denied;

  try {
    const summary = await dispatchPendingNotificationEmails({
      batchSize: 50,
      workerId: `vercel-cron-${crypto.randomUUID()}`,
      budgetMs: NOTIFICATION_DISPATCH_BUDGET_MS,
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
