import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { canonicalJson, canonicalJsonHash } from "../canonical-json";
import {
  createKeysetCursorCodec,
  KeysetCursorError,
} from "../keyset-cursor";
import {
  callProviderWithDeadline,
  ProviderDeadlineExceededError,
  ProviderRequestAbortedError,
  withProviderDeadline,
  type DeadlineScheduler,
} from "../provider-timeout";
import { createRuntimeId } from "../runtime-id";
import {
  createTokenDigest,
  getTokenDigestLookup,
  hashLegacyToken,
  verifyTokenDigest,
  type CryptographicRandomSource,
} from "../token-digest";
import {
  addUtcMilliseconds,
  fixedUtcClock,
  utcDeadline,
  utcNow,
} from "../time";
import { buildWorkspaceSlug } from "../tokens";

const BASE_TIME = new Date("2026-07-26T12:00:00.000Z");
const FIXED_UUID = "123e4567-e89b-42d3-a456-426614174000";

function deterministicRandom(seed: number): CryptographicRandomSource {
  let state = seed >>> 0;
  return {
    randomBytes(length) {
      const output = new Uint8Array(length);
      for (let index = 0; index < length; index++) {
        state = (state * 1_664_525 + 1_013_904_223) >>> 0;
        output[index] = state & 0xff;
      }
      return output;
    },
  };
}

class ManualScheduler implements DeadlineScheduler {
  private callback: (() => void) | null = null;
  canceled = false;

  schedule(callback: () => void): unknown {
    this.callback = callback;
    return Symbol("deadline");
  }

  cancel(): void {
    this.canceled = true;
  }

  fire(): void {
    this.callback?.();
  }
}

describe("versioned token digests", () => {
  test("issues a salted v1 digest and verifies it in constant-length comparison paths", () => {
    const issued = createTokenDigest({ randomness: deterministicRandom(11) });
    const stored = {
      tokenHash: issued.tokenHash,
      hashSalt: issued.hashSalt,
      hashVersion: issued.hashVersion,
      createdAt: BASE_TIME,
      expiresAt: addUtcMilliseconds(BASE_TIME, 60 * 60 * 1000),
    };

    expect(issued.rawToken.startsWith("ac.v1.")).toBe(true);
    expect(issued.tokenHash).toHaveLength(64);
    expect(getTokenDigestLookup(issued.rawToken)).toEqual({
      kind: "versioned",
      tokenHash: issued.tokenHash,
      hashSalt: issued.hashSalt,
      hashVersion: 1,
    });
    expect(
      verifyTokenDigest(issued.rawToken, stored, {
        clock: fixedUtcClock(addUtcMilliseconds(BASE_TIME, 1)),
      })
    ).toBe(true);
    expect(
      verifyTokenDigest(`${issued.rawToken}x`, stored, {
        clock: fixedUtcClock(addUtcMilliseconds(BASE_TIME, 1)),
      })
    ).toBe(false);
    expect(
      verifyTokenDigest(issued.rawToken, { ...stored, tokenHash: "short" }, {
        clock: fixedUtcClock(addUtcMilliseconds(BASE_TIME, 1)),
      })
    ).toBe(false);
    expect(
      verifyTokenDigest(issued.rawToken, { ...stored, hashVersion: 2 }, {
        clock: fixedUtcClock(addUtcMilliseconds(BASE_TIME, 1)),
      })
    ).toBe(false);
  });

  test("allows legacy unsalted records only inside an explicit bounded lifetime", () => {
    const rawToken = "legacy-token-value";
    const stored = {
      tokenHash: hashLegacyToken(rawToken),
      hashSalt: null,
      hashVersion: 0,
      createdAt: BASE_TIME,
      expiresAt: addUtcMilliseconds(BASE_TIME, 60 * 60 * 1000),
    };
    const clock = fixedUtcClock(addUtcMilliseconds(BASE_TIME, 30 * 60 * 1000));

    expect(verifyTokenDigest(rawToken, stored, { clock })).toBe(false);
    expect(
      verifyTokenDigest(rawToken, stored, {
        clock,
        legacy: { maxAgeMs: 60 * 60 * 1000 },
      })
    ).toBe(true);
    expect(
      verifyTokenDigest(rawToken, stored, {
        clock,
        legacy: {
          maxAgeMs: 60 * 60 * 1000,
          readUntil: addUtcMilliseconds(BASE_TIME, 45 * 60 * 1000),
        },
      })
    ).toBe(false);
    expect(
      verifyTokenDigest(rawToken, stored, {
        clock: fixedUtcClock(addUtcMilliseconds(BASE_TIME, 60 * 60 * 1000)),
        legacy: { maxAgeMs: 60 * 60 * 1000 },
      })
    ).toBe(false);
  });

  test("rejects malformed version prefixes without a legacy downgrade", () => {
    expect(getTokenDigestLookup("ac.v2.c2FsdA.c2VjcmV0")).toBeNull();
    expect(getTokenDigestLookup("ac.v1.not+padded.secret")).toBeNull();
  });

  test("round-trips 100 generated token inputs with unique per-token salts", () => {
    const salts = new Set<string>();
    const hashes = new Set<string>();

    for (let seed = 1; seed <= 100; seed++) {
      const issued = createTokenDigest({ randomness: deterministicRandom(seed) });
      const stored = {
        tokenHash: issued.tokenHash,
        hashSalt: issued.hashSalt,
        hashVersion: issued.hashVersion,
        createdAt: BASE_TIME,
        expiresAt: addUtcMilliseconds(BASE_TIME, 1_000),
      };
      expect(
        verifyTokenDigest(issued.rawToken, stored, {
          clock: fixedUtcClock(BASE_TIME),
        })
      ).toBe(true);
      salts.add(issued.hashSalt);
      hashes.add(issued.tokenHash);
    }

    expect(salts.size).toBe(100);
    expect(hashes.size).toBe(100);
  });
});

