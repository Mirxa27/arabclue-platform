import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Root API — redirect clients to health */
export async function GET() {
  return NextResponse.json({
    service: "arabclue",
    health: "/api/health",
    docs: "See README.md",
  });
}
