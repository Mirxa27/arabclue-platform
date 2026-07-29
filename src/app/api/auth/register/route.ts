import { NextRequest, NextResponse } from "next/server";
import { jsonApiFailure, jsonOk, withPublicRoute } from "@/lib/api-controller";
import { createPrismaAccountService } from "@/lib/account-service-prisma";
import type { AccountService, RegistrationSuccess } from "@/lib/account-service";
import { tr } from "@/lib/i18n";

export const dynamic = "force-dynamic";

/**
 * Public account route — self-serve registration (requirements 1.1–1.4, 1.8–1.13).
 *
 * The route is a thin boundary: it reads the source address, hands the raw
 * payload to the transactional Account_Service, and maps the typed domain
 * result to the shared bilingual response contract. All validation, ordering
 * (reserved-identity before uniqueness), rate limiting, the serializable
 * user/workspace/writer-membership/token transaction, and the bounded
 * post-commit email delivery live in the domain service, so this file carries
 * no user-facing literal, no raw token, and no duplicated persistence logic.
 */
export type RegisterRouteDependencies = Readonly<{
  /** The Account_Service; the production service is used when omitted. */
  service: AccountService;
}>;

export async function handleRegister(
  req: NextRequest,
  dependencies?: Partial<RegisterRouteDependencies>
): Promise<NextResponse> {
  const service = dependencies?.service ?? createPrismaAccountService();
  return withPublicRoute("auth/register", async () => {
    const payload = await readJsonBodyOrNull(req);
    const result = await service.register({
      payload,
      sourceAddress: getClientIp(req),
    });

    if (!result.ok) {
      // Every rejection carries a registered completion code; the mapper builds
      // both locales and derives the HTTP status (400/409/429).
      return jsonApiFailure(result.code, {
        ...(result.code === "REGISTRATION_INVALID"
          ? {
              fieldPaths: result.fieldPaths,
              values: { fieldPaths: result.fieldPaths.join(", ") },
            }
          : {}),
        ...(result.code === "REGISTRATION_RATE_LIMITED"
          ? { retryAfterSeconds: result.retryAfterSeconds }
          : {}),
      });
    }

    return registrationSuccessResponse(result);
  });
}

export async function POST(req: NextRequest) {
  return handleRegister(req);
}

/**
 * Bilingual success body for a committed registration (requirement 19.4: the
 * persisted state is read back and returned). The `account` snapshot carries no
 * raw token — only the token identifier and its timestamps.
 */
function registrationSuccessResponse(result: RegistrationSuccess) {
  // Trust the Account_Service snapshot — do not re-apply process.env skip policy
  // here (local .env SKIP_EMAIL_VERIFICATION must not rewrite injected-test results).
  const verificationRequired = !result.account.emailVerified;
  return jsonOk(
    {
      ok: true as const,
      code: result.code,
      message: { ar: tr(result.code, "ar"), en: tr(result.code, "en") },
      emailDelivery: verificationRequired ? result.emailDelivery : "SKIPPED",
      verificationRequired,
      account: result.account,
    },
    { status: result.status }
  );
}

/** Best-effort source address for the rolling per-address rate limit (1.8). */
function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip")?.trim() ?? "unknown";
}

/**
 * Reads the JSON body, returning null for an unreadable body. A null or
 * malformed payload is validated by the domain service, which answers
 * `REGISTRATION_INVALID` naming every required field (criterion 1.11).
 */
async function readJsonBodyOrNull(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}
