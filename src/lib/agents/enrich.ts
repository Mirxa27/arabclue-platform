import { generateCompletion } from "../llm";
import {
  SYSTEM_INGESTION,
  SYSTEM_COMPLIANCE,
  SYSTEM_TECHNICAL,
  SYSTEM_FINANCIAL,
  enrichUserPrompt,
} from "./prompts";

function extractJsonObject(text: string): Record<string, unknown> | null {
  if (!text) return null;
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function enrichJson(
  system: string,
  kind: string,
  payload: unknown,
  engine: "INGESTION" | "COMPLIANCE" | "TECHNICAL" | "FINANCIAL"
): Promise<{ data: Record<string, unknown> | null; provider: string; tokensUsed: number; fallback: boolean }> {
  const result = await generateCompletion(
    [
      { role: "system", content: system },
      { role: "user", content: enrichUserPrompt(kind, payload) },
    ],
    { maxTokens: 2048, temperature: 0.2, engine }
  );
  if (result.fallback || !result.content) {
    return { data: null, provider: result.provider, tokensUsed: result.tokensUsed, fallback: true };
  }
  const data = extractJsonObject(result.content);
  return {
    data,
    provider: result.provider,
    tokensUsed: result.tokensUsed,
    fallback: !data,
  };
}

/** LLM polish for ingestion entities (optional; deterministic parse remains source of truth for numbers) */
export async function enrichIngestionWithAi(payload: unknown) {
  return enrichJson(SYSTEM_INGESTION, "ingestion", payload, "INGESTION");
}

export async function enrichComplianceWithAi(payload: unknown) {
  return enrichJson(SYSTEM_COMPLIANCE, "compliance", payload, "COMPLIANCE");
}

export async function enrichTechnicalWithAi(payload: unknown) {
  return enrichJson(SYSTEM_TECHNICAL, "technical", payload, "TECHNICAL");
}

export async function enrichFinancialWithAi(payload: unknown) {
  return enrichJson(SYSTEM_FINANCIAL, "financial", payload, "FINANCIAL");
}
