/**
 * Resolve LanguageModel for the platform voice agent.
 * Prefer Vercel AI Gateway when configured; otherwise use the active tenant provider.
 * Model IDs are never hardcoded from memory — gateway uses the live catalog id,
 * tenant providers use the admin-selected modelId only.
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { gateway } from "ai";
import { resolveProviderApiKey } from "@/lib/env-settings";
import { getProviderForEngine } from "@/lib/llm";
import {
  normalizeOpenAiBase,
  requireConfiguredModelId,
} from "@/lib/llm/model-catalog";

/** Live gateway sonnet id (fetched 2026-07-22 from ai-gateway.vercel.sh/v1/models). */
const GATEWAY_DEFAULT_MODEL = "anthropic/claude-sonnet-5";

function gatewayAvailable(): boolean {
  return Boolean(
    process.env.AI_GATEWAY_API_KEY?.trim() ||
      process.env.VERCEL_OIDC_TOKEN?.trim() ||
      process.env.AI_GATEWAY_OIDC?.trim()
  );
}

export async function resolvePlatformAgentModel() {
  if (gatewayAvailable()) {
    return {
      model: gateway(GATEWAY_DEFAULT_MODEL),
      providerLabel: "ai-gateway",
      modelId: GATEWAY_DEFAULT_MODEL,
    };
  }

  const provider = await getProviderForEngine("DEFAULT");
  if (!provider) {
    throw new Error(
      "No active AI provider. Configure one under Admin → AI Providers, or set AI_GATEWAY_API_KEY."
    );
  }

  const modelId = requireConfiguredModelId(provider.modelId);
  const pid = provider.provider.toLowerCase();
  const key = await resolveProviderApiKey(
    provider.provider,
    provider.apiKeyEnvKey
  );

  if (pid === "anthropic") {
    if (!key) {
      throw new Error("Anthropic API key missing for platform agent.");
    }
    const anthropic = createAnthropic({ apiKey: key });
    return {
      model: anthropic(modelId),
      providerLabel: provider.provider,
      modelId,
    };
  }

  if (
    pid === "openai" ||
    pid === "openai_compatible" ||
    pid === "ollama" ||
    pid === "azure_openai" ||
    pid === "mistral" ||
    pid === "zai"
  ) {
    if (!key && pid !== "ollama") {
      throw new Error(
        `API key missing for ${provider.provider} (${provider.apiKeyEnvKey || "default env"}).`
      );
    }
    const baseURL =
      normalizeOpenAiBase(
        provider.apiBase ||
          (pid === "mistral"
            ? "https://api.mistral.ai/v1"
            : pid === "ollama"
              ? "http://127.0.0.1:11434/v1"
              : "https://api.openai.com/v1")
      ) || undefined;

    const openai = createOpenAI({
      apiKey: key || "ollama",
      baseURL,
    });
    return {
      model: openai(modelId),
      providerLabel: provider.provider,
      modelId,
    };
  }

  throw new Error(
    `Provider type "${provider.provider}" is not supported for the platform agent. Use OpenAI-compatible, Anthropic, or AI Gateway.`
  );
}
