import { jsonApiFailure, jsonFailure } from "@/lib/api-controller";
import { validationFailure } from "@/lib/api-failure";
import { requireSession } from "@/lib/auth";
import { executeVoiceLiveTool } from "@/lib/agents/platform/realtime";
import { checkAiRateLimit } from "@/lib/ai-rate-limit";
import { detectPricingRequest } from "@/lib/guardrails";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/platform-agent/realtime/tools
 * Server-side execution of platform tools for live voice sessions.
 * Body: { toolName: string, args: unknown, missionId?: string, activeProjectId?: string }
 */
export async function POST(req: Request) {
  const session = await requireSession();
  if (!session) {
    return jsonApiFailure("AUTHENTICATION_REQUIRED");
  }

  let body: {
    toolName?: string;
    args?: unknown;
    missionId?: string | null;
    activeProjectId?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return jsonApiFailure("INVALID_JSON_BODY");
  }

  const toolName = body.toolName?.trim();
  if (!toolName) {
    return jsonFailure(validationFailure(["toolName"]));
  }

  const argsText =
    typeof body.args === "string"
      ? body.args
      : JSON.stringify(body.args ?? {});
  if (detectPricingRequest(argsText) || detectPricingRequest(toolName)) {
    return jsonApiFailure("PRICING_REFUSED");
  }

  // A voice session drives these, so the ceiling has to clear human speaking
  // pace — 30/min is one call every two seconds. Scoped to the user: the
  // session is the thing that can loop, and the tool resolves its own tenant.
  const limited = await checkAiRateLimit({
    route: "platform-agent.realtime.tools",
    identifier: session.user.id,
    scope: "user",
    limit: 30,
    windowMs: 60_000,
  });
  if (limited) return limited;

  try {
    const result = await executeVoiceLiveTool(
      session,
      toolName,
      body.args ?? {},
      {
        missionId: body.missionId,
        activeProjectId: body.activeProjectId,
      }
    );
    return Response.json({ ok: true, result });
  } catch (err) {
    // The thrown reason can name a provider or a document body, and the voice
    // session speaks the response text back to the caller.
    console.error("[platform-agent/realtime/tools]", err);
    return jsonApiFailure("AGENT_TOOL_FAILED");
  }
}
