import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorizeCron } from "@/lib/cron-auth";
import { sendEmail, isEmailConfigured } from "@/lib/email";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/cron/expiry-notifications
 * Email workspace OWNERs about certificates and subscriptions nearing expiry.
 * Deduped via ExpiryNotificationLog. Skips email when RESEND_API_KEY unset.
 */
export async function POST(req: NextRequest) {
  const denied = authorizeCron(req);
  if (denied) return denied;

  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const emailReady = isEmailConfigured();

  let certScanned = 0;
  let certEmailed = 0;
  let certSkipped = 0;
  let subScanned = 0;
  let subEmailed = 0;
  let subSkipped = 0;
  const errors: string[] = [];

  const certs = await db.certificate.findMany({
    where: {
      expiresAt: { not: null, lte: in30 },
      revokedAt: null,
    },
    take: 100,
    orderBy: { expiresAt: "asc" },
  });

  for (const cert of certs) {
    if (!cert.expiresAt) continue;
    certScanned += 1;
    const resourceId = `${cert.id}:${cert.expiresAt.toISOString().slice(0, 10)}`;
    const already = await db.expiryNotificationLog.findUnique({
      where: {
        workspaceId_kind_resourceId_channel: {
          workspaceId: cert.workspaceId,
          kind: "CERT_EXPIRY",
          resourceId,
          channel: "email",
        },
      },
    });
    if (already) {
      certSkipped += 1;
      continue;
    }

    const owners = await db.workspaceMember.findMany({
      where: {
        workspaceId: cert.workspaceId,
        role: { in: ["OWNER", "ADMIN"] },
      },
      include: { user: { select: { email: true, name: true, active: true } } },
    });
    const recipients = owners
      .filter((m) => m.user.active && m.user.email)
      .map((m) => m.user.email);

    if (recipients.length === 0) {
      certSkipped += 1;
      continue;
    }

    const days = Math.ceil(
      (cert.expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
    );
    const subject =
      days < 0
        ? `[ArabClue] Certificate expired: ${cert.name}`
        : `[ArabClue] Certificate expires in ${days}d: ${cert.name}`;
    const html = `<p>Hello,</p>
<p>Certificate <strong>${escapeHtml(cert.name)}</strong> (${escapeHtml(cert.certType)})
${days < 0 ? "has expired" : `expires in ${days} day(s)`}
on <strong>${cert.expiresAt.toISOString().slice(0, 10)}</strong>.</p>
<p>Update it under Account → Certificates so proposals stay qualification-ready.</p>
<p>— ArabClue</p>`;

    const result = await sendEmail({ to: recipients, subject, html });
    if (result.ok || result.skipped) {
      await db.expiryNotificationLog.create({
        data: {
          workspaceId: cert.workspaceId,
          kind: "CERT_EXPIRY",
          resourceId,
          channel: "email",
          metaJson: JSON.stringify({
            emailed: result.ok,
            skipped: "skipped" in result ? result.skipped : false,
            recipients: recipients.length,
            emailReady,
          }),
        },
      });
      if (result.ok) certEmailed += 1;
      else certSkipped += 1;
    } else {
      errors.push(`cert ${cert.id}: ${result.error}`);
    }
  }

  const subs = await db.subscription.findMany({
    where: {
      status: { in: ["ACTIVE", "PAST_DUE", "TRIALING"] },
      currentPeriodEnd: { lte: in30 },
    },
    include: {
      user: { select: { email: true, name: true, active: true } },
      plan: { select: { name: true } },
    },
    take: 100,
    orderBy: { currentPeriodEnd: "asc" },
  });

  for (const sub of subs) {
    subScanned += 1;
    const resourceId = `${sub.id}:${sub.currentPeriodEnd.toISOString().slice(0, 10)}`;
    const workspaceId =
      (await db.workspaceMember.findFirst({
        where: { userId: sub.userId, role: "OWNER" },
        select: { workspaceId: true },
      }))?.workspaceId ?? sub.userId;

    const already = await db.expiryNotificationLog.findUnique({
      where: {
        workspaceId_kind_resourceId_channel: {
          workspaceId,
          kind: "SUBSCRIPTION_EXPIRY",
          resourceId,
          channel: "email",
        },
      },
    });
    if (already) {
      subSkipped += 1;
      continue;
    }

    if (!sub.user.active || !sub.user.email) {
      subSkipped += 1;
      continue;
    }

    const days = Math.ceil(
      (sub.currentPeriodEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
    );
    const planName = sub.plan?.name ?? "plan";
    const subject =
      days < 0
        ? `[ArabClue] Subscription expired: ${planName}`
        : `[ArabClue] Subscription renews/expires in ${days}d: ${planName}`;
    const html = `<p>Hello ${escapeHtml(sub.user.name)},</p>
<p>Your <strong>${escapeHtml(planName)}</strong> subscription
${days < 0 ? "ended" : `ends`} on
<strong>${sub.currentPeriodEnd.toISOString().slice(0, 10)}</strong>
(status: ${escapeHtml(sub.status)}).</p>
<p>Review billing in the ArabClue app to avoid interruption.</p>
<p>— ArabClue</p>`;

    const result = await sendEmail({
      to: sub.user.email,
      subject,
      html,
    });
    if (result.ok || result.skipped) {
      await db.expiryNotificationLog.create({
        data: {
          workspaceId,
          kind: "SUBSCRIPTION_EXPIRY",
          resourceId,
          channel: "email",
          metaJson: JSON.stringify({
            emailed: result.ok,
            skipped: "skipped" in result ? result.skipped : false,
            emailReady,
          }),
        },
      });
      if (result.ok) subEmailed += 1;
      else subSkipped += 1;
    } else {
      errors.push(`sub ${sub.id}: ${result.error}`);
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    emailConfigured: emailReady,
    certificates: {
      scanned: certScanned,
      emailed: certEmailed,
      skipped: certSkipped,
    },
    subscriptions: {
      scanned: subScanned,
      emailed: subEmailed,
      skipped: subSkipped,
    },
    errors,
    time: new Date().toISOString(),
  });
}

export async function GET(req: NextRequest) {
  return POST(req);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
