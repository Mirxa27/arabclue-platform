/**
 * LLM provider connection metadata and capability inference.
 * Model IDs are never hardcoded — they come from live provider /models APIs
 * (cached per admin connection). Capability defaults use heuristics only.
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
  ownedBy?: string;
  displayName?: string;
  source?: string;
};

/** Connection templates only — no model IDs (models are auto-fetched). */
export type ProviderConnectionTemplate = {
  name: string;
  provider: LlmProviderType | string;
  apiBase: string;
  apiKeyEnvKey: string;
  engine: AgentEngine;
};

export const PROVIDER_CONNECTION_TEMPLATES: ProviderConnectionTemplate[] = [
  {
    name: "OpenAI",
    provider: "openai",
    apiBase: "https://api.openai.com/v1",
    apiKeyEnvKey: "OPENAI_API_KEY",
    engine: "DEFAULT",
  },
  {
    name: "OpenAI Embeddings",
    provider: "openai",
    apiBase: "https://api.openai.com/v1",
    apiKeyEnvKey: "OPENAI_API_KEY",
    engine: "EMBEDDING",
  },
  {
    name: "Anthropic",
    provider: "anthropic",
    apiBase: "https://api.anthropic.com",
    apiKeyEnvKey: "ANTHROPIC_API_KEY",
    engine: "DRAFTING",
  },
  {
    name: "Mistral",
    provider: "mistral",
    apiBase: "https://api.mistral.ai/v1",
    apiKeyEnvKey: "MISTRAL_API_KEY",
    engine: "DEFAULT",
  },
  {
    name: "OpenAI-Compatible Gateway",
    provider: "openai_compatible",
    apiBase: "",
    apiKeyEnvKey: "OPENAI_API_KEY",
    engine: "DEFAULT",
  },
  {
    name: "Ollama (local)",
    provider: "ollama",
    apiBase: "http://127.0.0.1:11434/v1",
    apiKeyEnvKey: "",
    engine: "DEFAULT",
  },
  {
    name: "OpenRouter",
    provider: "openai_compatible",
    apiBase: "https://openrouter.ai/api/v1",
    apiKeyEnvKey: "OPENROUTER_API_KEY",
    engine: "DEFAULT",
  },
  {
    name: "Groq",
    provider: "openai_compatible",
    apiBase: "https://api.groq.com/openai/v1",
    apiKeyEnvKey: "GROQ_API_KEY",
    engine: "DEFAULT",
  },
  {
    name: "DeepSeek",
    provider: "openai_compatible",
    apiBase: "https://api.deepseek.com/v1",
    apiKeyEnvKey: "DEEPSEEK_API_KEY",
    engine: "DEFAULT",
  },
  {
    name: "Z.AI (OpenAI-compatible)",
    provider: "zai",
    apiBase: "",
    apiKeyEnvKey: "ZAI_API_KEY",
    engine: "DEFAULT",
  },
];

/** @deprecated use PROVIDER_CONNECTION_TEMPLATES */
export const AI_PROVIDER_PRESETS = PROVIDER_CONNECTION_TEMPLATES;

export type RemoteModelMeta = {
  id?: string;
  name?: string;
  display_name?: string;
  owned_by?: string;
  context_window?: number;
  context_length?: number;
  max_model_len?: number;
  max_tokens?: number;
  max_output_tokens?: number;
  max_completion_tokens?: number;
  supports_vision?: boolean;
  supports_json_mode?: boolean;
  supports_tools?: boolean;
  pricing?: { prompt?: number; completion?: number };
  architecture?: { modality?: string; input_modalities?: string[] };
};

/**
 * Infer capability defaults from a model id / remote metadata.
 * Uses heuristics only — never a hardcoded model catalog.
 */
export function inferModelCapabilities(
  modelId: string,
  meta?: RemoteModelMeta | null
): ModelCapability {
  const id = (modelId || meta?.id || "").trim();
  const lower = id.toLowerCase();
  const isEmbed = /embed|embedding/.test(lower);
  const modality = [
    meta?.architecture?.modality ?? "",
    ...(meta?.architecture?.input_modalities ?? []),
  ]
    .join(" ")
    .toLowerCase();
  const supportsVision =
    meta?.supports_vision === true ||
    /vision|vl\b|pixtral|image|multimodal/.test(lower) ||
    /image|vision/.test(modality);
  const contextWindow =
    meta?.context_window ??
    meta?.context_length ??
    meta?.max_model_len ??
    (isEmbed ? 8191 : /claude|sonnet|opus|haiku/.test(lower) ? 200000 : 128000);
  const maxTokens =
    meta?.max_output_tokens ??
    meta?.max_completion_tokens ??
    meta?.max_tokens ??
    (isEmbed ? contextWindow : Math.min(contextWindow, 16384));

  const inputCost =
    meta?.pricing?.prompt != null
      ? Number(meta.pricing.prompt) * 1000
      : undefined;
  const outputCost =
    meta?.pricing?.completion != null
      ? Number(meta.pricing.completion) * 1000
      : undefined;

  return {
    id,
    displayName: meta?.display_name || meta?.name,
    ownedBy: meta?.owned_by,
    contextWindow: Number(contextWindow) || (isEmbed ? 8191 : 128000),
    maxTokens: Number(maxTokens) || (isEmbed ? 8191 : 8192),
    supportsVision: Boolean(supportsVision),
    supportsJsonMode:
      meta?.supports_json_mode ??
      (!isEmbed && !/whisper|tts|dall-e|imagen|audio/.test(lower)),
    supportsTools:
      meta?.supports_tools ??
      (!isEmbed && !/whisper|tts|dall-e|imagen|audio|embed/.test(lower)),
    inputCostPer1k: inputCost,
    outputCostPer1k: outputCost,
  };
}

/** Enrich a remote model list entry with inferred capabilities. */
export function enrichRemoteModel(
  id: string,
  meta?: RemoteModelMeta | null,
  source = "remote"
): ModelCapability {
  return { ...inferModelCapabilities(id, meta), source };
}

export function parseModelsCache(
  raw: string | null | undefined
): ModelCapability[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v
      .map((m) => {
        if (!m || typeof m !== "object") return null;
        const id = String((m as ModelCapability).id || "").trim();
        if (!id) return null;
        return m as ModelCapability;
      })
      .filter((m): m is ModelCapability => Boolean(m));
  } catch {
    return [];
  }
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
    case "zai":
      return "";
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
      return "";
  }
}

/** Normalize base URL so chat/completions paths resolve correctly. */
export function normalizeOpenAiBase(apiBase: string | null | undefined): string {
  let base = (apiBase || "").trim().replace(/\/$/, "");
  if (!base) return "";
  if (!base.endsWith("/v1") && !base.includes("/openai/deployments")) {
    if (!/anthropic\.com/i.test(base)) {
      base = `${base}/v1`;
    }
  }
  return base;
}

export function requireConfiguredModelId(modelId: string | null | undefined): string {
  const id = (modelId ?? "").trim();
  if (!id) {
    throw new Error(
      "Provider has no model selected. Admin must Fetch models and choose one."
    );
  }
  return id;
}
