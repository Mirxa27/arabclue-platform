import {
  acquireDistributedLease,
  rateLimitAsync,
  releaseDistributedLease,
  requiresDistributedRateLimit,
  type DistributedLeaseAdmission,
} from "./rate-limit";

export const DOCUMENT_EXPORT_LIMITS = Object.freeze({
  maxSourceCharacters: 1_000_000,
  maxConcurrentRenders: 2,
  userRequestsPerWindow: 12,
  workspaceRequestsPerWindow: 48,
  windowMs: 10 * 60 * 1_000,
});

export type DocumentExportDenialCode =
  | "EXPORT_SOURCE_TOO_LARGE"
  | "EXPORT_RATE_LIMITED"
  | "EXPORT_CAPACITY_EXHAUSTED"
  | "EXPORT_GUARD_UNAVAILABLE";

export type DocumentExportAdmission =
  | Readonly<{
      ok: true;
      permit: DocumentExportPermit;
    }>
  | Readonly<{
      ok: false;
      code: DocumentExportDenialCode;
      status: 413 | 429 | 503;
      retryAfterSeconds: number | null;
      message: string;
    }>;

export interface DocumentExportPermit {
  /** Idempotent; callers must invoke this in a finally block. */
  release(): void | Promise<void>;
}

export interface DocumentExportAdmissionRequest {
  readonly userId: string;
  readonly workspaceId: string;
  readonly sourceCharacters: number;
  readonly kind: string;
}

type RateLimiter = (options: {
  key: string;
  limit: number;
  windowMs: number;
}) => Promise<{
  ok: boolean;
  remaining: number;
  retryAfterMs: number;
  backend?: "redis" | "memory" | "unavailable";
}>;

type DistributedLeaseAcquirer = (options: {
  readonly key: string;
  readonly limit: number;
  readonly leaseMs: number;
}) => Promise<DistributedLeaseAdmission>;

type DistributedLeaseReleaser = (options: {
  readonly key: string;
  readonly token: string;
}) => Promise<void>;

export interface DocumentExportGateOptions {
  readonly maxSourceCharacters?: number;
  readonly maxConcurrentRenders?: number;
  readonly userRequestsPerWindow?: number;
  readonly workspaceRequestsPerWindow?: number;
  readonly windowMs?: number;
  readonly rateLimiter?: RateLimiter;
  readonly requireDistributed?: boolean;
  readonly distributedLeaseAcquirer?: DistributedLeaseAcquirer;
  readonly distributedLeaseReleaser?: DistributedLeaseReleaser;
}

function positiveInteger(
  value: number | undefined,
  fallback: number,
  name: string
): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 1) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
  return resolved;
}

function safeKeyPart(value: string, name: string): string {
  const normalized = value.trim();
  if (
    normalized.length < 1 ||
    normalized.length > 256 ||
    /[\u0000-\u001f\u007f]/u.test(normalized)
  ) {
    throw new TypeError(`${name} is invalid`);
  }
  return normalized;
}

/**
 * Admission control for CPU-intensive document rendering.
 *
 * The supplied limiter is distributed whenever REDIS_URL is configured
 * because the production implementation delegates to rateLimitAsync. The
 * local slot count separately protects each runtime instance from spawning
 * more Chromium renderers than it can safely serve.
 */
export class DocumentExportGate {
  readonly #maxSourceCharacters: number;
  readonly #maxConcurrentRenders: number;
  readonly #userRequestsPerWindow: number;
  readonly #workspaceRequestsPerWindow: number;
  readonly #windowMs: number;
  readonly #rateLimiter: RateLimiter;
  readonly #requireDistributed: boolean;
  readonly #distributedLeaseAcquirer: DistributedLeaseAcquirer;
  readonly #distributedLeaseReleaser: DistributedLeaseReleaser;
  #activeRenders = 0;

