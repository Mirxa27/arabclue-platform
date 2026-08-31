import { describe, expect, test } from "bun:test";
import {
  LLMTransportError,
  classifyFailure,
  computeBackoffMs,
  isTransientFailure,
  trimToSafeBoundary,
  withRetries,
} from "@/lib/llm/resilience";

describe("classifyFailure", () => {
  test("classifies transport errors by status", () => {
    expect(classifyFailure(new LLMTransportError("x", { status: 429 }))).toBe(
      "rate_limited"
    );
    expect(classifyFailure(new LLMTransportError("x", { status: 500 }))).toBe(
      "server_error"
    );
    expect(classifyFailure(new LLMTransportError("x", { status: 401 }))).toBe(
      "missing_key"
    );
    expect(classifyFailure(new LLMTransportError("x", { status: 400 }))).toBe(
      "invalid_response"
    );
    expect(classifyFailure(new LLMTransportError("x", {}))).toBe("network");
  });

  test("classifies aborts as timeout", () => {
    const err = new Error("The operation was aborted");
    err.name = "AbortError";
    expect(classifyFailure(err)).toBe("timeout");
  });

  test("parses HTTP status from plain error messages (legacy shape)", () => {
    expect(classifyFailure(new Error("OpenAI HTTP 503: overloaded"))).toBe(
      "server_error"
    );
    expect(classifyFailure(new Error("Anthropic HTTP 529: api_error"))).toBe(
      "server_error"
    );
    expect(classifyFailure(new Error("HTTP 402: quota"))).toBe(
      "invalid_response"
    );
  });

  test("classifies network-level failures", () => {
    expect(classifyFailure(new Error("fetch failed"))).toBe("network");
    expect(classifyFailure(new Error("ECONNRESET while streaming"))).toBe(
      "network"
    );
  });

  test("unknown errors are invalid_response, never silently retried as transient", () => {
    expect(classifyFailure("boom")).toBe("invalid_response");
    expect(classifyFailure(new Error("something else"))).toBe(
      "invalid_response"
    );
  });
});

describe("isTransientFailure", () => {
  test("retries rate limits, timeouts, server errors, and network", () => {
    for (const kind of [
      "rate_limited",
      "timeout",
      "server_error",
      "network",
    ] as const) {
      expect(isTransientFailure(kind)).toBe(true);
    }
  });

  test("never retries configuration or policy failures", () => {
    for (const kind of [
      "none",
      "deterministic_mode",
      "no_provider",
      "missing_key",
      "pricing_refusal",
      "guardrail_rejected",
      "invalid_response",
    ] as const) {
      expect(isTransientFailure(kind)).toBe(false);
    }
  });
});

describe("computeBackoffMs", () => {
  test("grows exponentially and respects the cap", () => {
    // Full jitter: value is uniform in [0, exponential), so the max with
    // random≈1 approaches the cap from below.
    expect(computeBackoffMs(1, 600, () => 0.999999)).toBe(599);
    expect(computeBackoffMs(2, 600, () => 0.999999)).toBe(1199);
    expect(computeBackoffMs(3, 600, () => 0.999999)).toBe(2399);
    expect(computeBackoffMs(10, 600, () => 0.999999)).toBe(7999);
    expect(computeBackoffMs(20, 600, () => 0.999999)).toBeLessThan(8000);
  });

  test("full jitter can reach zero", () => {
    expect(computeBackoffMs(1, 600, () => 0)).toBe(0);
  });
});

describe("withRetries", () => {
  test("returns first successful result with attempt count", async () => {
    let calls = 0;
    const { result, attempts } = await withRetries({
      operation: async () => {
        calls += 1;
        return `ok-${calls}`;
      },
    });
    expect(result).toBe("ok-1");
    expect(attempts).toBe(1);
    expect(calls).toBe(1);
  });

  test("retries transient failures then succeeds", async () => {
    let calls = 0;
    const { result, attempts } = await withRetries({
      operation: async () => {
        calls += 1;
        if (calls < 3) throw new LLMTransportError("HTTP 503", { status: 503 });
        return "recovered";
      },
      sleepFn: async () => {},
    });
    expect(result).toBe("recovered");
    expect(attempts).toBe(3);
  });

  test("fails fast on non-transient failures without retry", async () => {
    let calls = 0;
    await withRetries({
      operation: async () => {
        calls += 1;
        throw new LLMTransportError("bad key", { status: 401 });
      },
      sleepFn: async () => {},
    }).then(
      () => expect.unreachable(),
      (err) => {
        expect(err).toBeInstanceOf(LLMTransportError);
        expect((err as LLMTransportError).kind).toBe("missing_key");
      }
    );
    expect(calls).toBe(1);
  });

  test("throws after exhausting attempts on persistent transient failure", async () => {
    let calls = 0;
    await withRetries({
      operation: async () => {
        calls += 1;
        throw new LLMTransportError("HTTP 503", { status: 503 });
      },
      maxAttempts: 3,
      sleepFn: async () => {},
    }).then(
      () => expect.unreachable(),
      (err) => {
        expect((err as LLMTransportError).status).toBe(503);
      }
    );
    expect(calls).toBe(3);
  });

  test("wraps unknown thrown values into classified transport errors", async () => {
    await withRetries({
      operation: async () => {
        throw new Error("HTTP 429 from gateway");
      },
      maxAttempts: 1,
      sleepFn: async () => {},
    }).then(
      () => expect.unreachable(),
      (err) => {
        expect(err).toBeInstanceOf(LLMTransportError);
        expect((err as LLMTransportError).kind).toBe("rate_limited");
      }
    );
  });
});

describe("trimToSafeBoundary", () => {
  test("keeps complete text untouched", () => {
    const text = "# Proposal\n\nFirst paragraph ends here.\n\nSecond one too.";
    const out = trimToSafeBoundary(text);
    expect(out.removedChars).toBe(0);
    expect(out.text).toBe(text);
  });

  test("cuts back to the last completed sentence when truncated mid-sentence", () => {
    const complete = "Section one is done.\n\nSection two explains the plan.";
    const truncated = `${complete} and then the sentence abruptly`;
    const out = trimToSafeBoundary(truncated);
    expect(out.text).toBe(complete);
    expect(out.removedChars).toBe(truncated.length - complete.length);
  });

  test("respects Arabic sentence terminators", () => {
    const complete = "الفقرة الأولى مكتملة. الفقرة الثانية تسأل: هل النظام جاهز؟";
    const truncated = `${complete} ثم تنقطع`;
    const out = trimToSafeBoundary(truncated);
    expect(out.text).toBe(complete);
  });

  test("closes an unbalanced code fence before cutting", () => {
    const body = "Intro paragraph here.\n\n```text\ncode line";
    const out = trimToSafeBoundary(body);
    // Fence removal leaves no safe boundary past half — falls back to
    // paragraph break.
    expect(out.text.startsWith("Intro paragraph here.")).toBe(true);
    expect(out.text.includes("```")).toBe(false);
  });

  test("falls back to a paragraph boundary when sentences are too short", () => {
    const text = "Short.\n\nA much longer paragraph that got cut off mid wor";
    const out = trimToSafeBoundary(text);
    expect(out.text).toBe("Short.");
  });

  test("never returns empty output for non-empty input", () => {
    const out = trimToSafeBoundary("no punctuation at all");
    expect(out.text.length).toBeGreaterThan(0);
    expect(out.removedChars).toBe(0);
  });

  test("handles empty input", () => {
    expect(trimToSafeBoundary("").text).toBe("");
  });
});
