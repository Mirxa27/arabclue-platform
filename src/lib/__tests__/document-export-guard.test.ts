import { describe, expect, test } from "bun:test";
import {
  DocumentExportGate,
  type DocumentExportAdmissionRequest,
} from "../document-export-guard";

const request: DocumentExportAdmissionRequest = {
  userId: "user-1",
  workspaceId: "workspace-1",
  sourceCharacters: 250,
  kind: "pdf",
};

describe("document export admission", () => {
  test("rejects oversized sources before consuming a rate-limit token", async () => {
    let calls = 0;
    const gate = new DocumentExportGate({
      maxSourceCharacters: 10,
      rateLimiter: async () => {
        calls += 1;
        return { ok: true, remaining: 1, retryAfterMs: 0 };
      },
    });

    const result = await gate.acquire(request);

    expect(result).toMatchObject({
      ok: false,
      code: "EXPORT_SOURCE_TOO_LARGE",
      status: 413,
    });
    expect(calls).toBe(0);
    expect(gate.activeRenders).toBe(0);
  });

  test("returns 429 when either distributed bucket is exhausted", async () => {
    let call = 0;
    const gate = new DocumentExportGate({
      rateLimiter: async () => {
        call += 1;
        return call === 1
          ? { ok: false, remaining: 0, retryAfterMs: 2_500 }
          : { ok: true, remaining: 1, retryAfterMs: 0 };
      },
    });

    const result = await gate.acquire(request);

    expect(result).toEqual({
      ok: false,
      code: "EXPORT_RATE_LIMITED",
      status: 429,
      retryAfterSeconds: 3,
      message: "Document export rate limit exceeded. Try again later.",
    });
    expect(gate.activeRenders).toBe(0);
  });

  test("fails fast when render slots are full and releases idempotently", async () => {
    const gate = new DocumentExportGate({
      maxConcurrentRenders: 1,
      rateLimiter: async () => ({
        ok: true,
        remaining: 1,
        retryAfterMs: 0,
      }),
    });

    const first = await gate.acquire(request);
    expect(first.ok).toBe(true);
    const second = await gate.acquire({
      ...request,
      userId: "user-2",
    });
    expect(second).toMatchObject({
      ok: false,
      code: "EXPORT_CAPACITY_EXHAUSTED",
      status: 503,
      retryAfterSeconds: 5,
    });

    if (!first.ok) throw new Error("expected first permit");
    first.permit.release();
    first.permit.release();
    expect(gate.activeRenders).toBe(0);

    const third = await gate.acquire({ ...request, userId: "user-3" });
    expect(third.ok).toBe(true);
    if (third.ok) third.permit.release();
    expect(gate.activeRenders).toBe(0);
  });

  test("rejects invalid admission identifiers", async () => {
    const gate = new DocumentExportGate({
      rateLimiter: async () => ({
        ok: true,
        remaining: 1,
        retryAfterMs: 0,
      }),
    });

    expect(
      gate.acquire({ ...request, kind: "pdf\nforged" })
    ).rejects.toThrow("kind is invalid");
    expect(
      gate.acquire({ ...request, sourceCharacters: Number.NaN })
    ).rejects.toThrow("sourceCharacters");
  });

  test("coordinates capacity across independent runtime gates", async () => {
    const leases = new Set<string>();
    let nextToken = 0;
    const acquire = async () => {
      if (leases.size >= 1) {
        return { status: "busy" as const, retryAfterMs: 2_000 };
      }
      const token = `lease-${++nextToken}`;
      leases.add(token);
      return { status: "acquired" as const, token };
    };
    const release = async ({ token }: { token: string }) => {
      leases.delete(token);
    };
    const distributedRateLimiter = async () => ({
      ok: true,
      remaining: 10,
      retryAfterMs: 0,
      backend: "redis" as const,
    });
    const firstRuntime = new DocumentExportGate({
      maxConcurrentRenders: 1,
      requireDistributed: true,
      rateLimiter: distributedRateLimiter,
      distributedLeaseAcquirer: acquire,
      distributedLeaseReleaser: release,
    });
    const secondRuntime = new DocumentExportGate({
      maxConcurrentRenders: 1,
      requireDistributed: true,
      rateLimiter: distributedRateLimiter,
      distributedLeaseAcquirer: acquire,
      distributedLeaseReleaser: release,
    });

    const [first, second] = await Promise.all([
      firstRuntime.acquire(request),
      secondRuntime.acquire({ ...request, userId: "user-other" }),
    ]);
    const admitted = [first, second].filter((result) => result.ok);
    const denied = [first, second].filter((result) => !result.ok);
    expect(admitted).toHaveLength(1);
    expect(denied).toHaveLength(1);
    expect(denied[0]).toMatchObject({
      code: "EXPORT_CAPACITY_EXHAUSTED",
      status: 503,
    });

    const winner = admitted[0];
    if (!winner?.ok) throw new Error("expected one distributed permit");
    await winner.permit.release();
    expect(leases.size).toBe(0);

    const retry = await secondRuntime.acquire({
      ...request,
      userId: "user-retry",
    });
    expect(retry.ok).toBe(true);
    if (retry.ok) await retry.permit.release();
  });

  test("fails closed when production distributed protection is unavailable", async () => {
    const gate = new DocumentExportGate({
      requireDistributed: true,
      rateLimiter: async () => ({
        ok: false,
        remaining: 0,
        retryAfterMs: 5_000,
        backend: "unavailable",
      }),
    });

    const result = await gate.acquire(request);
    expect(result).toMatchObject({
      ok: false,
      code: "EXPORT_GUARD_UNAVAILABLE",
      status: 503,
    });
  });
});
