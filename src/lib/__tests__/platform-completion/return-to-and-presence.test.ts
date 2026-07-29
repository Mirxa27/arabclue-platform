/**
 * History/routing + presence slices for tasks 9.7 and 8.7.
 */

import { describe, expect, test } from "bun:test";
import {
  PRESENCE_STALE_THRESHOLD_MS,
  PRESENCE_VIEWER_CAP,
  capPresenceViewers,
  pruneStalePresenceRows,
  stablePresenceSnapshotHash,
} from "../../collaboration-presence";
import {
  RETURN_TO_MAX_AGE_SECONDS,
  isRetainableAppPath,
  signReturnTo,
  verifyReturnTo,
} from "../../return-to";

describe("return-to deep-link retention (task 9.7)", () => {
  test("accepts same-origin app paths and rejects unsafe values", () => {
    expect(isRetainableAppPath("/app")).toBe(true);
    expect(isRetainableAppPath("/app/projects/abc123/proposals")).toBe(true);
    expect(isRetainableAppPath("https://evil.example/app")).toBe(false);
    expect(isRetainableAppPath("//evil.example")).toBe(false);
    expect(isRetainableAppPath("/app/../etc/passwd")).toBe(false);
    expect(isRetainableAppPath("/login")).toBe(false);
  });

  test("signed cookie round-trips within retention and rejects expiry/tamper", async () => {
    const previous = process.env.NEXTAUTH_SECRET;
    process.env.NEXTAUTH_SECRET = "test-return-to-secret-value-32chars!";
    try {
      const now = Date.UTC(2026, 6, 29, 0, 0, 0);
      const path = "/app/projects/proj_1/documents";
      const signed = await signReturnTo(path, now);
      expect(signed).toBeTruthy();
      expect(await verifyReturnTo(signed, now + 1_000)).toBe(path);
      expect(
        await verifyReturnTo(
          signed,
          now + (RETURN_TO_MAX_AGE_SECONDS + 1) * 1000
        )
      ).toBeNull();
      expect(await verifyReturnTo(`${signed}x`, now + 1_000)).toBeNull();
      expect(await verifyReturnTo(undefined, now)).toBeNull();
      expect(await signReturnTo("https://evil.example", now)).toBeNull();
    } finally {
      if (previous === undefined) delete process.env.NEXTAUTH_SECRET;
      else process.env.NEXTAUTH_SECRET = previous;
    }
  });
});

describe("durable presence pruning and caps (task 8.7)", () => {
  test("prunes rows older than 60s and caps distinct viewers at 50 with total", () => {
    const now = 1_000_000;
    const rows = Array.from({ length: 60 }, (_, i) => ({
      userId: `user-${i}`,
      lastSeenAt: now - (i < 55 ? i * 100 : 70_000),
    }));
    const live = pruneStalePresenceRows(rows, now);
    expect(
      live.every((r) => now - r.lastSeenAt <= PRESENCE_STALE_THRESHOLD_MS)
    ).toBe(true);
    expect(live.length).toBe(55);

    const capped = capPresenceViewers(live);
    expect(capped.viewers).toHaveLength(PRESENCE_VIEWER_CAP);
    expect(capped.total).toBe(55);
  });

  test("stable hash changes only when the viewer set changes", () => {
    const a = [
      { userId: "u1", lastSeenAt: 10 },
      { userId: "u2", lastSeenAt: 20 },
    ];
    expect(stablePresenceSnapshotHash(a)).toBe(
      stablePresenceSnapshotHash([...a])
    );
    expect(stablePresenceSnapshotHash(a)).not.toBe(
      stablePresenceSnapshotHash([...a, { userId: "u3", lastSeenAt: 30 }])
    );
  });
});
