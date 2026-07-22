/**
 * Agent engines that can bind a dedicated LLM provider config.
 * DEFAULT is the fallback for any engine without an active assignment.
 */
export const AGENT_ENGINES = [
  "DEFAULT",
  "INGESTION",
  "COMPLIANCE",
  "TECHNICAL",
  "FINANCIAL",
  "DRAFTING",
  "REWRITE",
  "EMBEDDING",
] as const;

export type AgentEngine = (typeof AGENT_ENGINES)[number];

export const AGENT_ENGINE_LABELS: Record<
  AgentEngine,
  { en: string; ar: string }
> = {
  DEFAULT: { en: "Default (fallback)", ar: "افتراضي (احتياطي)" },
  INGESTION: { en: "Ingestion & Parser", ar: "الاستيعاب والتحليل" },
  COMPLIANCE: { en: "Compliance & Regulatory", ar: "الامتثال والتنظيم" },
  TECHNICAL: { en: "Technical Architect", ar: "المعماري التقني" },
  FINANCIAL: { en: "Financial & Qualification", ar: "المالي والتأهيل" },
  DRAFTING: { en: "Proposal Drafting", ar: "صياغة العطاء" },
  REWRITE: { en: "Section Rewrite", ar: "إعادة صياغة الأقسام" },
  EMBEDDING: { en: "Embeddings / RAG", ar: "التضمين / RAG" },
};

export const LLM_PROVIDER_TYPES = [
  "openai",
  "openai_compatible",
  "azure_openai",
  "ollama",
  "anthropic",
  "mistral",
  "zai",
] as const;

export type LlmProviderType = (typeof LLM_PROVIDER_TYPES)[number];

export type ModelCapability = {
  id: string;
  contextWindow: number;
  maxTokens: number;
  supportsVision: boolean;
  supportsJsonMode: boolean;
  supportsTools: boolean;
  inputCostPer1k?: number;
  outputCostPer1k?: number;
};

/** Known model defaults — applied when admin selects a model id. */
const KNOWN_MODELS: ModelCapability[] = [
  { id: "gpt-4o", contextWindow: 128000, maxTokens: 16384, supportsVision: true, supportsJsonMode: true, supportsTools: true, inputCostPer1k: 0.019, outputCostPer1k: 0.076 },
  { id: "gpt-4o-mini", contextWindow: 128000, maxTokens: 16384, supportsVision: true, supportsJsonMode: true, supportsTools: true, inputCostPer1k: 0.0006, outputCostPer1k: 0.0024 },
  { id: "gpt-4.1", contextWindow: 1047576, maxTokens: 32768, supportsVision: true, supportsJsonMode: true, supportsTools: true },
  { id: "gpt-4.1-mini", contextWindow: 1047576, maxTokens: 32768, supportsVision: true, supportsJsonMode: true, supportsTools: true },
  { id: "o4-mini", contextWindow: 200000, maxTokens: 100000, supportsVision: true, supportsJsonMode: true, supportsTools: true },
  { id: "o3-mini", contextWindow: 200000, maxTokens: 100000, supportsVision: false, supportsJsonMode: true, supportsTools: true },
  { id: "text-embedding-3-small", contextWindow: 8191, maxTokens: 8191, supportsVision: false, supportsJsonMode: false, supportsTools: false },
  { id: "text-embedding-3-large", contextWindow: 8191, maxTokens: 8191, supportsVision: false, supportsJsonMode: false, supportsTools: false },
  { id: "claude-3-5-sonnet", contextWindow: 200000, maxTokens: 8192, supportsVision: true, supportsJsonMode: true, supportsTools: true, inputCostPer1k: 0.026, outputCostPer1k: 0.131 },
  { id: "claude-3-5-haiku", contextWindow: 200000, maxTokens: 8192, supportsVision: true, supportsJsonMode: true, supportsTools: true },
  { id: "claude-sonnet-4", contextWindow: 200000, maxTokens: 64000, supportsVision: true, supportsJsonMode: true, supportsTools: true },
  { id: "mistral-large", contextWindow: 128000, maxTokens: 8192, supportsVision: false, supportsJsonMode: true, supportsTools: true },
  { id: "mistral-small", contextWindow: 32000, maxTokens: 8192, supportsVision: false, supportsJsonMode: true, supportsTools: true },
  { id: "pixtral", contextWindow: 128000, maxTokens: 8192, supportsVision: true, supportsJsonMode: true, supportsTools: true },
  { id: "glm-4", contextWindow: 128000, maxTokens: 8192, supportsVision: false, supportsJsonMode: true, supportsTools: false },
  { id: "deepseek-chat", contextWindow: 64000, maxTokens: 8192, supportsVision: false, supportsJsonMode: true, supportsTools: true },
  { id: "deepseek-reasoner", contextWindow: 64000, maxTokens: 8192, supportsVision: false, supportsJsonMode: true, supportsTools: false },
  { id: "llama-3.3", contextWindow: 128000, maxTokens: 8192, supportsVision: false, supportsJsonMode: true, supportsTools: true },
  { id: "llama3.2-vision", contextWindow: 128000, maxTokens: 8192, supportsVision: true, supportsJsonMode: false, supportsTools: false },
  { id: "qwen2.5", contextWindow: 128000, maxTokens: 8192, supportsVision: false, supportsJsonMode: true, supportsTools: true },
  { id: "qwen2-vl", contextWindow: 128000, maxTokens: 8192, supportsVision: true, supportsJsonMode: true, supportsTools: false },
  { id: "gemma2", contextWindow: 8192, maxTokens: 8192, supportsVision: false, supportsJsonMode: true, supportsTools: false },
];

