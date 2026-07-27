export const MAX_PROVIDER_DEADLINE_MS = 120_000;

export interface ProviderCallContext {
  readonly signal: AbortSignal;
}

export interface ProviderAdapter<Request, Response> {
  execute(request: Request, context: ProviderCallContext): Promise<Response>;
}

export interface DeadlineScheduler {
  schedule(callback: () => void, milliseconds: number): unknown;
  cancel(handle: unknown): void;
}

export const systemDeadlineScheduler: DeadlineScheduler = Object.freeze({
  schedule: (callback, milliseconds) => globalThis.setTimeout(callback, milliseconds),
  cancel: (handle) =>
    globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>),
});

export class ProviderDeadlineExceededError extends Error {
  readonly code = "PROVIDER_DEADLINE_EXCEEDED" as const;

  constructor(
    public readonly provider: string,
    public readonly timeoutMs: number
  ) {
    super(`${provider} did not complete within its configured deadline.`);
    this.name = "ProviderDeadlineExceededError";
  }
}

export class ProviderRequestAbortedError extends Error {
  readonly code = "PROVIDER_REQUEST_ABORTED" as const;

  constructor(
    public readonly provider: string,
    public readonly reason: unknown
  ) {
    super(`${provider} request was aborted.`);
    this.name = "ProviderRequestAbortedError";
  }
}

export interface ProviderDeadlineOptions {
  readonly provider: string;
  readonly timeoutMs: number;
  readonly signal?: AbortSignal;
  readonly scheduler?: DeadlineScheduler;
}

/**
 * Execute an injected provider operation behind a real AbortSignal and a hard
 * response deadline. The timeout rejects even when an adapter fails to observe
 * the signal, while conforming adapters can stop their underlying I/O promptly.
 */
export async function withProviderDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  options: ProviderDeadlineOptions
): Promise<T> {
  const provider = validateProviderName(options.provider);
  const timeoutMs = validateTimeout(options.timeoutMs);
  const scheduler = options.scheduler ?? systemDeadlineScheduler;

  if (options.signal?.aborted) {
    throw new ProviderRequestAbortedError(provider, options.signal.reason);
  }

  return new Promise<T>((resolve, reject) => {
    const controller = new AbortController();
    let settled = false;
    let timeoutHandle: unknown;

    const cleanup = () => {
      if (timeoutHandle !== undefined) scheduler.cancel(timeoutHandle);
      options.signal?.removeEventListener("abort", onOuterAbort);
    };
    const succeed = (value: T) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const onOuterAbort = () => {
      const error = new ProviderRequestAbortedError(
        provider,
        options.signal?.reason
      );
      controller.abort(error);
      fail(error);
    };

    options.signal?.addEventListener("abort", onOuterAbort, { once: true });
    timeoutHandle = scheduler.schedule(() => {
      const error = new ProviderDeadlineExceededError(provider, timeoutMs);
      controller.abort(error);
      fail(error);
    }, timeoutMs);
    if (settled) {
      scheduler.cancel(timeoutHandle);
      return;
    }

    try {
      operation(controller.signal).then(succeed, fail);
    } catch (error) {
      fail(error);
    }
  });
}

export function callProviderWithDeadline<Request, Response>(
  adapter: ProviderAdapter<Request, Response>,
  request: Request,
  options: ProviderDeadlineOptions
): Promise<Response> {
  return withProviderDeadline(
    (signal) => adapter.execute(request, { signal }),
    options
  );
}

function validateProviderName(value: string): string {
  const provider = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(provider)) {
    throw new TypeError("Provider name is invalid.");
  }
  return provider;
}

function validateTimeout(value: number): number {
  if (
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > MAX_PROVIDER_DEADLINE_MS
  ) {
    throw new RangeError(
      `Provider deadline must be an integer from 1 to ${MAX_PROVIDER_DEADLINE_MS} milliseconds.`
    );
  }
  return value;
}
