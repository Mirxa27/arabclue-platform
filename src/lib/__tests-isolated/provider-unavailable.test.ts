import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  PROVIDER_UNAVAILABLE,
  ProviderUnavailableError,
  guardCaughtOrThrow,
  guardOrThrow,
} from "../ai/provider-unavailable";

const ORIGINAL_ENV_VALUE = process.env.AUTONOMY_REAL_AI_ONLY;

function setFlag(value: string | undefined): void {
  if (value === undefined) {
    delete process.env.AUTONOMY_REAL_AI_ONLY;
  } else {
    process.env.AUTONOMY_REAL_AI_ONLY = value;
  }
}

beforeEach(() => {
  setFlag(undefined);
});

afterEach(() => {
  setFlag(ORIGINAL_ENV_VALUE);
});

// The flag reader itself is pinned in `src/lib/__tests__/real-ai-only.test.ts`.
describe("guardOrThrow", () => {
  test("no-op when result is not a fallback (flag off)", () => {
    setFlag("0");
    expect(() =>
      guardOrThrow(
        { fallback: false, failureKind: "none", provider: "anthropic" },
        "test",
      ),
    ).not.toThrow();
  });

  test("no-op when result is not a fallback (flag on)", () => {
    setFlag("1");
    expect(() =>
      guardOrThrow(
        { fallback: false, failureKind: "none", provider: "anthropic" },
        "test",
      ),
    ).not.toThrow();
  });

  test("no-op when flag is off, even with fallback result", () => {
    setFlag("0");
    expect(() =>
      guardOrThrow(
        { fallback: true, failureKind: "no_provider", provider: "none" },
        "test",
      ),
    ).not.toThrow();
  });

  test("throws on a fallback result when the flag is merely absent", () => {
    // The default is what a forgetful deploy gets, so it is the case worth
    // asserting on the guard itself and not only on the flag reader.
    expect(() =>
      guardOrThrow(
        { fallback: true, failureKind: "no_provider", provider: "none" },
        "test",
      ),
    ).toThrow(ProviderUnavailableError);
  });

  test("throws ProviderUnavailableError when flag is on and result is fallback", () => {
    setFlag("1");
    let caught: unknown = null;
    try {
      guardOrThrow(
        { fallback: true, failureKind: "missing_key", provider: "openai" },
        "compliance:scan",
      );
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ProviderUnavailableError);
    const err = caught as ProviderUnavailableError;
    expect(err.failureKind).toBe(PROVIDER_UNAVAILABLE);
    expect(err.llmFailureKind).toBe("missing_key");
    expect(err.provider).toBe("openai");
    expect(err.context).toBe("compliance:scan");
    expect(err.message).toContain("compliance:scan");
    expect(err.message).toContain("missing_key");
  });

  test("preserves undefined llmFailureKind when the LLM did not classify", () => {
    setFlag("true");
    try {
      guardOrThrow(
        { fallback: true, failureKind: undefined, provider: "none" },
        "vendor:match",
      );
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ProviderUnavailableError);
      expect((err as ProviderUnavailableError).llmFailureKind).toBeUndefined();
    }
  });
});

describe("guardCaughtOrThrow", () => {
  test("no-op when flag is off — caller keeps its fallback path", () => {
    setFlag("0");
    const original = new Error("network down");
    expect(() => guardCaughtOrThrow(original, "compliance:scan")).not.toThrow();
  });

  test("throws ProviderUnavailableError when flag is on, preserving cause", () => {
    setFlag("1");
    const original = new Error("network down");
    let caught: unknown = null;
    try {
      guardCaughtOrThrow(original, "compliance:scan");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ProviderUnavailableError);
    const err = caught as ProviderUnavailableError & { cause?: unknown };
    expect(err.failureKind).toBe(PROVIDER_UNAVAILABLE);
    expect(err.llmFailureKind).toBe("network");
    expect(err.cause).toBe(original);
  });
});

describe("ProviderUnavailableError", () => {
  test("has stable name and failureKind for downstream matching", () => {
    const err = new ProviderUnavailableError({ context: "x" });
    expect(err.name).toBe("ProviderUnavailableError");
    expect(err.failureKind).toBe(PROVIDER_UNAVAILABLE);
  });

  test("is an Error and can be re-caught by generic handlers", () => {
    const err = new ProviderUnavailableError({ context: "x" });
    expect(err).toBeInstanceOf(Error);
  });
});
