/**
 * Counterpart fidelity — the pure half of `counterpart.ts`.
 *
 * A proposal drafted in one language is translated section by section into
 * the other for the synchronized bilingual export, which renders the two
 * languages side by side. A translation that drops a table row, a requirement
 * ID or a number is therefore worse than none: every omission becomes a
 * visible contradiction between the two columns. These helpers split the
 * source into sections that reassemble byte-for-byte, and compare source and
 * target structure so the run can regenerate a defective section and report
 * whatever still differs. They never repair a translation themselves.
 */

import { analyzeStrongDirection } from "../bilingual-typography";
import { validateProposalDraftLanguageDirections } from "../proposal-snapshot-hydration";
import { LEGAL_DISCLAIMER, LEGAL_DISCLAIMER_AR } from "../procurement-rules";
import {
  HUMAN_APPROVAL_NOTICE,
  HUMAN_APPROVAL_NOTICE_AR,
} from "../agents/prompts";
import type {
  CounterpartDiagnostic,
  CounterpartDiagnosticCode,
} from "../counterpart-diagnostics";
import type { Locale } from "../types";

/* -------------------------------------------------------------------------- */
/* Sections                                                                   */
/* -------------------------------------------------------------------------- */

export interface MarkdownSection {
  /** 0-based position; 0 is always the preamble before the first `## ` heading (possibly empty). */
  readonly index: number;
  /** The `## ` heading line, or null for the preamble. */
  readonly heading: string | null;
  /** Raw text including the heading line; concatenating every section's text restores the document. */
  readonly text: string;
}

const FENCE_LINE = /^\s*(?:```|~~~)/;
const SECTION_HEADING_LINE = /^## (?!#)/;

/** Every line index where a `## ` heading starts a section, skipping fenced code. */
function sectionStarts(lines: readonly string[]): number[] {
  const starts: number[] = [];
  let inFence = false;
  lines.forEach((line, index) => {
    if (FENCE_LINE.test(line)) {
      inFence = !inFence;
      return;
    }
    if (!inFence && SECTION_HEADING_LINE.test(line)) starts.push(index);
  });
  return starts;
}

/**
 * `lines[from, to)` joined back with the newline that separated the slice from
 * the line after it. Slices taken this way concatenate to the original text.
 */
function sliceLines(lines: readonly string[], from: number, to: number): string {
  if (from >= to) return "";
  const text = lines.slice(from, to).join("\n");
  return to < lines.length ? `${text}\n` : text;
}

/** Split on `## ` headings; section 0 is the preamble, even when empty. */
export function splitMarkdownSections(markdown: string): MarkdownSection[] {
  const lines = markdown.split("\n");
  const bounds = [0, ...sectionStarts(lines), lines.length];
  const sections: MarkdownSection[] = [];
  for (let k = 0; k + 1 < bounds.length; k += 1) {
    const from = bounds[k];
    sections.push({
      index: k,
      heading: k === 0 ? null : lines[from],
      text: sliceLines(lines, from, bounds[k + 1]),
    });
  }
  return sections;
}

/** The inverse of `splitMarkdownSections`: plain concatenation. */
export function joinMarkdownSections(
  sections: ReadonlyArray<Pick<MarkdownSection, "text">>
): string {
  return sections.map((section) => section.text).join("");
}

/**
 * Cut a long section at blank lines outside fenced code so no single call has
 * to translate more than about `maxChars` of source. A run of lines with no
 * blank line (a very long table) stays whole. Chunks concatenate to the input.
 */
export function chunkMarkdownText(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const lines = text.split("\n");
  const chunks: string[] = [];
  let from = 0;
  let size = 0;
  let inFence = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (FENCE_LINE.test(line)) inFence = !inFence;
    size += line.length + 1;
    const isBlank = line.trim() === "";
    if (isBlank && !inFence && size >= maxChars && i + 1 < lines.length) {
      chunks.push(sliceLines(lines, from, i + 1));
      from = i + 1;
      size = 0;
    }
  }
  chunks.push(sliceLines(lines, from, lines.length));
  return chunks;
}

