/**
 * Transport-level resilience primitives for the LLM layer.
 *
 * Pure functions so retry policy, failure classification, and truncation
 * repair are unit-testable without provider credentials or a database.
 */

export type LLMFailureKind =
  | "none"
  | "deterministic_mode"
  | "no_provider"
  | "missing_key"
  | "pricing_refusal"
  | "guardrail_rejected"
  | "rate_limited"
  | "timeout"
  | "server_error"
  | "network"
  | "invalid_response";

/** Typed transport error carrying an HTTP status when one exists. */
export class LLMTransportError extends Error {
  readonly status: number | null;
  readonly kind: LLMFailureKind;

  constructor(message: string, opts: { status?: number | null; kind?: LLMFailureKind } = {}) {
    super(message);
    this.name = "LLMTransportError";
    this.status = opts.status ?? null;
    this.kind =
      opts.kind ??
      classifyHttpStatus(this.status);
  }
}

function classifyHttpStatus(status: number | null): LLMFailureKind {
  if (status === null) return "network";
  if (status === 401 || status === 403) return "missing_key";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "server_error";
  if (status === 408) return "timeout";
  return "invalid_response";
}

/**
 * Classify any thrown value into a stable failure kind so callers (pipeline,
 * UI, audit trail) can distinguish "provider misconfigured" from "try again".
 */
export function classifyFailure(err: unknown): LLMFailureKind {
  if (err instanceof LLMTransportError) return err.kind;
  if (err instanceof Error) {
    if (err.name === "AbortError" || err.name === "TimeoutError") {
      return "timeout";
    }
    const msg = err.message || "";
    const httpMatch = /HTTP (\d{3})/.exec(msg);
    if (httpMatch) {
      return classifyHttpStatus(Number(httpMatch[1]));
    }
    if (/fetch failed|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ECONNRESET|socket hang up|network/i.test(msg)) {
      return "network";
    }
  }
  return "invalid_response";
}

/**
 * Transient failures are worth retrying with backoff; everything else fails
 * fast because an immediate retry would reproduce the same result.
 */
export function isTransientFailure(kind: LLMFailureKind): boolean {
  return (
    kind === "rate_limited" ||
    kind === "timeout" ||
    kind === "server_error" ||
    kind === "network"
  );
}

export const DEFAULT_LLM_MAX_ATTEMPTS = 3;
export const DEFAULT_LLM_BACKOFF_BASE_MS = 600;

/** Bounded human-readable delay for tests/logs. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Exponential backoff with full jitter, capped at 8s per attempt so a server
 * outage cannot stall an agent run longer than its own timeout budget.
 */
export function computeBackoffMs(
  attempt: number,
  baseMs: number = DEFAULT_LLM_BACKOFF_BASE_MS,
  random: () => number = Math.random
): number {
  const exponential = Math.min(baseMs * 2 ** Math.max(0, attempt - 1), 8000);
  return Math.floor(random() * exponential);
}

/**
 * Repair a completion that hit the token ceiling before finishing.
 *
 * A truncated draft must never ship mid-word or mid-sentence: cut back to the
 * last completed sentence (Arabic `؟`/`.` included). If no complete sentence
 * exists, cut to the last paragraph break; as a last resort keep the text but
 * let the caller decide with the truncated flag rather than mangling short
 * completions.
 *
 * `removedChars` counts only characters dropped by safety cutting — benign
 * trailing-whitespace cleanup does not count, so callers can rely on
 * `removedChars > 0` meaning real content was lost.
 */
export function trimToSafeBoundary(text: string): {
  text: string;
  removedChars: number;
} {
  const trailingTrimmed = text.replace(/\s+$/, "");
  let working = trailingTrimmed;
  if (!working) return { text: "", removedChars: 0 };

  // Drop a trailing code fence left open by the cutoff.
  const fences = (working.match(/```/g) ?? []).length;
  if (fences % 2 === 1) {
    const lastFence = working.lastIndexOf("```");
    working = working.slice(0, lastFence).replace(/\s+$/, "");
    if (!working) {
      return { text: "", removedChars: trailingTrimmed.length };
    }
  }

  // Last sentence terminator followed by whitespace or end of string.
  // Decimal points ("1.5") do not qualify because a digit follows.
  let lastIndex = -1;
  const terminator = /[.!؟?]/g;
  let match: RegExpExecArray | null;
  while ((match = terminator.exec(working)) !== null) {
    const next = working[match.index + 1];
    if (next === undefined || /\s/.test(next)) {
      lastIndex = match.index + 1;
    }
  }

  if (lastIndex > 0 && lastIndex >= Math.floor(working.length * 0.5)) {
    return {
      text: working.slice(0, lastIndex),
      removedChars: working.length - lastIndex,
    };
  }

  const lastParagraphBreak = working.lastIndexOf("\n\n");
  if (lastParagraphBreak > 0) {
    return {
      text: working.slice(0, lastParagraphBreak),
      removedChars: working.length - lastParagraphBreak,
    };
  }

  // Nothing safe to cut to — keep the text untouched and let the caller
  // decide using the truncated flag rather than mangling short completions.
  return { text, removedChars: 0 };
}

/**
 * Run an async transport operation with classified retries.
 *
 * `operation` receives the 1-based attempt number. Only transient failures are
 * retried; the final error is rethrown after classification is exhausted.
 */
export async function withRetries<T>(opts: {
  operation: (attempt: number) => Promise<T>;
  maxAttempts?: number;
  backoffBaseMs?: number;
  random?: () => number;
  sleepFn?: (ms: number) => Promise<void>;
}): Promise<{ result: T; attempts: number }> {
  const maxAttempts = Math.max(1, opts.maxAttempts ?? DEFAULT_LLM_MAX_ATTEMPTS);
  const sleepFn = opts.sleepFn ?? sleep;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const result = await opts.operation(attempt);
      return { result, attempts: attempt };
    } catch (err) {
      lastError = err;
      const kind = classifyFailure(err);
      if (!isTransientFailure(kind) || attempt === maxAttempts) {
        throw err instanceof LLMTransportError
          ? err
          : new LLMTransportError(
              err instanceof Error ? err.message : String(err),
              { kind }
            );
      }
      await sleepFn(computeBackoffMs(attempt, opts.backoffBaseMs, opts.random));
    }
  }
  /* istanbul ignore next -- loop always returns or throws */
  throw lastError instanceof Error
    ? lastError
    : new LLMTransportError(String(lastError), { kind: "invalid_response" });
}