function matchKnown(modelId: string): ModelCapability | null {
  const id = modelId.toLowerCase();
  // exact / prefix / includes, prefer longest match
  let best: ModelCapability | null = null;
  for (const m of KNOWN_MODELS) {
    const mid = m.id.toLowerCase();
    if (id === mid || id.includes(mid) || mid.includes(id)) {
      if (!best || m.id.length > best.id.length) best = m;
    }
  }
  return best;
}

/** Infer context window, vision, token limits from model id. */
export function inferModelCapabilities(modelId: string): ModelCapability {
  const known = matchKnown(modelId);
  if (known) {
    return { ...known, id: modelId };
  }
  const id = modelId.toLowerCase();
  const supportsVision =
    /vision|vl|gpt-4o|gpt-4\.1|claude-3|pixtral|gemini/.test(id);
  const isEmbed = /embed|embedding/.test(id);
  return {
    id: modelId,
    contextWindow: isEmbed ? 8191 : 128000,
    maxTokens: isEmbed ? 8191 : 8192,
    supportsVision,
    supportsJsonMode: !isEmbed,
    supportsTools: !isEmbed && !/embed/.test(id),
  };
}

/** Enrich a remote model list entry with catalog capabilities. */
export function enrichRemoteModel(id: string): ModelCapability & {
  ownedBy?: string;
} {
  const caps = inferModelCapabilities(id);
  return caps;
}

export function defaultApiBase(provider: string): string {
  switch (provider) {
    case "openai":
      return "https://api.openai.com/v1";
    case "azure_openai":
      return "";
    case "anthropic":
      return "https://api.anthropic.com";
    case "mistral":
      return "https://api.mistral.ai/v1";
    case "ollama":
      return "http://127.0.0.1:11434/v1";
    case "openai_compatible":
      return "https://api.openai.com/v1";
    default:
      return "";
  }
}

export function defaultApiKeyEnvKey(provider: string): string {
  switch (provider) {
    case "openai":
    case "openai_compatible":
      return "OPENAI_API_KEY";
    case "azure_openai":
      return "AZURE_OPENAI_API_KEY";
    case "anthropic":
      return "ANTHROPIC_API_KEY";
    case "mistral":
      return "MISTRAL_API_KEY";
    case "zai":
      return "ZAI_API_KEY";
    case "ollama":
      return "";
    default:
      return "OPENAI_API_KEY";
  }
}

/** Normalize base URL so chat/completions paths resolve correctly. */
export function normalizeOpenAiBase(apiBase: string | null | undefined): string {
  let base = (apiBase || "https://api.openai.com/v1").trim().replace(/\/$/, "");
  if (!base.endsWith("/v1") && !base.includes("/openai/deployments")) {
    // Ollama & many gateways accept /v1 suffix
    if (!/anthropic\.com/i.test(base)) {
      base = `${base}/v1`;
    }
  }
  return base;
}
