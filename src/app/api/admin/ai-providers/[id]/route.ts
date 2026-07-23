import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getBootstrapContext } from "@/lib/bootstrap";
import { requireAdmin } from "@/lib/auth";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import {
  inferModelCapabilities,
  parseProviderEngines,
} from "@/lib/llm/model-catalog";
import {
  deactivateConflictingProviders,
  enginesPayloadFromBody,
} from "@/lib/llm/provider-engines";

export const dynamic = "force-dynamic";

const ALLOWED_FIELDS = new Set([
  "name",
  "provider",
  "modelId",
  "apiBase",
  "apiKeyEnvKey",
  "engine",
  "isActive",
  "isDefault",
  "priority",
  "contextWindow",
  "supportsVision",
  "supportsJsonMode",
  "supportsTools",
  "temperature",
  "maxTokens",
  "topP",
  "frequencyPenalty",
  "presencePenalty",
  "confidenceThreshold",
  "toxicityFilter",
  "piiFilter",
  "hallucinationGuard",
  "maxRetries",
  "timeoutMs",
  "inputCostPer1k",
  "outputCostPer1k",
  "metadata",
]);

// PATCH /api/admin/ai-providers/[id] — update config OR activate for its engine
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  await getBootstrapContext();
  const body = await req.json();

  const existing = await db.aIProviderConfig.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (ALLOWED_FIELDS.has(k) && v !== undefined) data[k] = v;
  }

  // Multi-engine assignment (engines[]) — sync primary engine + enginesJson
  let targetEngines = parseProviderEngines(existing);
  if (body.engines !== undefined || body.engine !== undefined) {
    const payload = enginesPayloadFromBody({
      engines: body.engines ?? body.engine,
      engine: body.engine,
    });
    targetEngines = payload.engines;
    data.engine = payload.primary;
    data.enginesJson = payload.enginesJson;
  }

  // Auto-fill capabilities when modelId changes (unless explicitly overridden)
  if (typeof data.modelId === "string" && data.modelId !== existing.modelId) {
    const caps = inferModelCapabilities(data.modelId);
    if (body.contextWindow == null) data.contextWindow = caps.contextWindow;
    if (body.maxTokens == null) data.maxTokens = caps.maxTokens;
    if (body.supportsVision == null) data.supportsVision = caps.supportsVision;
    if (body.supportsJsonMode == null)
      data.supportsJsonMode = caps.supportsJsonMode;
    if (body.supportsTools == null) data.supportsTools = caps.supportsTools;
    if (body.inputCostPer1k == null && caps.inputCostPer1k != null)
      data.inputCostPer1k = caps.inputCostPer1k;
    if (body.outputCostPer1k == null && caps.outputCostPer1k != null)
      data.outputCostPer1k = caps.outputCostPer1k;
  }

  const nextModelId = String(
    data.modelId !== undefined ? data.modelId : existing.modelId
  ).trim();
  const willBeActive =
    data.isActive === true ||
    (data.isActive !== false && existing.isActive);

  // Active connections must always have a selected model from live fetch
  if (willBeActive && !nextModelId) {
    return NextResponse.json(
      {
        error:
          "Cannot activate or keep active without a selected model. Fetch models and choose one first.",
        code: "model_required",
      },
      { status: 400 }
    );
  }

  // Activation / engine change: only one active provider per served engine
  if (data.isActive === true || body.engines !== undefined) {
    if (willBeActive) {
      await deactivateConflictingProviders(targetEngines, id);
    }
    if (data.isActive === true) {
      await audit({
        userId: session.user.id,
        action: AUDIT_ACTIONS.AI_PROVIDER_ACTIVATE,
        resource: "AIProviderConfig",
        resourceId: id,
        severity: "WARN",
        details: { engines: targetEngines, modelId: nextModelId },
      });
    }
  }

  const updated = await db.aIProviderConfig.update({
    where: { id },
    data,
  });

  await audit({
    userId: session.user.id,
    action: AUDIT_ACTIONS.AI_PROVIDER_UPDATE,
    resource: "AIProviderConfig",
    resourceId: id,
    details: { changes: data },
  });

  return NextResponse.json({
    provider: {
      ...updated,
      engines: parseProviderEngines(updated),
    },
  });
}

// DELETE /api/admin/ai-providers/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  await getBootstrapContext();
  const existing = await db.aIProviderConfig.findUnique({ where: { id } });
  if (existing?.isActive) {
    return NextResponse.json(
      {
        error:
          "Cannot delete an active provider. Activate another for this engine first.",
      },
      { status: 400 }
    );
  }
  await db.aIProviderConfig.delete({ where: { id } });
  await audit({
    userId: session.user.id,
    action: AUDIT_ACTIONS.AI_PROVIDER_DELETE,
    resource: "AIProviderConfig",
    resourceId: id,
    details: { name: existing?.name, engine: existing?.engine },
    severity: "WARN",
  });
  return NextResponse.json({ ok: true });
}
