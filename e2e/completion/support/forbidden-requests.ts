import type { Page, Request } from "@playwright/test";
import { isProtectedDataApi } from "./config";

export type ForbiddenRequestTracker = {
  readonly forbidden: Request[];
  dispose: () => void;
  assertNone: (context?: string) => void;
};

/**
 * Records protected tenant data API calls during navigation. Public auth and
 * health probes are ignored.
 */
export function trackForbiddenDataRequests(page: Page): ForbiddenRequestTracker {
  const forbidden: Request[] = [];

  const onRequest = (request: Request) => {
    const url = request.url();
    if (request.method() === "GET" && isProtectedDataApi(url)) {
      forbidden.push(request);
    }
    if (
      request.method() !== "GET" &&
      isProtectedDataApi(url) &&
      !url.includes("/api/auth/")
    ) {
      forbidden.push(request);
    }
  };

  page.on("request", onRequest);

  return {
    forbidden,
    dispose: () => {
      page.off("request", onRequest);
    },
    assertNone: (context?: string) => {
      if (forbidden.length === 0) return;
      const sample = forbidden
        .slice(0, 5)
        .map((r) => `${r.method()} ${r.url()}`)
        .join("\n");
      const prefix = context ? `${context}: ` : "";
      throw new Error(
        `${prefix}protected data APIs must not be requested (${forbidden.length} call(s)):\n${sample}`,
      );
    },
  };
}
