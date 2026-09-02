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
  requireConfiguredModelId,
  type AgentEngine,
} from "@/lib/llm/model-catalog";
import {
  isOpenAiCompatibleChatProvider,
  resolveOpenAiCompatibleTarget,
} from "@/lib/llm/provider-wire";
import { GATEWAY_MODEL_ID, gatewayAvailable } from "@/lib/llm/gateway";

/**
 * `engine` names the kind of work, so an admin who configured a connection for
 * it in Admin → AI Providers actually gets used. `getProviderForEngine` already
 * falls back to DEFAULT and then to any active provider, so naming an engine
 * can only narrow the choice, never leave a caller without one.
 *
 * The gateway branch is engine-blind by design: it is one credential and one
 * catalogue id, and a deployment running on it has no per-engine connections to
 * honour in the first place.
 */
export async function resolvePlatformAgentModel(
  engine: AgentEngine = "DEFAULT"
) {
  if (gatewayAvailable()) {
    return {
      model: gateway(GATEWAY_MODEL_ID),
      providerLabel: "ai-gateway",
      modelId: GATEWAY_MODEL_ID,
    };
  }

  const provider = await getProviderForEngine(engine);
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

  if (isOpenAiCompatibleChatProvider(pid)) {
    if (!key && pid !== "ollama") {
      throw new Error(
        `API key missing for ${provider.provider} (${provider.apiKeyEnvKey || "default env"}).`
      );
    }
    const target = resolveOpenAiCompatibleTarget(provider);
    const openai = createOpenAI({
      apiKey: key || "ollama",
      baseURL: target.base || undefined,
      // Azure key auth is the `api-key` header; the SDK only sets Authorization.
      headers: pid === "azure_openai" && key ? { "api-key": key } : undefined,
    });
    // `openai(id)` is the Responses API in this SDK version. OpenAI and Azure
    // OpenAI v1 serve it; Gemini's compat layer, Bedrock, DeepSeek, Groq,
    // Mistral, Z.AI and Ollama document /chat/completions only.
    const servesResponsesApi = pid === "openai" || pid === "azure_openai";
    const wireModelId = requireConfiguredModelId(target.modelId);
    return {
      model: servesResponsesApi ? openai(wireModelId) : openai.chat(wireModelId),
      providerLabel: provider.provider,
      modelId: wireModelId,
    };
  }

  throw new Error(
    `Provider type "${provider.provider}" is not supported for the platform agent. Use OpenAI-compatible, Anthropic, or AI Gateway.`
  );
}
