import { describe, expect, test } from "bun:test";
import {
  providerNeedsApiKey,
  summarizeAiCredential,
} from "@/lib/ai-credential-readiness";

/**
 * `llmProviders active:N` counts rows, not reachability. A provider row whose
 * credential no longer resolves keeps counting as active while every
 * completion degrades to a fallback, so readiness has to resolve a key.
 */
describe("AI credential readiness", () => {
  test("reports ready when the default engine resolves a credential", () => {
    const result = summarizeAiCredential({
      hasActiveProvider: true,
      needsApiKey: true,
      apiKeyResolved: true,
    });

    expect(result.ok).toBe(true);
    expect(result.detail).toBe("credential_resolved");
  });

  test("reports not ready when an active provider resolves no credential", () => {
    const result = summarizeAiCredential({
      hasActiveProvider: true,
      needsApiKey: true,
      apiKeyResolved: false,
    });

    expect(result.ok).toBe(false);
    expect(result.detail).toBe("credential_unresolved");
  });

  test("reports not ready when no provider is active at all", () => {
    const result = summarizeAiCredential({
      hasActiveProvider: false,
      needsApiKey: false,
      apiKeyResolved: false,
    });

    expect(result.ok).toBe(false);
    expect(result.detail).toBe("no_active_provider");
  });

  test("reports ready for a local provider that needs no credential", () => {
    const result = summarizeAiCredential({
      hasActiveProvider: true,
      needsApiKey: false,
      apiKeyResolved: false,
    });

    expect(result.ok).toBe(true);
    expect(result.detail).toBe("local_provider");
  });

  test("only the locally hosted provider is exempt from needing a key", () => {
    expect(providerNeedsApiKey("ollama")).toBe(false);
    expect(providerNeedsApiKey(" Ollama ")).toBe(false);
    expect(providerNeedsApiKey("openai")).toBe(true);
    expect(providerNeedsApiKey("openai_compatible")).toBe(true);
  });

  test("never names the provider or echoes the credential", () => {
    const details = [
      summarizeAiCredential({
        hasActiveProvider: true,
        needsApiKey: true,
        apiKeyResolved: true,
      }).detail,
      summarizeAiCredential({
        hasActiveProvider: true,
        needsApiKey: true,
        apiKeyResolved: false,
      }).detail,
    ];

    for (const detail of details) {
      expect(detail).not.toContain("sk-");
      expect(detail).not.toContain("openai");
      expect(detail).not.toContain("API_KEY");
    }
  });
});
