import type { Page } from "@playwright/test";

/**
 * Fetch JSON through the page so Playwright route mocks on the browser
 * context apply (page.request can bypass them depending on version).
 */
export async function pageFetchJson(
  page: Page,
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<{
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  json: unknown;
}> {
  if (!page.url().startsWith("http")) {
    await page.goto("/login", { waitUntil: "domcontentloaded" });
  }
  return page.evaluate(
    async ({ path: p, method, body }) => {
      const res = await fetch(p, {
        method: method || "GET",
        headers: body
          ? { "content-type": "application/json" }
          : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const headers: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        headers[key] = value;
      });
      const json = await res.json().catch(() => null);
      return { status: res.status, ok: res.ok, headers, json };
    },
    {
      path,
      method: init?.method,
      body: init?.body,
    },
  );
}
