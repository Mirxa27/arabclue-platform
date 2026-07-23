import { requireSession } from "@/lib/auth";
import {
  getVoiceLiveConfig,
  mintVoiceLiveSession,
} from "@/lib/agents/platform/realtime";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET — whether live voice is configured (admin VOICE engine). */
export async function GET() {
  const session = await requireSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const config = await getVoiceLiveConfig();
  return Response.json(config);
}

/**
 * POST — mint short-lived OpenAI Realtime / Gemini Live credentials.
 * Returns Experimental_RealtimeSetupResponse (+ provider metadata).
 */
export async function POST(req: Request) {
  const session = await requireSession();
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as {
      missionId?: string | null;
      activeProjectId?: string | null;
      sessionConfig?: unknown;
    };
    // Optional body.sessionConfig is ignored — server owns instructions + tools
    const setup = await mintVoiceLiveSession(session, {
      missionId: body.missionId,
      activeProjectId: body.activeProjectId,
    });
    return Response.json(setup);
  } catch (err) {
    console.error("[platform-agent/realtime/setup]", err);
    return Response.json(
      {
        error: err instanceof Error ? err.message : "Failed to start live voice",
      },
      { status: 500 }
    );
  }
}
