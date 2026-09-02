/**
 * Live provider model list fetcher — never returns a hardcoded catalog.
 */

import { resolveProviderApiKey } from "../env-settings";
import {
  assertProviderCredentialOrigin,
  defaultApiBase,
  defaultApiKeyEnvKey,
  enrichRemoteModel,
  type ModelCapability,
  type RemoteModelMeta,
} from "./model-catalog";
import { providerAuthHeaders, resolveOpenAiCompatibleTarget } from "./provider-wire";

export type FetchModelsResult = {
  models: ModelCapability[];
  source: string;
  fetchedAt: string;
};

function sortModelIds(ids: string[]): string[] {
  return [...ids].sort((a, b) => {
    const score = (id: string) => {
      const l = id.toLowerCase();
      if (/embed/.test(l)) return 2;
      if (/instruct|chat|gpt|claude|mistral|llama|qwen|deepseek|glm|sonnet|opus|haiku/.test(l))
        return 0;
      return 1;
    };
    return score(a) - score(b) || a.localeCompare(b);
  });
}

function extractModelsFromPayload(data: unknown): RemoteModelMeta[] {
  if (!data || typeof data !== "object") return [];
  const root = data as Record<string, unknown>;
  const list = (root.data ?? root.models ?? root.items ?? data) as unknown;
  if (!Array.isArray(list)) return [];
  return list.filter((m) => m && typeof m === "object") as RemoteModelMeta[];
}

async function fetchOpenAiCompatibleModels(
  apiBase: string | null,
  apiKey: string | null,
  provider: string
): Promise<ModelCapability[]> {
  if (!apiBase && !defaultApiBase(provider)) {
    throw new Error(
      "API Base URL is required to auto-fetch models for this provider"
    );
  }
  if (!apiKey && provider !== "ollama") {
    throw new Error(
      "API key missing — configure it in Env Settings first"
    );
  }
  // Same root the chat transport dials (Azure /openai/v1, Bedrock regional
  // host, Gemini compat…), so the list an admin picks from is the list that
  // endpoint will actually serve.
  const { base } = resolveOpenAiCompatibleTarget({ provider, apiBase, modelId: null });

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...providerAuthHeaders(provider, apiKey),
  };

  let res: Response;
  try {
    res = await fetch(`${base}/models`, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    });
  } catch (err) {
    throw new Error(
      `Cannot reach ${base}/models (${err instanceof Error ? err.message : "network error"}). Check API Base and outbound network.`
    );
  }
  if (!res.ok) {
    // The upstream body is not echoed: it is attacker-influenced text on a
    // failure path that an administrator reads. The status is what diagnoses
    // the connection (401 bad key, 404 wrong base).
    throw new Error(
      `${provider} models HTTP ${res.status}. Verify the API Base URL and that the API key is valid for this provider.`
    );
  }
  const data = await res.json();
  const metas = extractModelsFromPayload(data);
  const ids = sortModelIds(
    metas
      .map((m) => m.id || m.name || m.display_name)
      .filter((id): id is string => Boolean(id && String(id).trim()))
      .map((id) => String(id).trim())
  );
  if (ids.length === 0) {
    throw new Error("Provider returned an empty model list");
  }
  const byId = new Map(
    metas.map((m) => [String(m.id || m.name || m.display_name || ""), m])
  );
  return ids.map((id) => enrichRemoteModel(id, byId.get(id), "remote"));
}