  constructor(options: DocumentExportGateOptions = {}) {
    this.#maxSourceCharacters = positiveInteger(
      options.maxSourceCharacters,
      DOCUMENT_EXPORT_LIMITS.maxSourceCharacters,
      "maxSourceCharacters"
    );
    this.#maxConcurrentRenders = positiveInteger(
      options.maxConcurrentRenders,
      DOCUMENT_EXPORT_LIMITS.maxConcurrentRenders,
      "maxConcurrentRenders"
    );
    this.#userRequestsPerWindow = positiveInteger(
      options.userRequestsPerWindow,
      DOCUMENT_EXPORT_LIMITS.userRequestsPerWindow,
      "userRequestsPerWindow"
    );
    this.#workspaceRequestsPerWindow = positiveInteger(
      options.workspaceRequestsPerWindow,
      DOCUMENT_EXPORT_LIMITS.workspaceRequestsPerWindow,
      "workspaceRequestsPerWindow"
    );
    this.#windowMs = positiveInteger(
      options.windowMs,
      DOCUMENT_EXPORT_LIMITS.windowMs,
      "windowMs"
    );
    this.#requireDistributed = requiresDistributedRateLimit(
      options.requireDistributed
    );
    this.#rateLimiter =
      options.rateLimiter ??
      ((input) =>
        rateLimitAsync({
          ...input,
          requireDistributed: this.#requireDistributed,
        }));
    this.#distributedLeaseAcquirer =
      options.distributedLeaseAcquirer ?? acquireDistributedLease;
    this.#distributedLeaseReleaser =
      options.distributedLeaseReleaser ?? releaseDistributedLease;
  }

  get activeRenders(): number {
    return this.#activeRenders;
  }

  async acquire(
    request: DocumentExportAdmissionRequest
  ): Promise<DocumentExportAdmission> {
    const userId = safeKeyPart(request.userId, "userId");
    const workspaceId = safeKeyPart(request.workspaceId, "workspaceId");
    const kind = safeKeyPart(request.kind, "kind");
    if (
      !Number.isSafeInteger(request.sourceCharacters) ||
      request.sourceCharacters < 0
    ) {
      throw new RangeError(
        "sourceCharacters must be a non-negative safe integer"
      );
    }
    if (request.sourceCharacters > this.#maxSourceCharacters) {
      return Object.freeze({
        ok: false as const,
        code: "EXPORT_SOURCE_TOO_LARGE" as const,
        status: 413 as const,
        retryAfterSeconds: null,
        message: `Document source exceeds the ${this.#maxSourceCharacters}-character export budget.`,
      });
    }

    const [userRate, workspaceRate] = await Promise.all([
      this.#rateLimiter({
        key: `document-export:user:${userId}:${kind}`,
        limit: this.#userRequestsPerWindow,
        windowMs: this.#windowMs,
      }),
      this.#rateLimiter({
        key: `document-export:workspace:${workspaceId}:${kind}`,
        limit: this.#workspaceRequestsPerWindow,
        windowMs: this.#windowMs,
      }),
    ]);
    if (
      this.#requireDistributed &&
      (userRate.backend === "unavailable" ||
        workspaceRate.backend === "unavailable" ||
        userRate.backend === "memory" ||
        workspaceRate.backend === "memory")
    ) {
      return Object.freeze({
        ok: false as const,
        code: "EXPORT_GUARD_UNAVAILABLE" as const,
        status: 503 as const,
        retryAfterSeconds: 5,
        message:
          "Distributed document-export admission is unavailable. Try again shortly.",
      });
    }
    if (!userRate.ok || !workspaceRate.ok) {
      const retryAfterMs = Math.max(
        userRate.retryAfterMs,
        workspaceRate.retryAfterMs
      );
      return Object.freeze({
        ok: false as const,
        code: "EXPORT_RATE_LIMITED" as const,
        status: 429 as const,
        retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1_000)),
        message: "Document export rate limit exceeded. Try again later.",
      });
    }

    if (this.#activeRenders >= this.#maxConcurrentRenders) {
      return Object.freeze({
        ok: false as const,
        code: "EXPORT_CAPACITY_EXHAUSTED" as const,
        status: 503 as const,
        retryAfterSeconds: 5,
        message: "Document render capacity is currently full. Try again shortly.",
      });
    }

    this.#activeRenders += 1;
    let distributedToken: string | null = null;
    if (this.#requireDistributed) {
      const lease = await this.#distributedLeaseAcquirer({
        key: "document-export-render-capacity",
        limit: this.#maxConcurrentRenders,
        leaseMs: 150_000,
      });
      if (lease.status !== "acquired") {
        this.#activeRenders = Math.max(0, this.#activeRenders - 1);
        return Object.freeze({
          ok: false as const,
          code:
            lease.status === "unavailable"
              ? ("EXPORT_GUARD_UNAVAILABLE" as const)
              : ("EXPORT_CAPACITY_EXHAUSTED" as const),
          status: 503 as const,
          retryAfterSeconds: Math.max(
            1,
            Math.ceil(lease.retryAfterMs / 1_000)
          ),
          message:
            lease.status === "unavailable"
              ? "Distributed document-export admission is unavailable. Try again shortly."
              : "Document render capacity is currently full. Try again shortly.",
        });
      }
      distributedToken = lease.token;
    }

    let released = false;
    return Object.freeze({
      ok: true as const,
      permit: Object.freeze({
        release: async () => {
          if (released) return;
          released = true;
          this.#activeRenders = Math.max(0, this.#activeRenders - 1);
          if (distributedToken) {
            await this.#distributedLeaseReleaser({
              key: "document-export-render-capacity",
              token: distributedToken,
            });
          }
        },
      }),
    });
  }
}

export const documentExportGate = new DocumentExportGate();