/* -------------------------------------------------------------------------- */
/* Structure                                                                  */
/* -------------------------------------------------------------------------- */

export interface MarkdownHeading {
  readonly level: number;
  readonly text: string;
}

const HEADING_LINE = /^(#{1,6})\s+(.*?)\s*#*\s*$/;

/** Every ATX heading outside fenced code, in order. */
export function extractHeadings(markdown: string): MarkdownHeading[] {
  const headings: MarkdownHeading[] = [];
  let inFence = false;
  for (const line of markdown.split("\n")) {
    if (FENCE_LINE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = HEADING_LINE.exec(line);
    if (match) headings.push({ level: match[1].length, text: match[2] });
  }
  return headings;
}

export interface MarkdownTableShape {
  /** Every pipe row, the `| --- |` separator included. */
  readonly rows: number;
  /** Cells in the first row. */
  readonly columns: number;
}

const TABLE_ROW = /^\s*\|.*\|\s*$/;

function cellCount(row: string): number {
  return row
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split(/(?<!\\)\|/).length;
}

/** Every run of consecutive pipe rows outside fenced code, as row/column counts. */
export function extractTables(markdown: string): MarkdownTableShape[] {
  const tables: MarkdownTableShape[] = [];
  let inFence = false;
  let current: string[] = [];
  const flush = () => {
    if (current.length > 0) {
      tables.push({ rows: current.length, columns: cellCount(current[0]) });
      current = [];
    }
  };
  for (const line of markdown.split("\n")) {
    if (FENCE_LINE.test(line)) {
      flush();
      inFence = !inFence;
      continue;
    }
    if (!inFence && TABLE_ROW.test(line)) current = [...current, line];
    else flush();
  }
  flush();
  return tables;
}

/* -------------------------------------------------------------------------- */
/* Tokens that must survive translation                                       */
/* -------------------------------------------------------------------------- */

/**
 * Requirement and control identifiers: `REQ-12`, `R-07`, `C-3`,
 * `NCA-ECC-2-1-3`, `T-4.2`; and standards written as `ISO 27001`,
 * `ISO/IEC 27001:2022`.
 */
const IDENTIFIER_PATTERNS: readonly RegExp[] = [
  /\b[A-Z]{1,8}(?:-[A-Z0-9]{1,8})*-\d+(?:[.-]\d+)*\b/g,
  /\bISO(?:\/IEC)?\s?\d{4,5}(?:-\d+)?(?::\d{4})?\b/g,
];

function unique(values: Iterable<string>): string[] {
  return [...new Set(values)];
}

/** Unique identifiers in order of first appearance. */
export function extractIdentifiers(text: string): string[] {
  return unique(
    IDENTIFIER_PATTERNS.flatMap((pattern) =>
      [...text.matchAll(pattern)].map((match) => match[0])
    )
  );
}

const compact = (text: string) => text.replace(/\s+/g, "");

/** Identifiers the source carries that the target does not, whitespace-insensitively. */
export function missingIdentifiers(source: string, target: string): string[] {
  const haystack = compact(target);
  return extractIdentifiers(source).filter((id) => !haystack.includes(compact(id)));
}

const ARABIC_INDIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const EXTENDED_ARABIC_INDIC_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

/** ASCII digits and separators, so `٢٫٥٪` compares equal to `2.5%`. */
export function normalizeDigits(text: string): string {
  return text
    .replace(/[٠-٩]/g, (d) => String(ARABIC_INDIC_DIGITS.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(EXTENDED_ARABIC_INDIC_DIGITS.indexOf(d)))
    .replace(/٫/g, ".")
    .replace(/٬/g, ",")
    .replace(/٪/g, "%");
}

const NUMBER_PATTERN = /\d+(?:[.,]\d+)*/g;

/** Unique integers, decimals and grouped numbers in order of first appearance, digits normalised. */
export function extractNumbers(text: string): string[] {
  return unique(
    [...normalizeDigits(text).matchAll(NUMBER_PATTERN)].map((match) => match[0])
  );
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function containsNumber(haystack: string, token: string): boolean {
  const asWritten = new RegExp(`(?<![\\d.,])${escapeRegExp(token)}(?![\\d])`);
  if (asWritten.test(haystack)) return true;
  const bare = token.replace(/[.,]/g, "");
  return bare !== token && new RegExp(`(?<![\\d.,])${bare}(?![\\d])`).test(haystack);
}

/**
 * Numbers the source carries that the target does not. Identifiers are
 * removed from the source first so a missing `REQ-12` is reported once, as an
 * identifier, not again as the number 12.
 */
export function missingNumbers(source: string, target: string): string[] {
  const withoutIds = extractIdentifiers(source).reduce(
    (text, id) => text.split(id).join(" "),
    source
  );
  const haystack = normalizeDigits(target);
  return extractNumbers(withoutIds).filter((n) => !containsNumber(haystack, n));
}

/* -------------------------------------------------------------------------- */
/* Passages that are swapped, never translated                                */
/* -------------------------------------------------------------------------- */

export interface VerbatimPassage {
  readonly name: string;
  /** The marker the model is told to copy; restored to the target-language text afterwards. */
  readonly token: string;
  /** Tolerant match for a marker the model spaced or hyphenated differently. */
  readonly tokenPattern: RegExp;
  readonly en: string;
  readonly ar: string;
}

export const VERBATIM_PASSAGES: readonly VerbatimPassage[] = [
  {
    name: "legal_disclaimer",
    token: "[[ARABCLUE_LEGAL_DISCLAIMER]]",
    tokenPattern: /\[\[\s*ARABCLUE[\s_-]*LEGAL[\s_-]*DISCLAIMER\s*\]\]/gi,
    en: LEGAL_DISCLAIMER,
    ar: LEGAL_DISCLAIMER_AR,
  },
  {
    name: "human_approval_notice",
    token: "[[ARABCLUE_HUMAN_APPROVAL_NOTICE]]",
    tokenPattern: /\[\[\s*ARABCLUE[\s_-]*HUMAN[\s_-]*APPROVAL[\s_-]*NOTICE\s*\]\]/gi,
    en: HUMAN_APPROVAL_NOTICE,
    ar: HUMAN_APPROVAL_NOTICE_AR,
  },
];

const otherLocale = (locale: Locale): Locale => (locale === "ar" ? "en" : "ar");

/** Replace each source-language passage with its marker before the text reaches the model. */
export function protectVerbatimPassages(text: string, sourceLocale: Locale): string {
  return VERBATIM_PASSAGES.reduce(
    (out, passage) => out.split(passage[sourceLocale]).join(passage.token),
    text
  );
}

/**
 * Put the exact target-language passage where the marker stands. A passage the
 * model copied untranslated instead of keeping the marker is swapped too, so
 * the legal text is always the approved sentence, never a paraphrase.
 */
export function restoreVerbatimPassages(text: string, targetLocale: Locale): string {
  return VERBATIM_PASSAGES.reduce((out, passage) => {
    const restored = out.replace(passage.tokenPattern, passage[targetLocale]);
    return restored.split(passage[otherLocale(targetLocale)]).join(passage[targetLocale]);
  }, text);
}

/** Passages the source carries (in either language or as a marker) that the target lacks in the target language. */
export function missingVerbatimPassages(
  source: string,
  target: string,
  targetLocale: Locale
): string[] {
  return VERBATIM_PASSAGES.filter(
    (passage) =>
      (source.includes(passage.en) ||
        source.includes(passage.ar) ||
        source.includes(passage.token)) &&
      !target.includes(passage[targetLocale])
  ).map((passage) => passage.name);
}

/* -------------------------------------------------------------------------- */
/* Checks                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Whole-document script sanity, reusing the export's own validator: the
 * target must carry its strong script at all, and must not be mostly written
 * in the source script — a model that returned the source untouched passes
 * every structural check and fails only here.
 */
export function checkTargetScript(
  target: string,
  targetLocale: Locale,
  source: string
): CounterpartDiagnostic[] {
  const pair =
    targetLocale === "en" ? { en: target, ar: source } : { en: source, ar: target };
  const targetPath = targetLocale === "en" ? "contentMd.en" : "contentMd.ar";
  const missing = validateProposalDraftLanguageDirections(pair).some(
    (diagnostic) => diagnostic.path === targetPath
  );
  if (missing) return [{ code: "target_script_missing", section: null }];

  const { arabicLetterCount, latinLetterCount } = analyzeStrongDirection(target);
  const dominated =
    targetLocale === "ar"
      ? latinLetterCount > arabicLetterCount
      : arabicLetterCount > latinLetterCount;
  return dominated ? [{ code: "target_script_dominated", section: null }] : [];
}

export interface FidelityCheckOptions {
  readonly targetLocale: Locale;
  /**
   * The section both texts belong to. Omit (or pass null) when comparing whole
   * documents; the script checks run only then, because a short section such
   * as a title line legitimately carries few letters of either script.
   */
  readonly section?: number | null;
}

/**
 * Structural parity between a source text and its translation: heading count
 * and levels, table count and per-table row/column counts, identifiers and
 * numbers the target dropped, mandatory passages, and (document scope) the
 * target script. Pure; the result is a list, empty when nothing differs.
 */
export function checkCounterpartFidelity(
  source: string,
  target: string,
  options: FidelityCheckOptions
): CounterpartDiagnostic[] {
  const section = options.section ?? null;
  const out: CounterpartDiagnostic[] = [];

  const sourceHeadings = extractHeadings(source);
  const targetHeadings = extractHeadings(target);
  if (sourceHeadings.length !== targetHeadings.length) {
    out.push({
      code: "heading_count_mismatch",
      section,
      expected: sourceHeadings.length,
      actual: targetHeadings.length,
    });
  } else if (sourceHeadings.some((h, i) => h.level !== targetHeadings[i].level)) {
    out.push({ code: "heading_level_mismatch", section });
  }

  const sourceTables = extractTables(source);
  const targetTables = extractTables(target);
  if (sourceTables.length !== targetTables.length) {
    out.push({
      code: "table_count_mismatch",
      section,
      expected: sourceTables.length,
      actual: targetTables.length,
    });
  }
  sourceTables.forEach((table, i) => {
    const counterpart = targetTables[i];
    if (!counterpart) return;
    if (table.rows !== counterpart.rows) {
      out.push({
        code: "table_rows_mismatch",
        section,
        table: i + 1,
        expected: table.rows,
        actual: counterpart.rows,
      });
    }
    if (table.columns !== counterpart.columns) {
      out.push({
        code: "table_columns_mismatch",
        section,
        table: i + 1,
        expected: table.columns,
        actual: counterpart.columns,
      });
    }
  });

  const identifiers = missingIdentifiers(source, target);
  if (identifiers.length > 0) {
    out.push({ code: "missing_identifiers", section, items: identifiers });
  }
  const numbers = missingNumbers(source, target);
  if (numbers.length > 0) {
    out.push({ code: "missing_numbers", section, items: numbers });
  }
  const passages = missingVerbatimPassages(source, target, options.targetLocale);
  if (passages.length > 0) {
    out.push({ code: "verbatim_passage_missing", section, items: passages });
  }

  if (section === null) {
    out.push(...checkTargetScript(target, options.targetLocale, source));
  }
  return out;
}

/**
 * Findings that earn a section one more attempt: structure the export renders
 * row for row, and identifiers the evaluator looks up. Missing numbers and
 * prose-level findings are reported but do not trigger a regeneration on
 * their own.
 */
export const COUNTERPART_RETRY_CODES: readonly CounterpartDiagnosticCode[] = [
  "heading_count_mismatch",
  "table_count_mismatch",
  "table_rows_mismatch",
  "table_columns_mismatch",
  "missing_identifiers",
];

export function needsRegeneration(
  diagnostics: readonly CounterpartDiagnostic[]
): boolean {
  return diagnostics.some((d) => COUNTERPART_RETRY_CODES.includes(d.code));
}
