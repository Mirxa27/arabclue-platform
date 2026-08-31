import { describe, expect, test } from "bun:test";
import { mapErrorToApiFailure } from "@/lib/api-failure";
import { apiErrorText } from "@/lib/api-failure-message";
import { ProviderUnavailableError } from "@/lib/ai/provider-unavailable";

/**
 * Under real-AI-only every AI surface refuses instead of fabricating, and that
 * refusal reaches the reader through the single mapper in `toErrorResponse`.
 * If it lands in the generic internal bucket, an operator sees "something went
 * wrong" for a condition with an obvious fix: connect a provider.
 */
describe("provider-unavailable reaches the reader as an answerable failure", () => {
  const mapped = mapErrorToApiFailure(
    new ProviderUnavailableError({
      context: "compliance-analyzer:scanCompliance",
      llmFailureKind: "no_provider",
      provider: "openai",
    })
  );

  test("answers 503, not a generic 500", () => {
    expect(mapped.status).toBe(503);
    expect(mapped.body.code).toBe("AI_PROVIDER_UNAVAILABLE");
  });

  test("says what happened in both languages", () => {
    expect(apiErrorText(mapped.body, "en", "fallback")).not.toBe("fallback");
    expect(apiErrorText(mapped.body, "ar", "fallback")).not.toBe("fallback");
    expect(apiErrorText(mapped.body, "ar", "fallback")).not.toBe(
      apiErrorText(mapped.body, "en", "fallback")
    );
  });

  test("leaks no internal breadcrumb to the client", () => {
    const serialized = JSON.stringify(mapped.body);
    expect(serialized).not.toContain("scanCompliance");
    expect(serialized).not.toContain("openai");
  });
});
