import { NextRequest, NextResponse } from "next/server";
import { jsonApiFailure, jsonOk, withPublicRoute } from "@/lib/api-controller";
import { createPrismaAccountService } from "@/lib/account-service-prisma";
import type { AccountService } from "@/lib/account-service";
import { tr } from "@/lib/i18n";
import { extractClientIp } from "@/lib/login-rate-limit";

export const dynamic = "force-dynamic";

/**
 * Public account route — reissuing a verification email.
 *
 * Without it a failed send or a lapsed 24-hour token locks the account out
 * permanently: every gated route refuses an unverified session and registration
 * was the only issuance point. The route stays a thin boundary — normalization,
 * the dual rate limit, token replacement and delivery live in the domain
 * service, so an accepted and an unknown address are indistinguishable here.
 */
export type ResendVerificationRouteDependencies = Readonly<{
  /** The Account_Service; the production service is used when omitted. */
  service: AccountService;
}>;

export async function handleResendVerification(
  req: NextRequest,
  dependencies?: Partial<ResendVerificationRouteDependencies>
): Promise<NextResponse> {
  const service = dependencies?.service ?? createPrismaAccountService();
  return withPublicRoute("auth/resend-verification", async () => {
    const body = await readJsonBodyOrNull(req);
    const result = await service.resendVerificationEmail({
      email: readEmailField(body),
      sourceAddress: extractClientIp(req.headers),
    });

    if (!result.ok) {
      return jsonApiFailure(result.code, {
        ...(result.code === "VERIFICATION_RESEND_RATE_LIMITED"
          ? { retryAfterSeconds: result.retryAfterSeconds }
          : {}),
      });
    }

    // The message names the delivery outcome, not the account: an unconfigured
    // transport or a refused send is a dead end the reader must be told about
    // ("check your inbox" for a message nothing sent is a permanent lockout).
    const messageKey = resendMessageKey(result.emailDelivery);
    return jsonOk(
      {
        ok: true as const,
        code: result.code,
        emailDelivery: result.emailDelivery,
        message: { ar: tr(messageKey, "ar"), en: tr(messageKey, "en") },
      },
      { status: result.status }
    );
  });
}

function resendMessageKey(delivery: "SENT" | "UNCONFIGURED" | "FAILED"): string {
  switch (delivery) {
    case "UNCONFIGURED":
      return "auth_resend_undeliverable_unconfigured";
    case "FAILED":
      return "auth_resend_undeliverable_failed";
    default:
      return "VERIFICATION_EMAIL_RESEND_ACCEPTED";
  }
}

export async function POST(req: NextRequest) {
  return handleResendVerification(req);
}


/** Unreadable bodies stay `null`; the domain service rejects them. */
async function readJsonBodyOrNull(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

/** Reads `email` without asserting a shape the domain service re-validates. */
function readEmailField(body: unknown): unknown {
  if (typeof body !== "object" || body === null) return null;
  return (body as { email?: unknown }).email;
}
