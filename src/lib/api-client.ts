/**
 * Client-side fetch helpers shared by dashboard panels.
 */

import { selectApiFailureMessage } from "@/lib/api-failure-message";

export class ApiClientError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

function resolveClientLocale(): "ar" | "en" {
  if (typeof window === "undefined") return "en";
  try {
    const stored = window.localStorage.getItem("arabclue-locale");
    return stored === "en" ? "en" : "ar";
  } catch {
    return "ar";
  }
}

export async function apiJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(input, init);
  const body: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const locale = resolveClientLocale();
    const bilingual = selectApiFailureMessage(body, locale);
    const legacy =
      body &&
      typeof body === "object" &&
      "error" in body &&
      typeof (body as { error: unknown }).error === "string"
        ? (body as { error: string }).error
        : null;
    const code =
      body &&
      typeof body === "object" &&
      "code" in body &&
      typeof (body as { code: unknown }).code === "string"
        ? (body as { code: string }).code
        : undefined;
    throw new ApiClientError(
      bilingual ?? legacy ?? `Request failed (${res.status})`,
      res.status,
      code
    );
  }
  return body as T;
}
