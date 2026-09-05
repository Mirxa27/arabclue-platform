/**
 * One tolerant reader for the JSON the secondary generators ask a model for.
 *
 * Models wrap JSON in code fences, preface it with a sentence, leave a
 * trailing comma before a closing brace, or break a string across a raw
 * newline. Each generator used to carry its own three-line regex for the
 * first of those and `JSON.parse` for the rest, and each then walked the
 * result with `String(x ?? "")` — so a half-shaped answer became a full-shaped
 * object with empty fields and an `AI_GENERATED` provenance.
 *
 * `extractJsonObject` handles the wrapping; `parseJsonWithSchema` insists the
 * unwrapped object has the shape the caller will use. What does not fit is
 * reported as a schema rejection (`schemaRejection`), which the callers hand
 * to `guardOrThrow` exactly as they hand a provider's `guardrail_rejected`:
 * a strict deploy refuses, a permissive one falls back to its deterministic
 * path with the fallback's own provenance. Nothing partial is accepted.
 *
 * Pure: no runtime imports beyond zod's types, so the parsers are testable
 * without a provider, a database, or the LLM module.
 */

import type { ZodType } from "zod";
import type { LLMResult } from "../llm";

/** Longest input the extractor will scan; a model answer is far below it. */
const MAX_SCAN_CHARS = 400_000;

const FENCE_RE = /```[a-zA-Z0-9_-]*[ \t]*\r?\n?([\s\S]*?)```/g;

/**
 * Text with Markdown code fences removed. When the text contains fenced
 * blocks, the block bodies are kept (joined) and the prose around them is
 * dropped — the JSON lives inside the fence, the prose is commentary. An
 * unterminated opening fence is stripped and its body kept.
 */
export function stripCodeFences(text: string): string {
  if (!text.includes("```")) return text.trim();
  const bodies: string[] = [];
  for (const match of text.matchAll(FENCE_RE)) bodies.push(match[1]);
  if (bodies.length > 0) return bodies.join("\n").trim();
  // A single opening fence with no close: the model ran out of budget or
  // forgot to close it. Keep what follows.
  return text.replace(/```[a-zA-Z0-9_-]*[ \t]*\r?\n?/g, "").trim();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function tryParseObject(candidate: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(candidate);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * The two repairs that account for nearly every otherwise-valid model
 * answer, applied with awareness of string boundaries so a comma or newline
 * inside a quoted value is left alone:
 *  - a trailing comma before `}` or `]`;
 *  - a raw newline, carriage return or tab inside a string literal.
 */
export function repairJsonCandidate(candidate: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < candidate.length; i += 1) {
    const ch = candidate[i];
    if (inString) {
      if (escaped) {
        out += ch;
        escaped = false;
      } else if (ch === "\\") {
        out += ch;
        escaped = true;
      } else if (ch === '"') {
        out += ch;
        inString = false;
      } else if (ch === "\n") {
        out += "\\n";
      } else if (ch === "\r") {
        out += "\\r";
      } else if (ch === "\t") {
        out += "\\t";
      } else {
        out += ch;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === ",") {
      // Look past whitespace: a comma that only precedes a closer is dropped.
      let j = i + 1;
      while (j < candidate.length && /\s/.test(candidate[j])) j += 1;
      if (candidate[j] === "}" || candidate[j] === "]") continue;
    }
    out += ch;
  }
  return out;
}

/**
 * Index just past the object that opens at `start`, or -1 when the braces
 * never balance (a truncated answer). Braces inside string literals are not
 * counted.
 */
function balancedObjectEnd(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

/**
 * The first JSON object in a model's answer, or `null`.
 *
 * Tolerates code fences, leading and trailing prose, trailing commas and raw
 * newlines inside strings. Does not tolerate an unbalanced (truncated) object
 * or a top-level array — the generators all ask for an object, and salvaging
 * a prefix of one would be exactly the partial acceptance this module exists
 * to end.
 */
export function extractJsonObject(text: string): Record<string, unknown> | null {
  if (!text) return null;
  const cleaned = stripCodeFences(text.slice(0, MAX_SCAN_CHARS));
  if (!cleaned) return null;

  const direct = tryParseObject(cleaned);
  if (direct) return direct;

  let from = 0;
  while (from < cleaned.length) {
    const start = cleaned.indexOf("{", from);
    if (start < 0) return null;
    const end = balancedObjectEnd(cleaned, start);
    if (end < 0) return null;
    const candidate = cleaned.slice(start, end);
    const parsed = tryParseObject(candidate) ?? tryParseObject(repairJsonCandidate(candidate));
    if (parsed) return parsed;
    // Not JSON after all (a brace in prose); look for the next opening brace.
    from = start + 1;
  }
  return null;
}

export type SchemaParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; issues: string[] };

/** Reason strings stay short: they end up in a run record, not a UI. */
const MAX_ISSUES = 8;
const MAX_ISSUE_CHARS = 160;

/**
 * `extractJsonObject` followed by the schema. `issues` name the failing path
 * and message (`findings.2.status: Invalid option`) or `no_json_object` when
 * nothing parseable was found; they are what `schemaRejection` reports.
 */
export function parseJsonWithSchema<T>(
  text: string,
  schema: ZodType<T>
): SchemaParseResult<T> {
  const object = extractJsonObject(text);
  if (!object) return { ok: false, issues: ["no_json_object"] };
  const parsed = schema.safeParse(object);
  if (parsed.success) return { ok: true, data: parsed.data };
  const issues = parsed.error.issues.slice(0, MAX_ISSUES).map((issue) => {
    const path = issue.path.map(String).join(".") || "$";
    return `${path}: ${issue.message}`.slice(0, MAX_ISSUE_CHARS);
  });
  return { ok: false, issues: issues.length ? issues : ["schema_mismatch"] };
}

/** What a caller hands to `guardOrThrow` when the model's answer failed its schema. */
export type SchemaRejectedResult = Pick<
  LLMResult,
  "fallback" | "failureKind" | "provider" | "guardrailReasons" | "failureDetail"
>;

/**
 * A model answered, and the answer did not have the shape the caller needs.
 * Shaped like the LLM layer's own `guardrail_rejected` result so every caller
 * treats it the same way it treats an output-guardrail rejection: strict
 * deploys throw `PROVIDER_UNAVAILABLE` with the issues as detail, permissive
 * deploys take their deterministic path.
 */
export function schemaRejection(
  result: Pick<LLMResult, "provider">,
  issues: readonly string[]
): SchemaRejectedResult {
  return {
    fallback: true,
    failureKind: "guardrail_rejected",
    provider: result.provider,
    guardrailReasons: ["schema_mismatch", ...issues],
    failureDetail: `model answer failed schema: ${issues.join("; ")}`.slice(0, 600),
  };
}
