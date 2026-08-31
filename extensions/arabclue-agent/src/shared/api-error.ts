/**
 * Reader for the platform's bilingual failure bodies.
 *
 * A failed ArabClue API call answers `{ ok: false, code, message: { ar, en } }`
 * and repeats the same pair under `error`, so `String(data.error)` renders
 * "[object Object]" to the user. This picks the reader's language, falls back
 * to the other one, and only then to the caller's text.
 */
export function apiErrorText(
  data: unknown,
  locale: "ar" | "en",
  fallback: string
): string {
  const body = (data ?? {}) as { message?: unknown; error?: unknown };

  for (const candidate of [body.message, body.error]) {
    if (typeof candidate === "string" && candidate.trim()) return candidate;
    if (!candidate || typeof candidate !== "object") continue;
    const pair = candidate as { ar?: unknown; en?: unknown };
    const preferred = locale === "en" ? pair.en : pair.ar;
    if (typeof preferred === "string" && preferred.trim()) return preferred;
    const other = locale === "en" ? pair.ar : pair.en;
    if (typeof other === "string" && other.trim()) return other;
  }

  return fallback;
}
