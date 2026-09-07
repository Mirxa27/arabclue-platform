import { NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron-auth";
import { runDatabaseBackup } from "@/lib/database-backup";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/cron/database-backup
 * Daily off-platform logical dump of every table to Vercel Blob, pruned to
 * BACKUP_RETENTION_DAYS. Exists because the database provider's own history
 * window is hours, not days (see src/lib/database-backup.ts).
 */
export async function POST(req: NextRequest) {
  const denied = authorizeCron(req);
  if (denied) return denied;

  try {
    const summary = await runDatabaseBackup();
    return NextResponse.json({ ok: true, ...summary, time: new Date().toISOString() });
  } catch (err) {
    console.error("[cron/database-backup]", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.name : "database_backup_failed" },
      { status: 500 },
    );
  }
}

/** GET allowed for Vercel Cron (uses Authorization header). */
export async function GET(req: NextRequest) {
  return POST(req);
}
