/**
 * Isomorphic shape of a failed API response (design section 3.2).
 *
 * This module is intentionally dependency-free so client components can read a
 * failure body without pulling `next/server`, Prisma, or the localization
 * registry into the browser bundle. The server-side builder lives in
 * `api-failure.ts`.
 */

import type { Locale } from "./types";

export type BilingualMessage = Readonly<{ ar: string; en: string }>;

/**
 * Authoritative failure contract. `code` and `message.ar/en` are the stable
 * surface; `error` is a compatibility alias carrying the same bilingual pair.
 */
export type ApiFailure = Readonly<{
  ok: false;
  code: string;
  message: BilingualMessage;
  /** Compatibility alias for existing clients; identical to `message`. */
  error: BilingualMessage;
  /** Offending field paths for a validation failure. */
  fieldPaths?: readonly string[];
  /** Seconds a rate-limited or unavailable caller should wait. */
  retryAfterSeconds?: number;
  /** Relation reported missing by a pending schema migration. */
  missingTable?: string;
  /** Migration identifier that creates `missingTable`, when known. */
  migration?: string;
  /** Capability names blocked while that migration is unapplied. */
  capabilities?: readonly string[];
}>;

function isBilingualMessage(value: unknown): value is BilingualMessage {
  if (!value || typeof value !== "object") return false;
  const record = value as { ar?: unknown; en?: unknown };
  return typeof record.ar === "string" && typeof record.en === "string";
}

/** Narrows an arbitrary parsed response body to the failure contract. */
export function isApiFailure(value: unknown): value is ApiFailure {
  if (!value || typeof value !== "object") return false;
  const record = value as { ok?: unknown; code?: unknown; message?: unknown };
  return (
    record.ok === false &&
    typeof record.code === "string" &&
    isBilingualMessage(record.message)
  );
}

/**
 * Locale-appropriate text for any failure body, including the legacy shapes
 * (`error` as a bilingual object or a plain string). Returns `null` when the
 * body carries no readable message so the caller can fall back to its own
 * registry text rather than rendering an object.
 */
export function selectApiFailureMessage(
  body: unknown,
  locale: Locale
): string | null {
  if (!body || typeof body !== "object") return null;
  const record = body as {
    message?: unknown;
    error?: unknown;
  };

  for (const candidate of [record.message, record.error]) {
    if (isBilingualMessage(candidate)) {
      const preferred = candidate[locale]?.trim();
      if (preferred) return preferred;
      const other = candidate[locale === "ar" ? "en" : "ar"]?.trim();
      if (other) return other;
    }
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
}

/** Stable code of a failure body, or `null` when the body carries none. */
export function selectApiFailureCode(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const code = (body as { code?: unknown }).code;
  return typeof code === "string" && code.trim() ? code : null;
}
