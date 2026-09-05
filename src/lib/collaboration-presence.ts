/**
 * Pure presence helpers shared by the collaboration presence route and tests
 * (task 8.6 / 8.7). Persistence remains in Prisma; this module owns the
 * deterministic prune/cap/hash rules only.
 */

import { z } from "zod";

export const PRESENCE_STALE_THRESHOLD_MS = 60_000;
export const PRESENCE_VIEWER_CAP = 50;

/** Longest section key a presence row may carry (stored verbatim, echoed to peers). */
export const PRESENCE_SECTION_KEY_MAX_LENGTH = 120;

/**
 * Body of a presence POST. `sectionKey` is tri-state: absent leaves the stored
 * section untouched, `null` clears it, a string replaces it. Unknown keys are
 * rejected so a client cannot smuggle `workspaceId` or `userId` past the route.
 */
export const presenceEventSchema = z
  .object({
    proposalId: z.string().trim().min(1).max(64),
    type: z.enum(["join", "heartbeat", "leave"]),
    sectionKey: z.string().max(PRESENCE_SECTION_KEY_MAX_LENGTH).nullable().optional(),
  })
  .strict();

export type PresenceEvent = z.infer<typeof presenceEventSchema>;

export type PresenceRowLike = Readonly<{
  userId: string;
  lastSeenAt: number | Date | string;
}>;

function toMillis(value: number | Date | string): number {
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function pruneStalePresenceRows<T extends PresenceRowLike>(
  rows: readonly T[],
  now: number = Date.now(),
  thresholdMs: number = PRESENCE_STALE_THRESHOLD_MS
): T[] {
  return rows.filter((row) => now - toMillis(row.lastSeenAt) <= thresholdMs);
}

export function capPresenceViewers<T extends PresenceRowLike>(
  rows: readonly T[],
  cap: number = PRESENCE_VIEWER_CAP
): { readonly viewers: T[]; readonly total: number } {
  const ordered = [...rows].sort(
    (a, b) => toMillis(b.lastSeenAt) - toMillis(a.lastSeenAt)
  );
  return {
    viewers: ordered.slice(0, cap),
    total: ordered.length,
  };
}

export function stablePresenceSnapshotHash(
  rows: readonly PresenceRowLike[]
): string {
  return rows
    .map((row) => `${row.userId}:${toMillis(row.lastSeenAt)}`)
    .sort()
    .join("|");
}
