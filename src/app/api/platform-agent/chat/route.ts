import { createAgentUIStreamResponse } from "ai";
import { requireSession } from "@/lib/auth";
import { createPlatformAgent } from "@/lib/agents/platform/main-agent";
import { detectPricingRequest } from "@/lib/guardrails";
import { syncMissionTranscript } from "@/lib/agents/platform/mission-transcript";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  const session = await requireSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    messages?: unknown[];
    missionId?: string;
    activeProjectId?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];

  // Pricing gate on latest user text before agent loop
  const lastUser = [...messages]
    .reverse()
    .find((m) => {
      if (!m || typeof m !== "object") return false;
      return (m as { role?: string }).role === "user";
    }) as
    | { parts?: Array<{ type?: string; text?: string }>; content?: string }
    | undefined;

  const userText =
    lastUser?.parts
      ?.filter((p) => p.type === "text" && typeof p.text === "string")
      .map((p) => p.text)
      .join("\n") ??
    (typeof lastUser?.content === "string" ? lastUser.content : "");

  if (userText && detectPricingRequest(userText)) {
    return Response.json(
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
    const { agent } = await createPlatformAgent(session, {
      missionId,
      activeProjectId: body.activeProjectId ?? mission.activeProjectId ?? null,
    });

    // Persist inbound user turn immediately so crashes mid-stream still leave a trail
    try {
      await syncMissionTranscript({
        missionId,
        userId: session.user.id,
        messages: messages as Array<{
          id?: string;
          role?: string;
          parts?: unknown;
        }>,
      });
    } catch (persistErr) {
      console.error("[platform-agent/chat] pre-persist", persistErr);
    }

    return createAgentUIStreamResponse({
      agent,
      uiMessages: messages,
      originalMessages: messages as never,
      abortSignal: req.signal,
      onEnd: async ({ messages: finalMessages }) => {
        try {
          await syncMissionTranscript({
            missionId,
            userId: session.user.id,
            messages: finalMessages as Array<{
              id?: string;
              role?: string;
              parts?: unknown;
            }>,
          });
        } catch (err) {
          console.error("[platform-agent/chat] transcript sync", err);
        }
      },
    });
  } catch (err) {
    console.error("[platform-agent/chat]", err);
    const message =
      err instanceof Error ? err.message : "Platform agent failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
