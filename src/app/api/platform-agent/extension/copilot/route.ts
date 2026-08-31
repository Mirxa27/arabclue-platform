import { validationFailure } from "@/lib/api-failure";
import { jsonApiFailure, jsonFailure } from "@/lib/api-controller";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { createPlatformAgent } from "@/lib/agents/platform/main-agent";
import { checkAiRateLimit } from "@/lib/ai-rate-limit";
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
    return jsonApiFailure("AUTHENTICATION_REQUIRED");
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
    return jsonApiFailure("INVALID_JSON_BODY");
  }

  const text = String(body.text || body.message || "").trim();
  if (!text) {
    return jsonFailure(validationFailure(["text"]));
  }

  if (detectPricingRequest(text)) {
    return jsonApiFailure("PRICING_REFUSED");
  }

  // Matches `platform-agent.chat` — same agent, same turn shape, different
  // client. Scoped to the user because the workspace is only resolved below,
  // inside the try, and paying for a tenant lookup to rate-limit is backwards.
  const limited = await checkAiRateLimit({
    route: "platform-agent.extension.copilot",
    identifier: session.user.id,
    scope: "user",
    limit: 30,
    windowMs: 60_000,
  });
  if (limited) return limited;

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
    // The reason stays server-side: the extension renders the response body
    // text to the reader.
    console.error("[extension/copilot]", err);
    return jsonApiFailure("INTERNAL_ERROR");
  }
}
