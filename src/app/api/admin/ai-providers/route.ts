import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getBootstrapContext } from "@/lib/bootstrap";
import { requireAdmin } from "@/lib/auth";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import {
  AGENT_ENGINES,
  AGENT_ENGINE_LABELS,
  LLM_PROVIDER_TYPES,
  PROVIDER_CONNECTION_TEMPLATES,
  defaultApiBase,
  defaultApiKeyEnvKey,
  inferModelCapabilities,
  parseModelsCache,
  parseProviderEngines,
} from "@/lib/llm/model-catalog";
import {
  deactivateConflictingProviders,
  enginesPayloadFromBody,
} from "@/lib/llm/provider-engines";

export const dynamic = "force-dynamic";

// GET /api/admin/ai-providers
export async function GET() {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await getBootstrapContext();
  const providers = await db.aIProviderConfig.findMany({
    orderBy: [
      { engine: "asc" },
      { isActive: "desc" },
      { priority: "desc" },
      { createdAt: "asc" },
    ],
  });

  const activeByEngine: Record<string, string | null> = {};
  for (const eng of AGENT_ENGINES) {
    activeByEngine[eng] =
      providers.find((p) => p.isActive && parseProviderEngines(p).includes(eng))
        ?.id ?? null;
  }

  return NextResponse.json({
    providers: providers.map((p) => {
      const engines = parseProviderEngines(p);
      return {
        ...p,
        engines,
        engine: engines[0] ?? p.engine ?? "DEFAULT",
        modelsCache: parseModelsCache(p.modelsCacheJson),
        modelsFetchedAt: p.modelsFetchedAt?.toISOString() ?? null,
      };
    }),
    // Connection templates only — no model IDs
    presets: PROVIDER_CONNECTION_TEMPLATES,
    connectionTemplates: PROVIDER_CONNECTION_TEMPLATES,
    engines: AGENT_ENGINES.map((id) => ({
      id,
      label: AGENT_ENGINE_LABELS[id],
    })),
    providerTypes: LLM_PROVIDER_TYPES,
    activeByEngine,
  });
}

// POST /api/admin/ai-providers — create a new provider connection
export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await getBootstrapContext();
  const body = await req.json();

  const provider = String(body.provider || "openai_compatible");
  const modelId = String(body.modelId || "").trim();
  const caps =
    body.contextWindow != null
      ? {
          contextWindow: Number(body.contextWindow),
          maxTokens: Number(body.maxTokens ?? 4096),
          supportsVision: Boolean(body.supportsVision),
          supportsJsonMode: body.supportsJsonMode !== false,
          supportsTools: Boolean(body.supportsTools),
          inputCostPer1k: Number(body.inputCostPer1k ?? 0),
          outputCostPer1k: Number(body.outputCostPer1k ?? 0),
        }
      : modelId
        ? inferModelCapabilities(modelId)
        : {
            contextWindow: 128000,
            maxTokens: 4096,
            supportsVision: false,
            supportsJsonMode: true,
            supportsTools: false,
            inputCostPer1k: 0,
            outputCostPer1k: 0,
          };

  const { engines, primary: engine, enginesJson } = enginesPayloadFromBody(body);
  const activate = body.isActive === true;
  if (activate && !modelId) {
    return NextResponse.json(
      {
        error:
          "Cannot activate a connection without a model. Fetch models and select one first.",
        code: "model_required",
      },
      { status: 400 }
    );
  }

  if (activate) {
    await deactivateConflictingProviders(engines);
  }

  const modelsCache = parseModelsCache(
    Array.isArray(body.modelsCache)
      ? JSON.stringify(body.modelsCache)
      : body.modelsCacheJson
  );
  const modelsFetchedAt =
    body.modelsFetchedAt != null
      ? new Date(String(body.modelsFetchedAt))
      : modelsCache.length > 0
        ? new Date()
        : null;

  const created = await db.aIProviderConfig.create({
    data: {
      name: body.name || provider,
      provider,
      modelId,
      apiBase: body.apiBase ?? (defaultApiBase(provider) || null),
      apiKeyEnvKey:
        body.apiKeyEnvKey ?? (defaultApiKeyEnvKey(provider) || null),
      engine,
      enginesJson,
      isActive: activate,
      isDefault: body.isDefault === true,
      priority: Number(body.priority ?? 0),
      contextWindow: caps.contextWindow,
      supportsVision: caps.supportsVision,
      supportsJsonMode: caps.supportsJsonMode,
      supportsTools: caps.supportsTools,
      temperature: body.temperature ?? 0.2,
      maxTokens: body.maxTokens ?? caps.maxTokens,
      topP: body.topP ?? 0.9,
      frequencyPenalty: body.frequencyPenalty ?? 0.0,
      presencePenalty: body.presencePenalty ?? 0.0,
      confidenceThreshold: body.confidenceThreshold ?? 0.85,
      toxicityFilter: body.toxicityFilter ?? true,
      piiFilter: body.piiFilter ?? true,
      hallucinationGuard: body.hallucinationGuard ?? true,
      maxRetries: body.maxRetries ?? 2,
      timeoutMs: body.timeoutMs ?? 60000,
      inputCostPer1k: body.inputCostPer1k ?? caps.inputCostPer1k ?? 0.0,
      outputCostPer1k: body.outputCostPer1k ?? caps.outputCostPer1k ?? 0.0,
      modelsCacheJson:
        modelsCache.length > 0 ? JSON.stringify(modelsCache) : null,
      modelsFetchedAt,
    },
  });

  await audit({
    userId: session.user.id,
    action: AUDIT_ACTIONS.AI_PROVIDER_CREATE,
    resource: "AIProviderConfig",
    resourceId: created.id,
    details: {
      name: created.name,
      provider: created.provider,
      modelId: created.modelId,
      engine: created.engine,
      engines,
    },
  });
  return NextResponse.json({
    provider: {
      ...created,
      engines: parseProviderEngines(created),
    },
  });
}
