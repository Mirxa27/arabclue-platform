import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

/**
 * Constant-time comparison of two secrets.
 *
 * `timingSafeEqual` throws on a length mismatch, which would itself leak the
 * secret's length, so both sides are hashed to a fixed width first via an
 * equal-length padding scheme: compare byte buffers of the max length, with the
 * length difference folded into the result.
 */
function secretsMatch(candidate: string, expected: string): boolean {
  const a = Buffer.from(candidate, "utf8");
  const b = Buffer.from(expected, "utf8");
  const width = Math.max(a.length, b.length, 1);
  const padded = (buf: Buffer) => {
    const out = Buffer.alloc(width);
    buf.copy(out);
    return out;
  };
  // The length check is folded in after the fixed-width compare so a wrong
  // length costs the same as a wrong value.
  const equalBytes = timingSafeEqual(padded(a), padded(b));
  return equalBytes && a.length === b.length;
}

/**
 * Authorize Vercel Cron / manual cron triggers via CRON_SECRET.
 *
 * Accepts `Authorization: Bearer <secret>` or `x-cron-secret`.
 *
 * The query-string form (`?secret=`) is deliberately NOT accepted. A URL is
 * written to server logs, proxy logs, browser history and `Referer` headers, so
 * a cron secret placed there leaks by design — and every cron route exports
 * GET, which made the whole cron plane firable by anyone who saw one such URL.
 * Vercel Cron sends the Authorization header, so nothing legitimate depended on
 * the query form.
 */
export function authorizeCron(req: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || secret.length < 16) {
    return NextResponse.json(
      {
        error: "CRON_SECRET not configured (min 16 chars)",
        code: "CRON_NOT_CONFIGURED",
      },
      { status: 503 }
    );
  }

  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : "";
  const headerSecret = req.headers.get("x-cron-secret")?.trim() ?? "";

  // Both candidates are always compared so the number of comparisons does not
  // depend on which header was supplied.
  const bearerOk = bearer.length > 0 && secretsMatch(bearer, secret);
  const headerOk = headerSecret.length > 0 && secretsMatch(headerSecret, secret);

  if (bearerOk || headerOk) return null;

  if (req.nextUrl.searchParams.has("secret")) {
    console.warn(
      "[cron-auth] rejected a request carrying ?secret= — send the cron secret in the Authorization header; a secret in a URL is logged"
    );
  }

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