describe("injectable UTC clocks", () => {
  test("returns defensive UTC instants and computes exact deadlines", () => {
    const clock = fixedUtcClock(BASE_TIME);
    const first = utcNow(clock);
    first.setUTCFullYear(2000);

    expect(utcNow(clock).toISOString()).toBe("2026-07-26T12:00:00.000Z");
    expect(utcDeadline(5_000, clock).toISOString()).toBe(
      "2026-07-26T12:00:05.000Z"
    );
  });

  test("rejects invalid clocks and unsafe durations", () => {
    expect(() => utcNow({ now: () => new Date(Number.NaN) })).toThrow();
    expect(() => addUtcMilliseconds(BASE_TIME, Number.NaN)).toThrow();
    expect(() => utcDeadline(-1, fixedUtcClock(BASE_TIME))).toThrow();
  });
});

describe("abortable provider deadlines", () => {
  test("aborts and rejects a provider operation at the deadline", async () => {
    const scheduler = new ManualScheduler();
    let observedSignal: AbortSignal | null = null;
    const pending = withProviderDeadline(
      async (signal) => {
        observedSignal = signal;
        return new Promise<string>(() => undefined);
      },
      { provider: "email", timeoutMs: 10_000, scheduler }
    );

    scheduler.fire();

    await expect(pending).rejects.toBeInstanceOf(
      ProviderDeadlineExceededError
    );
    expect(observedSignal?.aborted).toBe(true);
    expect(scheduler.canceled).toBe(true);
  });

  test("uses an injected adapter and clears the deadline after success", async () => {
    const scheduler = new ManualScheduler();
    const result = await callProviderWithDeadline(
      {
        execute: async (request: { value: string }, context) => {
          expect(context.signal.aborted).toBe(false);
          return request.value.toUpperCase();
        },
      },
      { value: "ok" },
      { provider: "billing", timeoutMs: 30_000, scheduler }
    );

    expect(result).toBe("OK");
    expect(scheduler.canceled).toBe(true);
  });

  test("does not invoke an adapter when the caller signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort("request closed");
    let calls = 0;

    await expect(
      withProviderDeadline(
        async () => {
          calls += 1;
          return "unexpected";
        },
        { provider: "email", timeoutMs: 10_000, signal: controller.signal }
      )
    ).rejects.toBeInstanceOf(ProviderRequestAbortedError);
    expect(calls).toBe(0);
  });
});

describe("canonical JSON and hashes", () => {
  test("sorts object keys recursively while preserving array order", () => {
    expect(canonicalJson({ z: 1, a: { y: 2, x: 3 }, list: [2, 1] })).toBe(
      '{"a":{"x":3,"y":2},"list":[2,1],"z":1}'
    );
    expect(canonicalJsonHash({ b: 2, a: 1 })).toBe(
      canonicalJsonHash({ a: 1, b: 2 })
    );
    expect(canonicalJsonHash({ a: [1, 2] })).not.toBe(
      canonicalJsonHash({ a: [2, 1] })
    );
  });

  test("rejects ambiguous or non-JSON content", () => {
    const circular: { self?: unknown } = {};
    circular.self = circular;
    expect(() => canonicalJson(circular)).toThrow();
    expect(() => canonicalJson({ value: undefined })).toThrow();
    expect(() => canonicalJson({ value: Number.POSITIVE_INFINITY })).toThrow();
    expect(() => canonicalJson(new Date())).toThrow();
  });

  test("produces one hash for 100 insertion-order permutations", () => {
    const expected = canonicalJsonHash({ a: 1, b: 2, c: 3 });
    for (let index = 0; index < 100; index++) {
      const keys = index % 2 === 0 ? ["c", "a", "b"] : ["b", "c", "a"];
      const value = Object.fromEntries(
        keys.map((key) => [key, { a: 1, b: 2, c: 3 }[key as "a" | "b" | "c"]])
      );
      expect(canonicalJsonHash(value)).toBe(expected);
    }
  });
});

