import { requireSession } from "@/lib/auth";
import { executeVoiceLiveTool } from "@/lib/agents/platform/realtime";
import { detectPricingRequest } from "@/lib/guardrails";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/platform-agent/realtime/tools
 * Server-side execution of platform tools for live voice sessions.
 * Body: { toolName: string, args: unknown }
 */
export async function POST(req: Request) {
  const session = await requireSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { toolName?: string; args?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const toolName = body.toolName?.trim();
  if (!toolName) {
    return Response.json({ error: "toolName required" }, { status: 400 });
  }

  const argsText =
    typeof body.args === "string"
      ? body.args
      : JSON.stringify(body.args ?? {});
  if (detectPricingRequest(argsText) || detectPricingRequest(toolName)) {
    return Response.json(
      {
        error:
          "ArabClue does not suggest bid prices, discounts, margins, or commercial strategy.",
        code: "PRICING_REFUSED",
      },
      { status: 422 }
    );
  }

  try {
    const result = await executeVoiceLiveTool(
      session,
      toolName,
      body.args ?? {}
    );
    return Response.json({ ok: true, result });
  } catch (err) {
    console.error("[platform-agent/realtime/tools]", err);
    return Response.json(
      {
        error: err instanceof Error ? err.message : "Tool execution failed",
      },
      { status: 500 }
    );
  }
}
