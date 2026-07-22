import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getBootstrapContext } from "@/lib/bootstrap";
import { requireAdmin } from "@/lib/auth";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { inferModelCapabilities } from "@/lib/llm/model-catalog";

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

  const targetEngine = String(data.engine ?? existing.engine);

  // Activation is scoped per engine: only one active provider per engine
  if (data.isActive === true) {
    await db.aIProviderConfig.updateMany({
      where: {
        engine: targetEngine,
        isActive: true,
        NOT: { id },
      },
      data: { isActive: false },
    });
    await audit({
      userId: session.user.id,
      action: AUDIT_ACTIONS.AI_PROVIDER_ACTIVATE,
      resource: "AIProviderConfig",
      resourceId: id,
      severity: "WARN",
      details: { engine: targetEngine },
    });
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

  return NextResponse.json({ provider: updated });
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
