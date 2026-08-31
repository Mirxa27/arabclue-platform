import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  PROVIDER_UNAVAILABLE,
  ProviderUnavailableError,
  guardCaughtOrThrow,
  guardOrThrow,
  isRealAiOnlyStrict,
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

describe("isRealAiOnlyStrict", () => {
  test("returns false when the flag is unset", () => {
    expect(isRealAiOnlyStrict()).toBe(false);
  });

  test("returns true for truthy values", () => {
    for (const value of ["1", "true", "TRUE", "on", "yes", "  Yes  "]) {
      setFlag(value);
      expect(isRealAiOnlyStrict()).toBe(true);
    }
  });

  test("returns false for falsy or garbage values", () => {
    for (const value of ["0", "false", "no", "off", "", "maybe", "1;"]) {
      setFlag(value);
      expect(isRealAiOnlyStrict()).toBe(false);
    }
  });
});

describe("guardOrThrow", () => {
  test("no-op when result is not a fallback (flag off)", () => {
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
    expect(() =>
      guardOrThrow(
        { fallback: true, failureKind: "no_provider", provider: "none" },
        "test",
      ),
    ).not.toThrow();
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
