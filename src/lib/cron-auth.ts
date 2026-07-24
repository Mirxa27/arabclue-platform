import { NextRequest, NextResponse } from "next/server";

/**
 * Authorize Vercel Cron / manual cron triggers via CRON_SECRET.
 * Accepts Authorization: Bearer <secret> or x-cron-secret header.
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
  const querySecret = req.nextUrl.searchParams.get("secret")?.trim() ?? "";

  if (bearer === secret || headerSecret === secret || querySecret === secret) {
    return null;
  }

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
