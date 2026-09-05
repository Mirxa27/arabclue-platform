/**
 * Counterpart draft diagnostics — the shape the fidelity checks report, the
 * record persisted in `GeneratedProposal.counterpartDiagnosticsJson`, and the
 * bilingual sentence the editor shows for each finding.
 *
 * Kept apart from `ai/counterpart-fidelity.ts` so the editor can import the
 * types and the text without pulling the prompt constants and the Markdown
 * analysis into the client bundle.
 */
import { tr } from "./i18n";
import type { Locale } from "./types";

export type CounterpartDiagnosticCode =
  | "heading_count_mismatch"
  | "heading_level_mismatch"
  | "table_count_mismatch"
  | "table_rows_mismatch"
  | "table_columns_mismatch"
  | "missing_identifiers"
  | "missing_numbers"
  | "verbatim_passage_missing"
  | "target_script_missing"
  | "target_script_dominated";

export interface CounterpartDiagnostic {
  readonly code: CounterpartDiagnosticCode;
  /**
   * 0-based section the finding belongs to (0 is the preamble before the
   * first `## ` heading); null when it concerns the whole document.
   */
  readonly section: number | null;
  /** For count comparisons: the source's count. */
  readonly expected?: number;
  /** For count comparisons: the target's count. */
  readonly actual?: number;
  /** 1-based table index within the section, for table findings. */
  readonly table?: number;
  /** Identifiers, numbers or passage names present in the source but absent from the target. */
  readonly items?: readonly string[];
}

/** What `counterpartDiagnosticsJson` holds: the findings plus the run that produced them. */
export interface CounterpartDiagnosticsRecord {
  readonly provider: string;
  readonly model: string;
  readonly tokensUsed: number;
  /** Sections that were sent to the model. */
  readonly sections: number;
  readonly diagnostics: readonly CounterpartDiagnostic[];
}

const CODES: ReadonlySet<string> = new Set<CounterpartDiagnosticCode>([
  "heading_count_mismatch",
  "heading_level_mismatch",
  "table_count_mismatch",
  "table_rows_mismatch",
  "table_columns_mismatch",
  "missing_identifiers",
  "missing_numbers",
  "verbatim_passage_missing",
  "target_script_missing",
  "target_script_dominated",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseDiagnostic(value: unknown): CounterpartDiagnostic | null {
  if (!isRecord(value) || typeof value.code !== "string" || !CODES.has(value.code)) {
    return null;
  }
  return {
    code: value.code as CounterpartDiagnosticCode,
    section: typeof value.section === "number" ? value.section : null,
    ...(typeof value.expected === "number" ? { expected: value.expected } : {}),
    ...(typeof value.actual === "number" ? { actual: value.actual } : {}),
    ...(typeof value.table === "number" ? { table: value.table } : {}),
    ...(Array.isArray(value.items)
      ? { items: value.items.filter((item): item is string => typeof item === "string") }
      : {}),
  };
}

/**
 * The persisted record, or null when the column is empty or holds something
 * this build does not recognise. A malformed row never throws in the editor.
 */
export function parseCounterpartDiagnosticsJson(
  raw: string | null | undefined
): CounterpartDiagnosticsRecord | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.diagnostics)) return null;
  return {
    provider: typeof parsed.provider === "string" ? parsed.provider : "",
    model: typeof parsed.model === "string" ? parsed.model : "",
    tokensUsed: typeof parsed.tokensUsed === "number" ? parsed.tokensUsed : 0,
    sections: typeof parsed.sections === "number" ? parsed.sections : 0,
    diagnostics: parsed.diagnostics
      .map(parseDiagnostic)
      .filter((d): d is CounterpartDiagnostic => d !== null),
  };
}

/** How many listed items a sentence names before it says "…". */
const LISTED_ITEMS_MAX = 6;

function listItems(items: readonly string[] | undefined, locale: Locale): string {
  const list = items ?? [];
  const shown = list.slice(0, LISTED_ITEMS_MAX).join(locale === "ar" ? "، " : ", ");
  return list.length > LISTED_ITEMS_MAX ? `${shown}…` : shown;
}

/** One bilingual sentence for a finding, prefixed with its section when it has one. */
export function describeCounterpartDiagnostic(
  diagnostic: CounterpartDiagnostic,
  locale: Locale
): string {
  const values = {
    expected: diagnostic.expected ?? 0,
    actual: diagnostic.actual ?? 0,
    table: diagnostic.table ?? 0,
    count: diagnostic.items?.length ?? 0,
    items: listItems(diagnostic.items, locale),
  };
  const body = tr(DIAGNOSTIC_KEYS[diagnostic.code], locale, values);
  if (diagnostic.section === null) return body;
  return `${tr("counterpart_section_label", locale, { section: diagnostic.section })}: ${body}`;
}

const DIAGNOSTIC_KEYS: Readonly<Record<CounterpartDiagnosticCode, string>> = {
  heading_count_mismatch: "counterpart_diag_heading_count",
  heading_level_mismatch: "counterpart_diag_heading_level",
  table_count_mismatch: "counterpart_diag_table_count",
  table_rows_mismatch: "counterpart_diag_table_rows",
  table_columns_mismatch: "counterpart_diag_table_columns",
  missing_identifiers: "counterpart_diag_missing_ids",
  missing_numbers: "counterpart_diag_missing_numbers",
  verbatim_passage_missing: "counterpart_diag_passage_missing",
  target_script_missing: "counterpart_diag_script_missing",
  target_script_dominated: "counterpart_diag_script_dominated",
};
