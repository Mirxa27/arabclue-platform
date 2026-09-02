/**
 * Guard tests for the response security headers.
 *
 * The application renders user-authored markdown and stored contract HTML, so
 * a Content-Security-Policy is meaningful defence in depth behind output
 * escaping. It was absent entirely.
 */
import { describe, expect, test } from "bun:test";
// The default export is the Workflow DevKit wrapper (an async config function);
// the plain object the tests read is the named export.
import { nextConfig } from "../../../next.config";

async function headerMap(source: string) {
  const groups = await nextConfig.headers!();
  const group = groups.find((g) => g.source === source);
  if (!group) throw new Error(`no header group for ${source}`);
  return new Map(group.headers.map((h) => [h.key, h.value]));
}

describe("global security headers", () => {
  test("a Content-Security-Policy is present", async () => {
    const headers = await headerMap("/(.*)");
    expect(headers.get("Content-Security-Policy")).toBeTruthy();
  });

  test.each([
    ["default-src 'self'", "restricts the default fetch origin"],
    ["base-uri 'self'", "blocks <base> hijacking of relative URLs"],
    ["object-src 'none'", "removes the plugin injection sink"],
    ["frame-ancestors 'self'", "blocks cross-origin framing"],
    ["form-action 'self'", "blocks form exfiltration to a foreign origin"],
  ])("the policy declares %s — %s", async (directive) => {
    const headers = await headerMap("/(.*)");
    expect(headers.get("Content-Security-Policy")).toContain(directive);
  });

  test("images allow data: and blob: for inlined brand logos and previews", async () => {
    const headers = await headerMap("/(.*)");
    expect(headers.get("Content-Security-Policy")).toContain(
      "img-src 'self' data: blob:"
    );
  });

  test("the existing hardening headers are retained", async () => {
    const headers = await headerMap("/(.*)");
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
    expect(headers.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin"
    );
    expect(headers.get("Permissions-Policy")).toContain("geolocation=()");
  });

  test("frame-ancestors agrees with X-Frame-Options", async () => {
    // Same-origin framing is required: in-app PDF and HTML previews iframe
    // /api/files and the proposal download routes.
    const headers = await headerMap("/(.*)");
    expect(headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
    expect(headers.get("Content-Security-Policy")).toContain(
      "frame-ancestors 'self'"
    );
  });
});
