/**
 * The site's own Content-Security-Policy was switching the voice feature off.
 *
 * `POST /api/platform-agent/realtime/setup` mints a session and hands the
 * browser `wss://api.openai.com/v1/realtime?...`; the page's CSP said
 * `connect-src 'self'`. Playwright against production, 2026-09-02, clicking
 * the real Live connect control: "Connecting to 'wss://api.openai.com/…'
 * violates the following Content Security Policy directive: connect-src
 * 'self'" followed by `[live-voice] Error: WebSocket connection error`. The
 * AI SDK's realtime hook also fetches `https://api.openai.com/v1/realtime/calls`
 * for the WebRTC offer, blocked the same way.
 *
 * The two first-party voice origins the server can mint for (OpenAI and
 * Google, see realtime.ts) are allowed in both schemes. A custom voice base
 * configured by an admin still needs its origin added here; the policy is
 * static per build and cannot follow a database row.
 */

import { describe, expect, test } from "bun:test";
import nextConfig from "../../../next.config";

async function connectSrc(): Promise<string> {
  const headers = await nextConfig.headers!();
  const csp = headers
    .flatMap((h) => h.headers)
    .find((h) => h.key.toLowerCase() === "content-security-policy");
  expect(csp).toBeDefined();
  const directive = csp!.value
    .split(";")
    .map((d) => d.trim())
    .find((d) => d.startsWith("connect-src"));
  expect(directive).toBeDefined();
  return directive!;
}

describe("connect-src admits the voice providers", () => {
  test("OpenAI realtime, socket and WebRTC offer", async () => {
    const d = await connectSrc();
    expect(d).toContain("wss://api.openai.com");
    expect(d).toContain("https://api.openai.com");
  });

  test("Google live, socket and REST", async () => {
    const d = await connectSrc();
    expect(d).toContain("wss://generativelanguage.googleapis.com");
    expect(d).toContain("https://generativelanguage.googleapis.com");
  });

  test("and nothing broader — no wildcard schemes", async () => {
    const d = await connectSrc();
    expect(d).toContain("'self'");
    expect(/\bwss:\s|\bhttps:\s|\*/.test(d)).toBe(false);
  });
});
