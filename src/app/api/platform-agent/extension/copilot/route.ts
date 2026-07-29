import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { createPlatformAgent } from "@/lib/agents/platform/main-agent";
import { detectPricingRequest } from "@/lib/guardrails";
import { syncMissionTranscript } from "@/lib/agents/platform/mission-transcript";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/platform-agent/extension/copilot
 * Non-streaming JSON chat for the Chrome extension (MV3-friendly).
 * Body: { text: string; missionId?: string; activeProjectId?: string | null }
 */
export async function POST(req: Request) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    text?: string;
    message?: string;
    missionId?: string;
    activeProjectId?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const text = String(body.text || body.message || "").trim();
  if (!text) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  if (detectPricingRequest(text)) {
    return NextResponse.json(
      {
        error:
          "ArabClue does not suggest bid prices, discounts, margins, or commercial strategy. Enter amounts in financial forms.",
        code: "PRICING_REFUSED",
      },
      { status: 422 }
    );
  }

  try {
    const { getOrCreateMission } = await import(
      "@/lib/agents/platform/mission"
    );
    const { getTenantContext } = await import("@/lib/workspace-context");
    const tenant = await getTenantContext(session.user.id);
    const locale = session.user.locale === "en" ? "en" : "ar";
    const mission = await getOrCreateMission({
      workspaceId: tenant.workspace.id,
      userId: session.user.id,
      locale,
      activeProjectId: body.activeProjectId,
    });
    const missionId = body.missionId || mission.id;

    const userMessage = {
      id: `ext-user-${Date.now()}`,
      role: "user" as const,
      parts: [{ type: "text" as const, text }],
    };

    try {
      await syncMissionTranscript({
        missionId,
        userId: session.user.id,
        messages: [userMessage],
      });
    } catch (persistErr) {
      console.error("[extension/copilot] pre-persist", persistErr);
    }

    const { agent } = await createPlatformAgent(session, {
      missionId,
      activeProjectId: body.activeProjectId ?? mission.activeProjectId ?? null,
    });

    const result = await agent.generate({
      prompt: text,
      abortSignal: req.signal,
      timeout: 110_000,
    });

    const reply = String(result.text || "").trim();
    const assistantMessage = {
      id: `ext-assistant-${Date.now()}`,
      role: "assistant" as const,
      parts: [{ type: "text" as const, text: reply || "(no response)" }],
    };

    try {
      await syncMissionTranscript({
        missionId,
        userId: session.user.id,
        messages: [userMessage, assistantMessage],
      });
    } catch (err) {
      console.error("[extension/copilot] transcript sync", err);
    }

    return NextResponse.json({
      ok: true,
      reply: reply || "Done.",
      missionId,
      missionUrl: `/app?view=copilot&mission=${encodeURIComponent(missionId)}`,
    });
  } catch (err) {
    console.error("[extension/copilot]", err);
    const message =
      err instanceof Error ? err.message : "Extension copilot failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
