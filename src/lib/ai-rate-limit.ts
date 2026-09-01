/**
 * Shared per-workspace rate limiter for expensive LLM-backed AI endpoints.
 *
 * These endpoints hit third-party LLM providers with paid tokens, so a
 * runaway loop or leaked cookie can burn real money. We apply a modest
 * per-workspace budget that is far above legitimate interactive use but
 * catches automated abuse quickly.
 */
import type { NextResponse } from "next/server";
import { describeRateLimitDenial, rateLimitAsync } from "@/lib/rate-limit";
import { jsonApiFailure } from "@/lib/api-controller";

export type AiRateLimitScope = "workspace" | "user";

export interface AiRateLimitOptions {
  /** Stable route identifier, e.g. "ai.contract-draft". */
  route: string;
  /** Workspace or user id to scope the bucket. */
  identifier: string;
  /** Max requests inside the window. */
  limit: number;
  /** Window size in milliseconds. */
  windowMs: number;
  scope?: AiRateLimitScope;
}

/** Returns a NextResponse when the caller must be blocked, otherwise null. */
export async function checkAiRateLimit(
  opts: AiRateLimitOptions
): Promise<NextResponse | null> {
  const scope = opts.scope ?? "workspace";
  const rl = await rateLimitAsync({
    key: `${opts.route}:${scope}:${opts.identifier}`,
    limit: opts.limit,
    windowMs: opts.windowMs,
  });
  if (rl.ok) return null;
  // `describeRateLimitDenial` owns the 429-vs-503 split for the whole codebase;
  // re-deriving it here is how the two answers drift apart.
  const denial = describeRateLimitDenial(rl);
  return jsonApiFailure(
    denial.status === 503 ? "AI_RATE_LIMIT_UNAVAILABLE" : "AI_RATE_LIMITED",
    { retryAfterSeconds: denial.retryAfterSeconds }
  );
}
