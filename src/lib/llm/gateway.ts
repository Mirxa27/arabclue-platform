/**
 * Vercel AI Gateway transport, shared by the platform voice agent and by
 * `generateCompletion`.
 *
 * The gateway is the only AI credential a deployment can hold without an admin
 * round trip: enabling OIDC federation on the Vercel project injects
 * `VERCEL_OIDC_TOKEN` into the runtime environment. Both AI entry points read
 * the same probe and the same model id from here so a deployment can never end
 * up with a working copilot and a dead agent pipeline.
 */

import { embed, gateway, generateText } from "ai";
import type { LLMMessage } from "../guardrails";

/** Live gateway sonnet id (fetched 2026-07-22 from ai-gateway.vercel.sh/v1/models). */
export const GATEWAY_MODEL_ID = "anthropic/claude-sonnet-5";

/** Live gateway embedding id (fetched 2026-08-31 from ai-gateway.vercel.sh/v1/models). */
export const GATEWAY_EMBEDDING_MODEL_ID = "openai/text-embedding-3-small";

/**
 * Read synchronously and never cached: a deploy is the trust boundary, and an
 * admin console must not be able to flip AI transport without one.
 */
export function gatewayAvailable(): boolean {
  return Boolean(
    process.env.AI_GATEWAY_API_KEY?.trim() ||
      process.env.VERCEL_OIDC_TOKEN?.trim() ||
      process.env.AI_GATEWAY_OIDC?.trim()
  );
}

/**
 * Matches the transport contract the other `generateCompletion` branches use,
 * so guardrails, retries, and truncation repair apply unchanged. Throws on
 * failure — the caller's catch classifies it like any other transport error.
 */
export async function callGateway(
  messages: LLMMessage[],
  temperature: number,
  maxTokens: number
): Promise<{ text: string; tokensUsed: number; truncated: boolean }> {
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const turns = messages.filter((m) => m.role !== "system");

  const result = await generateText({
    model: gateway(GATEWAY_MODEL_ID),
    ...(system ? { system } : {}),
    // A prompt of nothing but system text would be rejected as an empty
    // conversation, so it is carried as the opening turn instead.
    messages: turns.length
      ? turns
      : [{ role: "user" as const, content: system }],
    temperature,
    maxOutputTokens: maxTokens,
  });

  return {
    text: result.text,
    tokensUsed: result.usage?.totalTokens ?? 0,
    truncated: result.finishReason === "length",
  };
}

/**
 * Dense embedding for RAG. Throws on failure so `embedText` can report absence
 * rather than substituting a vector the retrieval layer cannot distinguish from
 * a real one.
 */
export async function embedViaGateway(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: gateway.textEmbeddingModel(GATEWAY_EMBEDDING_MODEL_ID),
    value: text,
  });
  return embedding;
}