async function fetchAnthropicModels(apiKey: string): Promise<ModelCapability[]> {
  const res = await fetch("https://api.anthropic.com/v1/models", {
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Anthropic models HTTP ${res.status}`);
  }
  const data = await res.json();
  const metas = extractModelsFromPayload(data);
  const ids = sortModelIds(
    metas
      .map((m) => m.id)
      .filter((id): id is string => Boolean(id && String(id).trim()))
      .map((id) => String(id).trim())
  );
  if (ids.length === 0) {
    throw new Error("Anthropic returned an empty model list");
  }
  const byId = new Map(metas.map((m) => [String(m.id || ""), m]));
  return ids.map((id) => enrichRemoteModel(id, byId.get(id), "anthropic"));
}

/**
 * Google Generative Language models list (includes Live-capable ids when published).
 */
async function fetchGoogleModels(
  apiBase: string | null,
  apiKey: string
): Promise<ModelCapability[]> {
  // A chat row points at the OpenAI-compat root (…/v1beta/openai); the model
  // list comes from the native endpoint one level up, which also returns the
  // Live-capable ids the VOICE engine filters for.
  const base = (apiBase || defaultApiBase("google"))
    .replace(/\/+$/, "")
    .replace(/\/openai$/i, "");
  const url = `${base}/models?key=${encodeURIComponent(apiKey)}&pageSize=200`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    });
  } catch (err) {
    throw new Error(
      `Cannot reach Google models API (${err instanceof Error ? err.message : "network error"}).`
    );
  }
  if (!res.ok) {
    throw new Error(
      `Google models HTTP ${res.status}. Verify GOOGLE_GENERATIVE_AI_API_KEY is valid.`
    );
  }
  const data = await res.json();
  const metas = extractModelsFromPayload(data).map((m) => {
    const name = String(m.name || m.id || m.display_name || "");
    // Google returns "models/gemini-…" — normalize to bare model id
    const id = name.replace(/^models\//, "");
    return { ...m, id };
  });
  const ids = sortModelIds(
    metas
      .map((m) => m.id)
      .filter((id): id is string => Boolean(id && String(id).trim()))
      .map((id) => String(id).trim())
  );
  if (ids.length === 0) {
    throw new Error("Google returned an empty model list");
  }
  const byId = new Map(metas.map((m) => [String(m.id || ""), m]));
  return ids.map((id) => enrichRemoteModel(id, byId.get(id), "google"));
}

/**
 * Prefer live/realtime-capable model ids for the VOICE engine list.
 * Still only from the live remote catalog — never invents ids.
 */
export function preferVoiceLiveModels(
  models: ModelCapability[]
): ModelCapability[] {
  const live = models.filter((m) =>
    /realtime|live|native-audio|voice/i.test(m.id)
  );
  return live.length > 0 ? live : models;
}

/**
 * Fetch live model list from the provider API.
 * Never falls back to a hardcoded catalog.
 */
export async function fetchLiveProviderModels(opts: {
  provider: string;
  apiBase?: string | null;
  apiKeyEnvKey?: string | null;
  engine?: string | null;
}): Promise<FetchModelsResult> {
  const provider = (opts.provider || "openai").toLowerCase();
  const keyEnv = opts.apiKeyEnvKey || defaultApiKeyEnvKey(provider);
  // Before any credential is resolved, let alone dispatched: `apiBase` is
  // administrator-supplied and the key rides along on every request to it.
  assertProviderCredentialOrigin({
    apiBase: opts.apiBase,
    apiKeyEnvKey: keyEnv,
    provider,
  });
  const key = await resolveProviderApiKey(provider, keyEnv || null);
  const fetchedAt = new Date().toISOString();

  const missingKey = (label: string, envName: string) => {
    throw new Error(
      `${label} API key missing. Set "${envName}" under Admin → Environment, or on the provider connection.`
    );
  };

  if (provider === "anthropic") {
    if (!key) missingKey("Anthropic", keyEnv || "ANTHROPIC_API_KEY");
    const models = await fetchAnthropicModels(key!);
    return { models, source: "anthropic", fetchedAt };
  }

  if (provider === "google") {
    if (!key) {
      missingKey(
        "Google / Gemini",
        keyEnv || "GOOGLE_GENERATIVE_AI_API_KEY"
      );
    }
    let models = await fetchGoogleModels(opts.apiBase ?? null, key!);
    if ((opts.engine || "").toUpperCase() === "VOICE") {
      models = preferVoiceLiveModels(models);
    }
    return { models, source: "google", fetchedAt };
  }

  // ZAI and all OpenAI-compatible gateways: require live /models
  if (!key && provider !== "ollama") {
    missingKey(provider, keyEnv || defaultApiKeyEnvKey(provider) || "API_KEY");
  }

  let models = await fetchOpenAiCompatibleModels(
    opts.apiBase ?? null,
    key,
    provider === "zai" ? "openai_compatible" : provider
  );
  if ((opts.engine || "").toUpperCase() === "VOICE") {
    models = preferVoiceLiveModels(models);
  }
  return {
    models,
    source: provider === "ollama" ? "ollama" : "remote",
    fetchedAt,
  };
}
