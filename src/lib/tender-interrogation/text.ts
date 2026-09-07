/**
 * Text utilities shared by the detectors, the grounding gate and the
 * fingerprint. Deliberately dependency-free.
 */

const HARAKAT = /[\u064B-\u0652\u0670\u0640]/g;
const ARABIC_INDIC = /[\u0660-\u0669]/g;
const EXTENDED_ARABIC_INDIC = /[\u06F0-\u06F9]/g;

/** Arabic-Indic and Persian digits → ASCII, ٪ → %, ، stays. */
export function asciiDigits(text: string): string {
  return text
    .replace(ARABIC_INDIC, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(EXTENDED_ARABIC_INDIC, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/٪/g, "%");
}

/**
 * Comparison form: NFKC, ASCII digits, no harakat or tatweel, alef / taa
 * marbuta / alef maqsura folded, lowercase, punctuation dropped (except `%`),
 * whitespace collapsed. Two renderings of the same sentence compare equal.
 */
export function normalizeForMatch(text: string): string {
  return asciiDigits(text.normalize("NFKC"))
    .replace(HARAKAT, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}%\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Sentence-ish units: split on terminal punctuation and line breaks, trimmed, bounded. */
export function splitSentences(text: string, opts?: { min?: number; max?: number }): string[] {
  const min = opts?.min ?? 12;
  const max = opts?.max ?? 600;
  return text
    .split(/(?<=[.!?؟])\s+|\n+|\f/)
    .map((s) => s.trim())
    .filter((s) => s.length >= min)
    .map((s) => (s.length > max ? s.slice(0, max) : s));
}

/** A quote is a bounded window of the sentence around the match. */
export function clipQuote(sentence: string, matchIndex: number, maxLen = 240): string {
  const clean = sentence.replace(/\s+/g, " ").trim();
  if (clean.length <= maxLen) return clean;
  const half = Math.floor(maxLen / 2);
  let start = Math.max(0, matchIndex - half);
  let end = Math.min(clean.length, start + maxLen);
  if (end - start < maxLen) start = Math.max(0, end - maxLen);
  // Snap to word boundaries so the quote stays a verbatim substring of words.
  if (start > 0) {
    const sp = clean.indexOf(" ", start);
    if (sp > 0 && sp < start + 24) start = sp + 1;
  }
  if (end < clean.length) {
    const sp = clean.lastIndexOf(" ", end);
    if (sp > end - 24) end = sp;
  }
  return `${start > 0 ? "…" : ""}${clean.slice(start, end)}${end < clean.length ? "…" : ""}`;
}

export function hasArabic(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text);
}
