/**
 * Live provider model list fetcher — never returns a hardcoded catalog.
 */

import { resolveProviderApiKey } from "../env-settings";
import {
  defaultApiBase,
  defaultApiKeyEnvKey,
  enrichRemoteModel,
  normalizeOpenAiBase,
  type ModelCapability,
  type RemoteModelMeta,
} from "./model-catalog";

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
  const fallbackBase = defaultApiBase(provider);
  const base = normalizeOpenAiBase(apiBase || fallbackBase);
  if (!base) {
    throw new Error(
      "API Base URL is required to auto-fetch models for this provider"
    );
  }
  if (!apiKey && provider !== "ollama") {
    throw new Error("API key missing — configure it in Env Settings first");
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const res = await fetch(`${base}/models`, {
    headers,
    cache: "no-store",
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Models HTTP ${res.status}: ${t.slice(0, 200)}`);
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
    const t = await res.text();
    throw new Error(`Anthropic models HTTP ${res.status}: ${t.slice(0, 200)}`);
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
  const base = (apiBase || defaultApiBase("google")).replace(/\/$/, "");
  const url = `${base}/models?key=${encodeURIComponent(apiKey)}&pageSize=200`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Google models HTTP ${res.status}: ${t.slice(0, 200)}`);
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
  const key = await resolveProviderApiKey(provider, keyEnv || null);
  const fetchedAt = new Date().toISOString();

  if (provider === "anthropic") {
    if (!key) throw new Error("Anthropic API key missing");
    const models = await fetchAnthropicModels(key);
    return { models, source: "anthropic", fetchedAt };
  }

  if (provider === "google") {
    if (!key) throw new Error("Google Generative AI API key missing");
    let models = await fetchGoogleModels(opts.apiBase ?? null, key);
    if ((opts.engine || "").toUpperCase() === "VOICE") {
      models = preferVoiceLiveModels(models);
    }
    return { models, source: "google", fetchedAt };
  }

  // ZAI and all OpenAI-compatible gateways: require live /models
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
