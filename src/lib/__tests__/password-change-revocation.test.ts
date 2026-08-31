/**
 * A password change must invalidate everything else that still grants access.
 *
 * `POST /api/auth/password` rewrote `passwordHash` and stopped there
 * (route.ts:53-57). Two things survived the change:
 *
 *   1. Every other signed-in session. A user changes their password *because*
 *      they think someone else has it; the attacker's tab keeps working until
 *      the 12h JWT lapses. The revocation is real when it happens — the jwt
 *      callback re-reads the UserSession row on every refresh and blanks
 *      `token.id` when it is gone (auth.ts:313-321) — this route just never
 *      deleted anything.
 *
 *   2. Any reset link already in flight. Someone with a ≤60-minute link from
 *      the attacker-triggered "forgot password" mail can still redeem it, and
 *      redeeming *does* revoke sessions, so the attacker ends up holding the
 *      only live session.
 *
 * The dedicated reset path already gets this right and does both in one
 * transaction (recovery-service-prisma.ts:197-203). This is the same invariant
 * reached through a different door.
 *
 * These are source assertions, not a live flow: the invariant is three inline
 * Prisma calls with no seam to inject, and inventing a repository interface to
 * make it mockable would be more code than the fix. Runtime proof belongs to
 * driving the deployed route, not to this file.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const changeRoute = read("src/app/api/auth/password/route.ts");
const resetAdapter = read("src/lib/recovery-service-prisma.ts");
const authLib = read("src/lib/auth.ts");

describe("changing a password revokes what the old one unlocked", () => {
  test("deleting a UserSession row really does end that session", () => {
    // Anti-vacuous: if nothing read this table per-request, every assertion
    // below would be checking a write that changes no one's access.
    expect(authLib).toContain("db.userSession.findUnique");
    expect(authLib).toContain('token.id = "";');
  });

  test("the reset path already enforces this invariant", () => {
    // Anti-vacuous the other way: this is established policy in this codebase,
    // not a rule invented for one route.
    expect(resetAdapter).toContain("tx.userSession.deleteMany");
    expect(resetAdapter).toContain("consumedAt");
  });

  test("the change route revokes the other sessions", () => {
    expect(changeRoute).toContain("userSession.deleteMany");
  });

  test("the change route keeps the caller signed in", () => {
    // Revoking the tab that just succeeded would 401 the user on their next
    // click. `session.sessionToken` is populated at auth.ts:378 for exactly
    // this kind of exclusion.
    expect(authLib).toContain("session.sessionToken = token.sessionToken");
    expect(changeRoute).toContain("session.sessionToken");
    expect(changeRoute).toContain("NOT:");
  });

  test("the change route consumes outstanding reset tokens", () => {
    expect(changeRoute).toContain("recoveryToken.updateMany");
    expect(changeRoute).toContain("consumedAt: null");
  });

  test("the hash and the revocations commit together", () => {
    // A crash between them leaves the new password live and the old sessions
    // alive — the exact state the change was meant to prevent.
    expect(changeRoute).toContain("db.$transaction");
  });
});