describe("strict resource-scoped keyset cursors", () => {
  const scopeSchema = z
    .object({ workspaceId: z.string().min(1), resourceId: z.string().min(1) })
    .strict();
  const sortSchema = z
    .object({
      submittedAt: z.string().datetime(),
      recordType: z.string().min(1),
      id: z.string().min(1),
    })
    .strict();
  const codec = createKeysetCursorCodec({
    resource: "knowledge-queue",
    scopeSchema,
    sortSchema,
  });
  const scope = { workspaceId: "ws-1", resourceId: "queue" };
  const sort = {
    submittedAt: "2026-07-26T12:00:00.000Z",
    recordType: "CERTIFICATE",
    id: "record-1",
  };

  test("round-trips every sort key and resource scope field", () => {
    const cursor = codec.encode({ scope, sort });
    expect(cursor).not.toContain("=");
    expect(codec.decode(cursor, scope)).toEqual({ scope, sort });
  });

  test("rejects wrong scope, wrong resource, missing keys, and extra keys", () => {
    const cursor = codec.encode({ scope, sort });
    expect(() =>
      codec.decode(cursor, { ...scope, workspaceId: "ws-2" })
    ).toThrow(KeysetCursorError);

    const wrongResource = Buffer.from(
      JSON.stringify({ v: 1, resource: "other", scope, sort }),
      "utf8"
    ).toString("base64url");
    expect(() => codec.decode(wrongResource, scope)).toThrow(
      KeysetCursorError
    );

    const missingSortKey = Buffer.from(
      JSON.stringify({
        v: 1,
        resource: "knowledge-queue",
        scope,
        sort: { submittedAt: sort.submittedAt, id: sort.id },
      }),
      "utf8"
    ).toString("base64url");
    expect(() => codec.decode(missingSortKey, scope)).toThrow(
      KeysetCursorError
    );

    const extraScopeKey = Buffer.from(
      JSON.stringify({
        v: 1,
        resource: "knowledge-queue",
        scope: { ...scope, otherWorkspaceId: "ws-2" },
        sort,
      }),
      "utf8"
    ).toString("base64url");
    expect(() => codec.decode(extraScopeKey, scope)).toThrow(
      KeysetCursorError
    );
  });

  test("rejects unknown versions and noncanonical base64url", () => {
    const unknownVersion = Buffer.from(
      JSON.stringify({ v: 2, resource: "knowledge-queue", scope, sort }),
      "utf8"
    ).toString("base64url");
    expect(() => codec.decode(unknownVersion, scope)).toThrow(
      KeysetCursorError
    );
    expect(() => codec.decode(`${codec.encode({ scope, sort })}=`, scope)).toThrow(
      KeysetCursorError
    );
  });

  test("round-trips 100 generated composite sort positions", () => {
    for (let index = 0; index < 100; index++) {
      const generated = {
        submittedAt: new Date(BASE_TIME.getTime() + index).toISOString(),
        recordType: `TYPE_${index % 5}`,
        id: `record-${index}`,
      };
      const decoded = codec.decode(codec.encode({ scope, sort: generated }), scope);
      expect(decoded.sort).toEqual(generated);
    }
  });
});

describe("runtime identifiers", () => {
  test("uses injectable UUID generation for runtime IDs and workspace slugs", () => {
    expect(createRuntimeId("upload", () => FIXED_UUID)).toBe(
      `upload_${FIXED_UUID}`
    );
    expect(buildWorkspaceSlug("My Workspace", () => FIXED_UUID)).toBe(
      `my-workspace-${FIXED_UUID}`
    );
  });

  test("rejects invalid UUID sources and identifier prefixes", () => {
    expect(() => createRuntimeId("bad prefix", () => FIXED_UUID)).toThrow();
    expect(() => createRuntimeId("upload", () => "not-a-uuid")).toThrow();
  });
});
