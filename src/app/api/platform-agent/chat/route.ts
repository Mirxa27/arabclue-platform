import { createAgentUIStreamResponse } from "ai";
import { requireSession } from "@/lib/auth";
import { createPlatformAgent } from "@/lib/agents/platform/main-agent";
import { detectPricingRequest } from "@/lib/guardrails";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  const session = await requireSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { messages?: unknown[] };
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
    }) as { parts?: Array<{ type?: string; text?: string }>; content?: string } | undefined;

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
    const { agent } = await createPlatformAgent(session);
    return createAgentUIStreamResponse({
      agent,
      uiMessages: messages,
      abortSignal: req.signal,
    });
  } catch (err) {
    console.error("[platform-agent/chat]", err);
    const message =
      err instanceof Error ? err.message : "Platform agent failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
