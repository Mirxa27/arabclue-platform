import { jsonApiFailure } from "@/lib/api-controller";
import { createAgentUIStreamResponse } from "ai";
import { requireSession } from "@/lib/auth";
import { createPlatformAgent } from "@/lib/agents/platform/main-agent";
import { resolveCurrentView } from "@/lib/agents/platform/context";
import { detectPricingRequest } from "@/lib/guardrails";
import { syncMissionTranscript } from "@/lib/agents/platform/mission-transcript";
import { checkAiRateLimit } from "@/lib/ai-rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  const session = await requireSession();
  if (!session) {
    return jsonApiFailure("AUTHENTICATION_REQUIRED");
  }

  let body: {
    messages?: unknown[];
    missionId?: string;
    activeProjectId?: string | null;
    currentView?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return jsonApiFailure("INVALID_JSON_BODY");
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
    return jsonApiFailure("PRICING_REFUSED");
  }

  try {
    const { getOrCreateMission, resolveOwnedMissionId } = await import(
      "@/lib/agents/platform/mission"
    );
    const { getTenantContext } = await import("@/lib/workspace-context");
    const tenant = await getTenantContext(session.user.id);

    // Cost-DoS shield: a leaked session cookie or runaway UI loop could rip
    // through LLM tokens. Cap at 30 chat turns/min per workspace.
    const blocked = await checkAiRateLimit({
      route: "platform-agent.chat",
      identifier: tenant.workspace.id,
      limit: 30,
      windowMs: 60_000,
    });
    if (blocked) return blocked;

    const locale = session.user.locale === "en" ? "en" : "ar";
    const mission = await getOrCreateMission({
      workspaceId: tenant.workspace.id,
      userId: session.user.id,
      locale,
      activeProjectId: body.activeProjectId,
    });
    // Client-named mission, resolved against ownership: the transcript sync
    // below deletes by this id.
    const missionId = await resolveOwnedMissionId({
      requested: body.missionId,
      workspaceId: tenant.workspace.id,
      userId: session.user.id,
      fallbackId: mission.id,
    });
    const { agent } = await createPlatformAgent(session, {
      missionId,
      activeProjectId: body.activeProjectId ?? mission.activeProjectId ?? null,
      // The assistant dock opens over whatever page the user is on, so "summarise
      // this" needs a referent. Resolved against the route table before it can
      // reach the prompt.
      currentView: resolveCurrentView(body.currentView),
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
    // The internal reason stays in the server log: it can name a provider,
    // a table, or a document body, and the console renders the response text
    // to the reader verbatim.
    console.error("[platform-agent/chat]", err);
    return jsonApiFailure("INTERNAL_ERROR");
  }
}
