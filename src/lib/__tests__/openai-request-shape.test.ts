/**
 * The technical agent's provider was refusing the request, not the task.
 *
 * With GLM answering, the run got two steps further and died on
 * `enrich:technical, invalid_response` — the TECHNICAL row is
 * `openai / gpt-5.6-luna`. `invalid_response` is what a 4xx other than auth,
 * rate-limit or timeout classifies to, and the hand-rolled OpenAI-compatible
 * transport sends two things GPT-5-class models reject with HTTP 400:
 * `max_tokens` ("Unsupported parameter … Use 'max_completion_tokens'") and a
 * non-default `temperature` ("Unsupported value … Only the default (1)").
 * The co-pilot never hit this because it goes through the AI SDK's OpenAI
 * provider, which shapes the request per model.
 *
 * Two fixes in one: the request body is built by one pure function with the
 * per-provider rules, and the transport's own error text now travels on the
 * result so the run record says *what* the provider refused instead of
 * `invalid_response`.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  openAiCompatibleRequestBody,
  REASONING_TOKEN_HEADROOM,
} from "../llm/request-shape";
import { guardOrThrow, ProviderUnavailableError } from "../ai/provider-unavailable";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");

const messages = [{ role: "user" as const, content: "hello" }];

describe("openAiCompatibleRequestBody", () => {
  test("OpenAI GPT-5 class: reasoning headroom on the cap, low effort, no temperature", () => {
    // Reasoning tokens are billed against `max_completion_tokens` too; with
    // the request accepted, the technical step then failed on
    // `guardrail_rejected: empty_output` — the model spent the whole 2048 on
    // thinking. The cap gets headroom for the reasoning and the effort is
    // pinned low; these are structured steps, not open-ended analysis.
    const body = openAiCompatibleRequestBody({
      provider: "openai",
      modelId: "gpt-5.6-luna",
      messages,
      temperature: 0.2,
      maxTokens: 2048,
    });
    expect(body.max_completion_tokens).toBe(2048 + REASONING_TOKEN_HEADROOM);
    expect(body.reasoning_effort).toBe("low");
    expect("max_tokens" in body).toBe(false);
    expect("temperature" in body).toBe(false);
    expect(body.model).toBe("gpt-5.6-luna");
    expect(body.messages).toBe(messages);
  });

  test("OpenAI o-series is a reasoning model too", () => {
    const body = openAiCompatibleRequestBody({
      provider: "openai",
      modelId: "o4-mini",
      messages,
      temperature: 0.2,
      maxTokens: 512,
    });
    expect(body.max_completion_tokens).toBe(512 + REASONING_TOKEN_HEADROOM);
    expect(body.reasoning_effort).toBe("low");
    expect("temperature" in body).toBe(false);
  });

  test("OpenAI non-reasoning model keeps temperature, still the new token key", () => {
    const body = openAiCompatibleRequestBody({
      provider: "openai",
      modelId: "gpt-4.1",
      messages,
      temperature: 0.2,
      maxTokens: 1024,
    });
    expect(body.max_completion_tokens).toBe(1024);
    expect("max_tokens" in body).toBe(false);
    expect("reasoning_effort" in body).toBe(false);
    expect(body.temperature).toBe(0.2);
  });

  test("Azure OpenAI follows the OpenAI rules", () => {
    const body = openAiCompatibleRequestBody({
      provider: "azure_openai",
      modelId: "gpt-5-mini",
      messages,
      temperature: 0.2,
      maxTokens: 256,
    });
    expect(body.max_completion_tokens).toBe(256 + REASONING_TOKEN_HEADROOM);
    expect("temperature" in body).toBe(false);
  });

  test("other OpenAI-compatible vendors keep the classic shape", () => {
    for (const [provider, modelId] of [
      ["openai_compatible", "deepseek-v4-pro"],
      ["ollama", "llama3.3"],
      ["mistral", "mistral-large-latest"],
    ] as const) {
      const body = openAiCompatibleRequestBody({
        provider,
        modelId,
        messages,
        temperature: 0.2,
        maxTokens: 2048,
      });
      expect(body.max_tokens, provider).toBe(2048);
      expect(body.temperature, provider).toBe(0.2);
      expect("max_completion_tokens" in body, provider).toBe(false);
      expect("thinking" in body, provider).toBe(false);
    }
  });

  test("zai GLM keeps the classic shape and disables thinking", () => {
    const body = openAiCompatibleRequestBody({
      provider: "zai",
      modelId: "glm-5.2",
      messages,
      temperature: 0.2,
      maxTokens: 2048,
    });
    expect(body.max_tokens).toBe(2048);
    expect(body.temperature).toBe(0.2);
    expect(body.thinking).toEqual({ type: "disabled" });
  });
});

describe("the provider's refusal reaches the run record", () => {
  test("guardOrThrow names the transport failure detail", () => {
    const prev = process.env.AUTONOMY_REAL_AI_ONLY;
    delete process.env.AUTONOMY_REAL_AI_ONLY;
    try {
      let thrown: unknown;
      try {
        guardOrThrow(
          {
            fallback: true,
            failureKind: "invalid_response",
            provider: "openai",
            failureDetail:
              "openai HTTP 400: {\"error\":{\"message\":\"Unsupported parameter: 'max_tokens'\"}}",
          },
          "enrich:technical",
        );
      } catch (e) {
        thrown = e;
      }
      expect(thrown).toBeInstanceOf(ProviderUnavailableError);
      expect((thrown as Error).message).toContain("Unsupported parameter: 'max_tokens'");
    } finally {
      if (prev !== undefined) process.env.AUTONOMY_REAL_AI_ONLY = prev;
    }
  });

  test("generateCompletion records the detail on the fallback result", () => {
    const src = readFileSync(join(REPO_ROOT, "src/lib/llm/index.ts"), "utf8");
    expect(/failureDetail:/.test(src)).toBe(true);
    expect(/openAiCompatibleRequestBody\(/.test(src)).toBe(true);
  });

  test("an answer cut off by the cap says so in the reasons", () => {
    // `empty_output` alone hid the cause twice this week. When the transport
    // reports the completion was truncated, the reason list has to name it.
    const src = readFileSync(join(REPO_ROOT, "src/lib/llm/index.ts"), "utf8");
    expect(/truncated_by_max_tokens/.test(src)).toBe(true);
  });
});
