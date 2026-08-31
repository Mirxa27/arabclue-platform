/**
 * What an API call gets when the session is gone.
 *
 * `withAuth` redirects to `pages.signIn` whenever `authorized` returns false.
 * For a navigation that is exactly right. For a `fetch` it is not: the redirect
 * is followed, the sign-in page comes back as **200 text/html**, and the caller
 * sees `res.ok === true` with a body that is markup. Observed against
 * production before this fix:
 *
 *     POST /api/proposals/<id>/copilot   (no session)
 *     → FINAL_STATUS=200 CT=text/html REDIRECTS=1
 *     → <!DOCTYPE html><html lang="ar" ...
 *
 * So a session that lapsed mid-edit surfaced as "could not reach the server"
 * rather than "sign in again", and `await res.json()` threw a SyntaxError on
 * every caller that did not sniff the content type. Exactly one did —
 * `tender-insights-chart.tsx` carries three hand-rolled checks for it.
 *
 * The branch already exists twice in the proxy for the password-change and
 * unverified-email gates; this pins the third, and pins the thing that would
 * make it dangerous: catching a public route and 401ing a webhook or a health
 * check that is supposed to run without a session.
 */

import { describe, expect, test } from "bun:test";
import {
  PUBLIC_PATHS,
  bilingualFailureBody,
  isProtectedApiPath,
} from "../../proxy";
import { selectApiFailureMessage } from "../api-failure-message";

describe("which API paths answer in JSON instead of redirecting", () => {
  test("a signed-in-only API route is claimed", () => {
    expect(isProtectedApiPath("/api/proposals/abc123/copilot")).toBe(true);
    expect(isProtectedApiPath("/api/agents/run")).toBe(true);
    expect(isProtectedApiPath("/api/admin/security")).toBe(true);
  });

  test("every public API route is left alone", () => {
    // Derived from the real set, so adding a public route here cannot silently
    // start returning 401 to a caller that has no session by design.
    const publicApis = [...PUBLIC_PATHS].filter((p) => p.startsWith("/api/"));
    expect(publicApis.length).toBeGreaterThan(0);
    for (const path of publicApis) {
      expect(isProtectedApiPath(path)).toBe(false);
    }
  });

  test("the public prefix families are left alone too", () => {
    // These are matched by prefix rather than listed, so the set above misses
    // them: NextAuth's own endpoints and the CRON_SECRET routes.
    expect(isProtectedApiPath("/api/auth/session")).toBe(false);
    expect(isProtectedApiPath("/api/auth/callback/credentials")).toBe(false);
    expect(isProtectedApiPath("/api/cron/refresh-tenders")).toBe(false);
    expect(isProtectedApiPath("/api/platform-agent/extension/config")).toBe(
      false
    );
  });

  test("pages are not claimed — a visitor still gets the sign-in screen", () => {
    // The redirect is the right answer for a navigation. Only fetches change.
    expect(isProtectedApiPath("/app/documents")).toBe(false);
    expect(isProtectedApiPath("/login")).toBe(false);
    expect(isProtectedApiPath("/")).toBe(false);
    expect(isProtectedApiPath("/pricing")).toBe(false);
  });

  test("a path that merely mentions the prefix is not an API route", () => {
    expect(isProtectedApiPath("/docs/api/reference")).toBe(false);
    expect(isProtectedApiPath("/apish")).toBe(false);
  });
});

describe("the body a lapsed session receives", () => {
  test("decodes to a message that tells the reader what to do", () => {
    // A body the client cannot decode leaves an empty error string in the UI,
    // which is the same dead end this fix exists to remove.
    const body = bilingualFailureBody("UNAUTHORIZED");
    expect(body.code).toBe("UNAUTHORIZED");
    expect(selectApiFailureMessage(body, "en")).toBe(
      "Unable to access the resource: Sign in to continue"
    );
    expect(selectApiFailureMessage(body, "ar")).toBe(
      "تعذر الوصول إلى المورد: سجّل الدخول للمتابعة"
    );
  });
});
