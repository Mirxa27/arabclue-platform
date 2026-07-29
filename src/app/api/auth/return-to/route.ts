import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  RETURN_TO_COOKIE,
  verifyReturnTo,
} from "@/lib/return-to";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/return-to — recover the signed deep-link cookie (Requirement 14.10).
 * Clears the cookie after a successful read so it cannot be replayed.
 */
export async function GET() {
  const jar = await cookies();
  const raw = jar.get(RETURN_TO_COOKIE)?.value;
  const path = await verifyReturnTo(raw);

  const response = NextResponse.json({
    ok: true,
    path,
  });

  if (raw) {
    response.cookies.set(RETURN_TO_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
  }

  return response;
}
