/**
 * LLM provider connection metadata and capability inference.
 * Model IDs are never hardcoded — they come from live provider /models APIs
 * (cached per admin connection). Capability defaults use heuristics only.
 */

import { isNonPublicHost } from "@/lib/net-guard";

export const AGENT_ENGINES = [
  "DEFAULT",
  "INGESTION",
  "COMPLIANCE",
  "TECHNICAL",
  "FINANCIAL",
  "DRAFTING",
  "REWRITE",
  "EMBEDDING",
  "LAW",
  "VOICE",
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
  LAW: { en: "Law & Contracts", ar: "القانون والعقود" },
  VOICE: { en: "Voice live (speech-to-speech)", ar: "الصوت المباشر (تحدث إلى تحدث)" },
};

export const LLM_PROVIDER_TYPES = [
  "openai",
  "openai_compatible",
  "azure_openai",
  "ollama",
  "anthropic",
  "mistral",
  "zai",
  "google",
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
    name: "OpenAI Realtime (voice live)",
    provider: "openai",
    apiBase: "https://api.openai.com/v1",
    apiKeyEnvKey: "OPENAI_API_KEY",
    engine: "VOICE",
  },
  {
    name: "Gemini Live (voice live)",
    provider: "google",
    apiBase: "https://generativelanguage.googleapis.com/v1beta",
    apiKeyEnvKey: "GOOGLE_GENERATIVE_AI_API_KEY",
    engine: "VOICE",
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
    case "google":
      return "https://generativelanguage.googleapis.com/v1beta";
    case "openai_compatible":
    case "zai":
      return "";
    default:
      return "";
  }
}

/**
 * Environment variable names an operator may point a provider connection at.
 *
 * A provider row carries an optional `apiKeyEnvKey` so one deployment can hold
 * several credentials for the same vendor (`OPENAI_API_KEY_TEAM_B`). That value
 * is administrator-supplied and is resolved against `process.env`, so without a
 * positive allowlist it reads *any* variable in the process — including
 * `NEXTAUTH_SECRET`, `ARABCLUE_ENC_KEY`, and `DATABASE_URL` — and forwards it as
 * a bearer token to the connection's `apiBase`.
 *
 * This is an allowlist rather than a denylist on purpose: a denylist silently
 * fails to protect every secret added after it was written.
 */
export const PROVIDER_API_KEY_ENV_BASES: readonly string[] = Object.freeze([
  "OPENAI_API_KEY",
  "AZURE_OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "MISTRAL_API_KEY",
  "ZAI_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "GOOGLE_API_KEY",
  "GEMINI_API_KEY",
  "OPENROUTER_API_KEY",
  "GROQ_API_KEY",
  "DEEPSEEK_API_KEY",
]);

/**
 * True when `key` names a provider credential slot.
 *
 * Accepts an exact base name or a base name with a `_SUFFIX`, which is what
 * makes multi-account setups (`ANTHROPIC_API_KEY_EU`) work without opening the
 * whole environment.
 */
export function isAllowedProviderApiKeyEnv(
  key: string | null | undefined
): boolean {
  const candidate = (key ?? "").trim();
  if (!candidate) return false;
  if (candidate !== candidate.toUpperCase()) return false;
  return PROVIDER_API_KEY_ENV_BASES.some(
    (base) => candidate === base || candidate.startsWith(`${base}_`)
  );
}

/**
 * Hosts each canonical provider credential is allowed to reach, derived from
 * `PROVIDER_CONNECTION_TEMPLATES` so the two cannot drift. A `*.` prefix means
 * "this host or any subdomain of it".
 */
const CANONICAL_CREDENTIAL_HOSTS: ReadonlyMap<string, readonly string[]> =
  (() => {
    const hosts = new Map<string, string[]>();
    for (const template of PROVIDER_CONNECTION_TEMPLATES) {
      const envKey = template.apiKeyEnvKey.trim();
      const base = template.apiBase.trim();
      if (!envKey || !base) continue;
      let host: string;
      try {
        host = new URL(base).hostname.toLowerCase();
      } catch {
        continue;
      }
      const existing = hosts.get(envKey) ?? [];
      if (!existing.includes(host)) existing.push(host);
      hosts.set(envKey, existing);
    }
    // Credentials with no connection template of their own: the Gemini key
    // aliases, and Azure, whose host is per-tenant rather than fixed.
    hosts.set("GOOGLE_API_KEY", ["generativelanguage.googleapis.com"]);
    hosts.set("GEMINI_API_KEY", ["generativelanguage.googleapis.com"]);
    hosts.set("AZURE_OPENAI_API_KEY", ["*.openai.azure.com"]);
    return hosts;
  })();

function hostMatchesRule(host: string, rule: string): boolean {
  return rule.startsWith("*.")
    ? host.endsWith(rule.slice(1))
    : host === rule;
}

