import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** GET /api/health — liveness probe */
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "arabclue",
    time: new Date().toISOString(),
  });
}
