/**
 * Security contract: `fetchUrlAsAttachment` must re-check every hop of a
 * redirect chain, not just the URL the caller typed.
 *
 * Historical hole: `assertSafeExternalUrl` validated the first URL and the
 * fetch then ran with `redirect: "follow"`. An attacker-controlled public host
 * answering `302 Location: http://169.254.169.254/latest/meta-data/` moved the
 * request onto the cloud metadata endpoint, and the response body comes back to
 * the caller as `textPreview`. Reachable by any authenticated user through
 * POST /api/platform-agent/missions/[id]/attachments, and by the agent itself
 * through the `attachUrl` tool.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";

const fetchCalls: string[] = [];
const originalFetch = globalThis.fetch;

/** URL -> the response the fake origin serves for it. */
const routes = new Map<string, () => Response>();

let fetchUrlAsAttachment: typeof import("@/lib/agents/platform/connectors").fetchUrlAsAttachment;

function redirectTo(location: string, status = 302): () => Response {
  return () => new Response(null, { status, headers: { location } });
}

function textBody(body: string): () => Response {
  return () =>
    new Response(body, {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
}

beforeAll(async () => {
  globalThis.fetch = mock(async (input: RequestInfo | URL) => {
    const url = String(input);
    fetchCalls.push(url);
    const handler = routes.get(url);
    if (!handler) throw new Error(`unexpected fetch: ${url}`);
    return handler();
  }) as unknown as typeof fetch;

  ({ fetchUrlAsAttachment } = await import("@/lib/agents/platform/connectors"));
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

beforeEach(() => {
  fetchCalls.length = 0;
  routes.clear();
});

describe("fetchUrlAsAttachment redirect enforcement", () => {
  test("refuses a public URL that redirects to cloud metadata", async () => {
    routes.set(
      "https://attacker.example/tender.pdf",
      redirectTo("http://169.254.169.254/latest/meta-data/iam/security-credentials/")
    );

    await expect(
      fetchUrlAsAttachment("https://attacker.example/tender.pdf")
    ).rejects.toThrow(/private|blocked|not allowed/i);

    // The first hop is legitimately dispatched; the metadata hop must not be.
    expect(fetchCalls).toEqual(["https://attacker.example/tender.pdf"]);
  });

  test("refuses a redirect to loopback via an IPv4-mapped IPv6 literal", async () => {
    routes.set(
      "https://attacker.example/a.pdf",
      redirectTo("http://[::ffff:127.0.0.1]:6379/")
    );

    await expect(
      fetchUrlAsAttachment("https://attacker.example/a.pdf")
    ).rejects.toThrow(/private|blocked|not allowed/i);

    expect(fetchCalls).toEqual(["https://attacker.example/a.pdf"]);
  });

  test("refuses a relative redirect that resolves onto a private host", async () => {
    // A Location header may be relative; it must be resolved before checking.
    routes.set("https://attacker.example/b.pdf", redirectTo("//169.254.169.254/x"));

    await expect(
      fetchUrlAsAttachment("https://attacker.example/b.pdf")
    ).rejects.toThrow(/private|blocked|not allowed/i);

    expect(fetchCalls).toEqual(["https://attacker.example/b.pdf"]);
  });

  test("caps an endless redirect loop instead of hanging", async () => {
    for (let i = 0; i < 12; i += 1) {
      routes.set(
        `https://public.example/hop${i}`,
        redirectTo(`https://public.example/hop${i + 1}`)
      );
    }

    await expect(
      fetchUrlAsAttachment("https://public.example/hop0")
    ).rejects.toThrow(/redirect/i);

    expect(fetchCalls.length).toBeLessThanOrEqual(6);
  });

  test("still follows a public redirect and returns the body", async () => {
    routes.set("https://public.example/doc", redirectTo("https://cdn.example/doc.txt"));
    routes.set("https://cdn.example/doc.txt", textBody("كراسة الشروط"));

    const result = await fetchUrlAsAttachment("https://public.example/doc");

    expect(result.textPreview).toBe("كراسة الشروط");
    expect(result.mimeType).toBe("text/plain");
    expect(result.originalName).toBe("doc.txt");
    expect(fetchCalls).toEqual([
      "https://public.example/doc",
      "https://cdn.example/doc.txt",
    ]);
  });

  test("fetches a direct public URL unchanged", async () => {
    routes.set("https://public.example/tender.txt", textBody("scope of work"));

    const result = await fetchUrlAsAttachment("https://public.example/tender.txt");

    expect(result.textPreview).toBe("scope of work");
    expect(fetchCalls).toEqual(["https://public.example/tender.txt"]);
  });
});
