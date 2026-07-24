import {
  rateLimitAsync,
  requiresDistributedRateLimit,
} from "./rate-limit";

export const CONTRACT_DRAFT_WRITE_RATE_LIMITS = Object.freeze({
  userRequestsPerWindow: 30,
  workspaceRequestsPerWindow: 120,
  windowMs: 10 * 60 * 1_000,
});

type DraftRateLimiter = (options: {
  readonly key: string;
  readonly limit: number;
  readonly windowMs: number;
  readonly requireDistributed?: boolean;
}) => Promise<{
  readonly ok: boolean;
  readonly remaining: number;
  readonly retryAfterMs: number;
  readonly backend: "redis" | "memory" | "unavailable";
}>;

export type ContractDraftWriteAdmission =
  | Readonly<{ ok: true }>
  | Readonly<{
      ok: false;
      code:
        | "CONTRACT_DRAFT_RATE_LIMITED"
        | "CONTRACT_DRAFT_RATE_LIMIT_UNAVAILABLE";
      status: 429 | 503;
      retryAfterSeconds: number;
      message: string;
    }>;

function safeKeyPart(value: string, name: string): string {
  const normalized = value.trim();
  if (
    normalized.length < 1 ||
    normalized.length > 256 ||
    /[\u0000-\u001f\u007f]/u.test(normalized)
  ) {
    throw new TypeError(`${name} is invalid.`);
  }
  return normalized;
}

/**
 * Apply user and workspace write limits before contract compilation.
 *
 * Production and Vercel runtimes require Redis and fail closed when the
 * distributed backend cannot be reached. Local development may use memory.
 */
export async function admitContractDraftWrite(
  input: {
    readonly userId: string;
    readonly workspaceId: string;
  },
  options: {
    readonly rateLimiter?: DraftRateLimiter;
    readonly requireDistributed?: boolean;
  } = {}
): Promise<ContractDraftWriteAdmission> {
  const userId = safeKeyPart(input.userId, "userId");
  const workspaceId = safeKeyPart(input.workspaceId, "workspaceId");
  const requireDistributed = requiresDistributedRateLimit(
    options.requireDistributed
  );
  const limiter = options.rateLimiter ?? rateLimitAsync;
  let userRate: Awaited<ReturnType<DraftRateLimiter>>;
  let workspaceRate: Awaited<ReturnType<DraftRateLimiter>>;
  try {
    [userRate, workspaceRate] = await Promise.all([
      limiter({
        key: `contract-draft:user:${userId}`,
        limit: CONTRACT_DRAFT_WRITE_RATE_LIMITS.userRequestsPerWindow,
        windowMs: CONTRACT_DRAFT_WRITE_RATE_LIMITS.windowMs,
        requireDistributed,
      }),
      limiter({
        key: `contract-draft:workspace:${workspaceId}`,
        limit: CONTRACT_DRAFT_WRITE_RATE_LIMITS.workspaceRequestsPerWindow,
        windowMs: CONTRACT_DRAFT_WRITE_RATE_LIMITS.windowMs,
        requireDistributed,
      }),
    ]);
  } catch {
    return Object.freeze({
      ok: false as const,
      code: "CONTRACT_DRAFT_RATE_LIMIT_UNAVAILABLE" as const,
      status: 503 as const,
      retryAfterSeconds: 5,
      message:
        "Distributed contract-draft admission is unavailable. Try again shortly.",
    });
  }

  if (
    userRate.backend === "unavailable" ||
    workspaceRate.backend === "unavailable" ||
    (requireDistributed &&
      (userRate.backend !== "redis" || workspaceRate.backend !== "redis"))
  ) {
    return Object.freeze({
      ok: false as const,
      code: "CONTRACT_DRAFT_RATE_LIMIT_UNAVAILABLE" as const,
      status: 503 as const,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil(
          Math.max(userRate.retryAfterMs, workspaceRate.retryAfterMs) / 1_000
        )
      ),
      message:
        "Distributed contract-draft admission is unavailable. Try again shortly.",
    });
  }
  if (!userRate.ok || !workspaceRate.ok) {
    return Object.freeze({
      ok: false as const,
      code: "CONTRACT_DRAFT_RATE_LIMITED" as const,
      status: 429 as const,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil(
          Math.max(userRate.retryAfterMs, workspaceRate.retryAfterMs) / 1_000
        )
      ),
      message: "Contract draft write rate limit exceeded. Try again later.",
    });
  }
  return Object.freeze({ ok: true as const });
}
