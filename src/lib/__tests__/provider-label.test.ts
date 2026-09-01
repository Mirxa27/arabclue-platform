/**
 * Provider ids are storage keys, not something to put in front of a user.
 *
 * Observed on production `/app` on 2026-09-01, both on the same screen:
 *
 *   header chip : "openai · gpt-realtime-2.1-mini"
 *   session foot: "OpenAI · openai"
 *
 * The second is the same fact printed twice, because
 * `src/lib/agents/platform/realtime.ts:68-69` sets `providerLabel` from the row
 * `provider` column ("openai") and `connectionName` from the row `name`
 * ("OpenAI"), and the footer joined them with a separator as if they were
 * different things.
 */

import { describe, expect, test } from "bun:test";
import { providerDisplayName } from "../ai/provider-label";

describe("providerDisplayName", () => {
  test("the providers the schema names get real capitalisation", () => {
    // prisma/schema.prisma:613 — zai | openai | anthropic | mistral |
    // openai_compatible | ollama | azure_openai
    expect(providerDisplayName("openai")).toBe("OpenAI");
    expect(providerDisplayName("anthropic")).toBe("Anthropic");
    expect(providerDisplayName("azure_openai")).toBe("Azure OpenAI");
    expect(providerDisplayName("zai")).toBe("Z.ai");
  });

  test("an unknown provider is still presentable, never raw", () => {
    // New rows land in the DB without a code change, so the fallback has to be
    // good enough to ship rather than a reason to add a case.
    expect(providerDisplayName("deepseek")).toBe("Deepseek");
    expect(providerDisplayName("some_new_provider")).toBe("Some New Provider");
  });

  test("case and padding in the stored value do not leak through", () => {
    expect(providerDisplayName("  OpenAI  ")).toBe("OpenAI");
    expect(providerDisplayName("OPENAI")).toBe("OpenAI");
  });

  test("an empty value yields nothing to render, not a stray separator", () => {
    expect(providerDisplayName("")).toBe("");
    expect(providerDisplayName("   ")).toBe("");
  });

  test("a connection name that is only the provider spelt out is a duplicate", () => {
    // This is the exact "OpenAI · openai" case: compare on the display name, not
    // on the raw strings, or the duplication survives.
    expect(providerDisplayName("OpenAI")).toBe(providerDisplayName("openai"));
  });
});
