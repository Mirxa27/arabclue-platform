/**
 * Why the ingestion agent got an empty answer from a working provider.
 *
 * With the guardrail reason finally reaching the run record, the production
 * failure read `guardrail_rejected: empty_output`. The INGESTION row is
 * `zai / glm-5.2` over the OpenAI-compatible endpoint. GLM-5.x reasons by
 * default and spends `max_tokens` on `reasoning_content` before writing a
 * single character of `content`; at the 2048 the enrichment step allows, the
 * budget ran out inside the reasoning and the answer came back as `""` with
 * `finish_reason: "length"`. The SDK path already sent
 * `thinking: { type: "disabled" }`; the HTTP path the deployment actually
 * uses sent nothing.
 *
 * Per docs.z.ai (thinking-mode guide and chat-completion reference, read
 * 2026-09-02): GLM-4.5 through GLM-5.2 accept `thinking.type = "disabled"`;
 * GLM-5.3 and GLM-5.3-Flash refuse it (error 1210) and take
 * `reasoning_effort: "low"` with thinking enabled instead.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { glmThinkingParams } from "../llm/glm-thinking";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");

describe("glmThinkingParams", () => {
  test("GLM-5.2 and earlier: thinking disabled", () => {
    for (const model of ["glm-5.2", "GLM-5.1", "glm-5", "glm-4.7", "glm-4.5-air"]) {
      expect(glmThinkingParams(model)).toEqual({ thinking: { type: "disabled" } });
    }
  });

  test("GLM-5.3 family: cannot disable, so lowest effort with thinking on", () => {
    for (const model of ["glm-5.3", "glm-5.3-flash", "GLM-5.3"]) {
      expect(glmThinkingParams(model)).toEqual({
        thinking: { type: "enabled" },
        reasoning_effort: "low",
      });
    }
  });

  test("non-GLM models get nothing added to the request", () => {
    for (const model of ["deepseek-v4-pro", "gpt-5.6-luna", "mistral-large", ""]) {
      expect(glmThinkingParams(model)).toEqual({});
    }
  });
});

describe("both zai transports send the thinking parameters", () => {
  const src = readFileSync(join(REPO_ROOT, "src/lib/llm/index.ts"), "utf8");

  test("the OpenAI-compatible HTTP body spreads glmThinkingParams", () => {
    expect(/\.\.\.glmThinkingParams\(/.test(src)).toBe(true);
  });

  test("the SDK path no longer hardcodes a parameter GLM-5.3 rejects", () => {
    expect(/thinking:\s*\{\s*type:\s*"disabled"\s*\}/.test(src)).toBe(false);
  });
});
