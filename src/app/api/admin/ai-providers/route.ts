import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getBootstrapContext } from "@/lib/bootstrap";
import { requireAdmin } from "@/lib/auth";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { AI_PROVIDER_PRESETS } from "@/lib/constants";
import {
  AGENT_ENGINES,
  AGENT_ENGINE_LABELS,
  LLM_PROVIDER_TYPES,
  defaultApiBase,
  defaultApiKeyEnvKey,
  inferModelCapabilities,
} from "@/lib/llm/model-catalog";

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
      providers.find((p) => p.engine === eng && p.isActive)?.id ?? null;
  }

  return NextResponse.json({
    providers,
    presets: AI_PROVIDER_PRESETS,
    engines: AGENT_ENGINES.map((id) => ({
      id,
      label: AGENT_ENGINE_LABELS[id],
    })),
    providerTypes: LLM_PROVIDER_TYPES,
    activeByEngine,
  });
}

// POST /api/admin/ai-providers — create a new provider config
export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await getBootstrapContext();
  const body = await req.json();

  const provider = String(body.provider || "openai_compatible");
  const modelId = String(body.modelId || "");
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
      : inferModelCapabilities(modelId || "gpt-4o");

  const engine = String(body.engine || "DEFAULT");
  const activate = body.isActive === true;

  if (activate) {
    await db.aIProviderConfig.updateMany({
      where: { engine, isActive: true },
      data: { isActive: false },
    });
  }

  const created = await db.aIProviderConfig.create({
    data: {
      name: body.name || `${provider} · ${modelId}`,
      provider,
      modelId: modelId || "gpt-4o",
      apiBase: body.apiBase ?? (defaultApiBase(provider) || null),
      apiKeyEnvKey:
        body.apiKeyEnvKey ?? (defaultApiKeyEnvKey(provider) || null),
      engine,
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
    },
  });
  return NextResponse.json({ provider: created });
}
