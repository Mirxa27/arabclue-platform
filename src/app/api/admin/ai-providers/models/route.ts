import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getBootstrapContext } from "@/lib/bootstrap";
import { requireAdmin } from "@/lib/auth";
import { resolveProviderApiKey } from "@/lib/env-settings";
import {
  enrichRemoteModel,
  normalizeOpenAiBase,
  defaultApiKeyEnvKey,
} from "@/lib/llm/model-catalog";

export const dynamic = "force-dynamic";

type FetchBody = {
  provider?: string;
  apiBase?: string | null;
  apiKeyEnvKey?: string | null;
  /** When set, load credentials from an existing provider row */
  providerId?: string;
};

/**
 * POST /api/admin/ai-providers/models
 * Auto-fetch model list from OpenAI-compatible /models (and Anthropic).
 */
export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await getBootstrapContext();

  const body = (await req.json()) as FetchBody;
  let provider = (body.provider || "openai").toLowerCase();
  let apiBase = body.apiBase ?? null;
  let apiKeyEnvKey = body.apiKeyEnvKey ?? null;

  if (body.providerId) {
    const row = await db.aIProviderConfig.findUnique({
      where: { id: body.providerId },
    });
    if (!row) {
      return NextResponse.json({ error: "Provider not found" }, { status: 404 });
    }
    provider = row.provider.toLowerCase();
    apiBase = row.apiBase;
    apiKeyEnvKey = row.apiKeyEnvKey;
  }

  try {
    const models = await fetchProviderModels(provider, apiBase, apiKeyEnvKey);
    return NextResponse.json({
      models: models.map((m) => enrichRemoteModel(m.id)),
      source: models[0]?.source ?? "remote",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch models";
    return NextResponse.json({ error: message, models: [] }, { status: 502 });
  }
}

async function fetchProviderModels(
  provider: string,
  apiBase: string | null,
  apiKeyEnvKey: string | null
): Promise<Array<{ id: string; source: string }>> {
  const keyEnv = apiKeyEnvKey || defaultApiKeyEnvKey(provider);
  const key = await resolveProviderApiKey(provider, keyEnv);

  if (provider === "anthropic") {
    if (!key) throw new Error("Anthropic API key missing");
    const res = await fetch("https://api.anthropic.com/v1/models", {
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Anthropic models HTTP ${res.status}: ${t.slice(0, 160)}`);
    }
    const data = await res.json();
    const list = (data.data ?? data.models ?? []) as Array<{ id?: string }>;
    return list
      .map((m) => m.id)
      .filter((id): id is string => Boolean(id))
      .map((id) => ({ id, source: "anthropic" }));
  }

  if (provider === "zai") {
    // ZAI SDK does not expose a public list endpoint — return catalog defaults
    return [
      { id: "glm-4.6", source: "catalog" },
      { id: "glm-4.5", source: "catalog" },
      { id: "glm-4", source: "catalog" },
    ];
  }

  // OpenAI-compatible: openai, openai_compatible, ollama, azure_openai, mistral
  const base = normalizeOpenAiBase(
    apiBase ||
      (provider === "mistral"
        ? "https://api.mistral.ai/v1"
        : provider === "ollama"
          ? "http://127.0.0.1:11434/v1"
          : "https://api.openai.com/v1")
  );

  if (!key && provider !== "ollama") {
    throw new Error(
      `API key missing (${keyEnv || "unset"}). Configure the key in Env Settings.`
    );
  }

  const headers: Record<string, string> = {};
  if (key) headers.Authorization = `Bearer ${key}`;

  const res = await fetch(`${base}/models`, { headers });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Models HTTP ${res.status}: ${t.slice(0, 160)}`);
  }
  const data = await res.json();
  const list = (data.data ?? data.models ?? []) as Array<{
    id?: string;
    name?: string;
  }>;
  const ids = list
    .map((m) => m.id || m.name)
    .filter((id): id is string => Boolean(id));

  // Prefer chat / embed models first
  ids.sort((a, b) => {
    const score = (id: string) => {
      const l = id.toLowerCase();
      if (/embed/.test(l)) return 2;
      if (/instruct|chat|gpt|claude|mistral|llama|qwen|deepseek|glm/.test(l))
        return 0;
      return 1;
    };
    return score(a) - score(b) || a.localeCompare(b);
  });

  return ids.map((id) => ({ id, source: "remote" }));
}
