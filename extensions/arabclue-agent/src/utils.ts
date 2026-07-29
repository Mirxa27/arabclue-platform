/** Shared utilities for ArabClue Etimad Agent */

import { DEFAULT_SETTINGS } from "./constants";

/**
 * Normalize user-entered API base to origin only.
 * Strips /app paths and trailing slashes.
 */
export function normalizeApiBase(raw: string | null | undefined): string {
  const fallback = DEFAULT_SETTINGS.apiBase;
  if (!raw || typeof raw !== "string") return fallback;
  let value = raw.trim().replace(/\/+$/, "");
  if (!value) return fallback;
  try {
    if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
    const u = new URL(value);
    return u.origin;
  } catch {
    return fallback;
  }
}

/** Generate a URL-safe slug from text */
export function slug(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9\u0600-\u06FF]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "capture"
  );
}

/** Parse SAR value strings like "1,500,000" or "١٥٠٠٠٠٠" to number */
export function parseSARValue(raw: string): number | undefined {
  if (!raw) return undefined;
  // Convert Arabic-Indic numerals to Western
  const western = raw.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  const cleaned = western.replace(/[^0-9.]/g, "");
  const value = parseFloat(cleaned);
  return isNaN(value) ? undefined : value;
}

/** Convert Hijri-like or Arabic date strings to ISO (best effort) */
export function parseArabicDate(raw: string): string {
  if (!raw) return "";
  // Try ISO format first
  const isoMatch = raw.match(/\d{4}-\d{2}-\d{2}/);
  if (isoMatch) return isoMatch[0];
  
  // Try dd/mm/yyyy pattern
  const slashMatch = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slashMatch) {
    const [, day, month, year] = slashMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  
  // Try Arabic numerals dd/mm/yyyy
  const arabicNums = raw.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  const arabicSlash = arabicNums.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (arabicSlash) {
    const [, day, month, year] = arabicSlash;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  
  // Return raw if unparseable — caller should handle
  return raw;
}

/** Days between now and a future ISO date */
export function daysUntil(isoDate: string): number {
  try {
    const target = new Date(isoDate).getTime();
    const now = Date.now();
    return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
  } catch {
    return -1;
  }
}

/** Format date for display based on locale */
export function formatDate(isoDate: string, locale: "ar" | "en"): string {
  try {
    const date = new Date(isoDate);
    return date.toLocaleDateString(locale === "ar" ? "ar-SA" : "en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return isoDate;
  }
}

/** Format SAR value with thousand separators */
export function formatSAR(value: number, locale: "ar" | "en"): string {
  const formatted = value.toLocaleString(locale === "ar" ? "ar-SA" : "en-US");
  return locale === "ar" ? `${formatted} ريال` : `SAR ${formatted}`;
}

/** Simple content hash for deduplication */
export function contentHash(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const chr = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

/** Secure random UUID */
export function uuid(): string {
  return crypto.randomUUID();
}

/** Escape HTML for safe sidepanel rendering of page/user data */
export function escapeHtml(raw: string | null | undefined): string {
  if (!raw) return "";
  return String(raw)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Convert a data URL or raw base64 into a Blob */
export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  if (dataUrl.startsWith("data:")) {
    const res = await fetch(dataUrl);
    return res.blob();
  }
  const binary = atob(dataUrl);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes]);
}
