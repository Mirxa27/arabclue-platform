import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getBootstrapContext } from "@/lib/bootstrap";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { AI_PROVIDER_PRESETS } from "@/lib/constants";

export const dynamic = "force-dynamic";

// GET /api/admin/ai-providers
export async function GET() {
  await getBootstrapContext();
  const providers = await db.aIProviderConfig.findMany({
    orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
  });
  return NextResponse.json({ providers, presets: AI_PROVIDER_PRESETS });
}

// POST /api/admin/ai-providers — create a new provider config
export async function POST(req: NextRequest) {
  const { user } = await getBootstrapContext();
  const body = await req.json();
  const created = await db.aIProviderConfig.create({
    data: {
      name: body.name,
      provider: body.provider,
      modelId: body.modelId,
      apiBase: body.apiBase || null,
      isActive: false,
      isDefault: false,
      temperature: body.temperature ?? 0.2,
      maxTokens: body.maxTokens ?? 4096,
      topP: body.topP ?? 0.9,
      frequencyPenalty: body.frequencyPenalty ?? 0.0,
      presencePenalty: body.presencePenalty ?? 0.0,
      confidenceThreshold: body.confidenceThreshold ?? 0.85,
      toxicityFilter: body.toxicityFilter ?? true,
      piiFilter: body.piiFilter ?? true,
      hallucinationGuard: body.hallucinationGuard ?? true,
      maxRetries: body.maxRetries ?? 2,
      timeoutMs: body.timeoutMs ?? 60000,
      inputCostPer1k: body.inputCostPer1k ?? 0.0,
      outputCostPer1k: body.outputCostPer1k ?? 0.0,
    },
  });
  await audit({
    userId: user.id,
    action: AUDIT_ACTIONS.AI_PROVIDER_CREATE,
    resource: "AIProviderConfig",
    resourceId: created.id,
    details: { name: created.name, provider: created.provider, modelId: created.modelId },
  });
  return NextResponse.json({ provider: created });
}
