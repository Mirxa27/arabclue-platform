import { describe, expect, test } from "bun:test";
import {
  CONTRACT_DRAFT_WRITE_RATE_LIMITS,
  admitContractDraftWrite,
} from "../contract-draft-admission";

describe("contract draft distributed write admission", () => {
  test("checks both the user and workspace Redis buckets", async () => {
    const keys: string[] = [];
    const result = await admitContractDraftWrite(
      { userId: "user-1", workspaceId: "workspace-1" },
      {
        requireDistributed: true,
        rateLimiter: async (input) => {
          keys.push(input.key);
          expect(input.requireDistributed).toBe(true);
          expect(input.windowMs).toBe(
            CONTRACT_DRAFT_WRITE_RATE_LIMITS.windowMs
          );
          return {
            ok: true,
            remaining: 1,
            retryAfterMs: 0,
            backend: "redis",
          };
        },
      }
    );

    expect(result).toEqual({ ok: true });
    expect(keys.sort()).toEqual([
      "contract-draft:user:user-1",
      "contract-draft:workspace:workspace-1",
    ]);
  });

  test("fails production admission closed when either bucket is not distributed", async () => {
    const result = await admitContractDraftWrite(
      { userId: "user-1", workspaceId: "workspace-1" },
      {
        requireDistributed: true,
        rateLimiter: async () => ({
          ok: true,
          remaining: 1,
          retryAfterMs: 5_000,
          backend: "memory",
        }),
      }
    );

    expect(result).toMatchObject({
      ok: false,
      code: "CONTRACT_DRAFT_RATE_LIMIT_UNAVAILABLE",
      status: 503,
      retryAfterSeconds: 5,
    });
  });

  test("returns 429 with the longest retry window when a bucket is exhausted", async () => {
    let call = 0;
    const result = await admitContractDraftWrite(
      { userId: "user-1", workspaceId: "workspace-1" },
      {
        requireDistributed: true,
        rateLimiter: async () => {
          call += 1;
          return {
            ok: call !== 2,
            remaining: call === 2 ? 0 : 1,
            retryAfterMs: call === 2 ? 61_000 : 0,
            backend: "redis",
          };
        },
      }
    );

    expect(result).toMatchObject({
      ok: false,
      code: "CONTRACT_DRAFT_RATE_LIMITED",
      status: 429,
      retryAfterSeconds: 61,
    });
  });

  test("converts limiter failures into a fail-closed 503", async () => {
    const result = await admitContractDraftWrite(
      { userId: "user-1", workspaceId: "workspace-1" },
      {
        requireDistributed: true,
        rateLimiter: async () => {
          throw new Error("redis offline");
        },
      }
    );

    expect(result).toMatchObject({
      ok: false,
      code: "CONTRACT_DRAFT_RATE_LIMIT_UNAVAILABLE",
      status: 503,
    });
  });
});