/**
 * Refuse to send a provider credential anywhere but that credential's vendor.
 *
 * `apiBase` is administrator-supplied and the resolved credential is attached to
 * every request made against it — as a bearer token for OpenAI-compatible
 * gateways, and as a URL query parameter for Google. Without this check,
 * `{ provider: "openai", apiBase: "https://attacker.example" }` resolves the
 * platform's real `OPENAI_API_KEY` and hands it to the attacker's host.
 *
 * A canonical credential (`OPENAI_API_KEY`) is pinned to its vendor origin. A
 * suffixed operator credential (`OPENAI_API_KEY_TEAM_B`) is a deliberate
 * bring-your-own-gateway slot, so it is allowed any public HTTPS host — but
 * still not loopback, private, link-local, or internal-suffix hosts, which is
 * where SSRF against the deployment's own network would land.
 *
 * This is a syntactic guard over operator config, layered on top of the ADMIN
 * role gate. It does not defeat DNS rebinding: an allowed hostname that resolves
 * to a private address at connect time still connects. Egress filtering is the
 * control for that.
 *
 * @param provider Supplies the credential when `apiKeyEnvKey` is absent, which
 *   is what `resolveProviderApiKey` falls back to in that case.
 * @throws when the credential must not be sent to `apiBase`.
 */
export function assertProviderCredentialOrigin(opts: {
  apiBase: string | null | undefined;
  apiKeyEnvKey: string | null | undefined;
  provider?: string | null;
}): void {
  const base = (opts.apiBase ?? "").trim();
  // No custom base means the canonical default is used; nothing to validate.
  if (!base) return;

  const envKey =
    (opts.apiKeyEnvKey ?? "").trim() ||
    (opts.provider ? defaultApiKeyEnvKey(opts.provider) : "");
  // No credential resolves for this connection, so none can be leaked.
  if (!envKey) return;

  let url: URL;
  try {
    url = new URL(base);
  } catch {
    throw new Error(`API Base URL is not a valid URL: ${base}`);
  }

  if (url.protocol !== "https:") {
    throw new Error(
      `API Base URL must use https when a credential is attached (got ${url.protocol.replace(":", "")}).`
    );
  }

  const host = url.hostname.toLowerCase();
  if (isNonPublicHost(host)) {
    throw new Error(
      `API Base URL must be a public host; "${host}" is loopback, private, or internal.`
    );
  }

  // A suffixed operator credential has no canonical origin, so the public-host
  // check above is the whole rule for it.
  const allowed = CANONICAL_CREDENTIAL_HOSTS.get(envKey);
  if (allowed && !allowed.some((rule) => hostMatchesRule(host, rule))) {
    throw new Error(
      `${envKey} may only be sent to ${allowed.join(" or ")}, not "${host}". ` +
        `Use a suffixed credential (for example ${envKey}_GATEWAY) for a custom endpoint.`
    );
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
    case "google":
      return "GOOGLE_GENERATIVE_AI_API_KEY";
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
  // Already versioned OpenAI-compatible roots (/v1, /v4, Azure deployments…).
  // Z.AI coding paas uses …/paas/v4 — do NOT append another /v1.
  if (/\/v\d+$/i.test(base) || /\/openai\/deployments/i.test(base)) {
    return base;
  }
  if (/anthropic\.com/i.test(base)) {
    return base;
  }
  return `${base}/v1`;
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

const ENGINE_SET = new Set<string>(AGENT_ENGINES);

/** Normalize a list of engine ids; always returns at least ["DEFAULT"]. */
export function normalizeEngines(
  input: unknown,
  fallbackPrimary?: string | null
): AgentEngine[] {
  const raw: string[] = [];
  if (Array.isArray(input)) {
    for (const v of input) {
      if (typeof v === "string" && v.trim()) raw.push(v.trim().toUpperCase());
    }
  } else if (typeof input === "string" && input.trim()) {
    try {
      const parsed = JSON.parse(input);
      if (Array.isArray(parsed)) {
        for (const v of parsed) {
          if (typeof v === "string" && v.trim())
            raw.push(v.trim().toUpperCase());
        }
      }
    } catch {
      raw.push(input.trim().toUpperCase());
    }
  }
  if (
    raw.length === 0 &&
    typeof fallbackPrimary === "string" &&
    fallbackPrimary.trim()
  ) {
    raw.push(fallbackPrimary.trim().toUpperCase());
  }
  const out: AgentEngine[] = [];
  const seen = new Set<string>();
  for (const id of raw) {
    if (!ENGINE_SET.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id as AgentEngine);
  }
  return out.length > 0 ? out : ["DEFAULT"];
}

export function parseProviderEngines(row: {
  engine?: string | null;
  enginesJson?: string | null;
}): AgentEngine[] {
  return normalizeEngines(row.enginesJson, row.engine);
}

export function serializeEngines(engines: AgentEngine[]): string {
  return JSON.stringify(normalizeEngines(engines));
}

export function providerServesEngine(
  row: { engine?: string | null; enginesJson?: string | null },
  engine: string
): boolean {
  const target = engine.toUpperCase();
  return parseProviderEngines(row).some((e) => e === target);
}
