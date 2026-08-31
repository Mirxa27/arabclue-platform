/**
 * Client-side fetch helpers shared by dashboard components.
 *
 * `readApiError` replaces the fragile `(await res.json()).error` pattern that
 * throws twice over: when the body is not JSON (proxy 502 HTML) the parse
 * error replaced the real cause, and when JSON lacked `error` the toast
 * showed the literal string "undefined".
 */
export async function readApiError(
  res: Response,
  fallback: string
): Promise<string> {
  try {
    const data = (await res.json()) as { error?: unknown } | null;
    if (data && typeof data.error === "string" && data.error.trim()) {
      return data.error;
    }
  } catch {
    /* non-JSON body — fall through to fallback */
  }
  return fallback;
}
