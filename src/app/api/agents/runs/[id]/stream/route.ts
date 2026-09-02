import { NextRequest } from "next/server";
import { getRun } from "workflow/api";
import { db } from "@/lib/db";
import { jsonApiFailure, toErrorResponse } from "@/lib/api-controller";
import { requireSession } from "@/lib/auth";
import { getTenantContext, assertWorkspaceMatch } from "@/lib/workspace-context";
import { parseAgentRunConfig } from "@/lib/proposal-studio";
import {
  encodeSseEvent,
  streamNamespaceFor,
  type DraftStreamChunk,
} from "@/lib/agents/draft-stream";

export const dynamic = "force-dynamic";
// A draft is minutes of generation; the connection stays open for all of it.
// Past this, EventSource reconnects with Last-Event-ID and resumes.
export const maxDuration = 300;

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/agents/runs/[id]/stream?channel=draft|contract — one of the run's
 * live documents as server-sent events, one `DraftStreamChunk` per event, the
 * event id being the chunk's index in the workflow's namespaced stream
 * (foundations/streaming). The proposal draft is the default channel.
 * A reconnecting client sends `Last-Event-ID`; the stream resumes after it.
 * The route is marked `supportsCancellation` in vercel.json so a closed tab
 * tears the invocation down instead of billing until maxDuration.
 */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const session = await requireSession();
    if (!session) return jsonApiFailure("UNAUTHORIZED", { status: 401 });
    const { id } = await params;
    const namespace = streamNamespaceFor(req.nextUrl.searchParams.get("channel"));
    if (!namespace) {
      return jsonApiFailure("REQUEST_VALIDATION_FAILED", { status: 400, fieldPaths: ["channel"] });
    }
    const { workspace } = await getTenantContext(session.user.id);

    const run = await db.agentRun.findUnique({
      where: { id },
      select: { configJson: true, project: { select: { workspaceId: true } } },
    });
    if (!run || !assertWorkspaceMatch(run.project.workspaceId, workspace.id)) {
      return jsonApiFailure("AGENT_RUN_NOT_FOUND", { status: 404 });
    }
    const workflowRunId = parseAgentRunConfig(run.configJson)?.workflowRunId;
    if (!workflowRunId) {
      // Runs from before the durable workflow have no stream to replay.
      return jsonApiFailure("AGENT_RUN_STREAM_NOT_FOUND", { status: 404 });
    }

    const startIndex = resumeIndex(req);
    let index = startIndex ?? 0;
    const encoder = new TextEncoder();
    const events = getRun(workflowRunId)
      .getReadable<DraftStreamChunk>({ namespace, startIndex })
      .pipeThrough(
        new TransformStream<DraftStreamChunk, Uint8Array>({
          transform(chunk, controller) {
            controller.enqueue(encoder.encode(encodeSseEvent(index++, chunk)));
          },
        }),
      );

    return new Response(events, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    return toErrorResponse(err, "[agents/runs/stream]");
  }
}

/** Where to resume: after the client's last event id, or an explicit start index. */
function resumeIndex(req: NextRequest): number | undefined {
  const last = req.headers.get("last-event-id");
  if (last !== null) {
    const n = Number(last);
    if (Number.isInteger(n) && n >= 0) return n + 1;
  }
  const raw = req.nextUrl.searchParams.get("startIndex");
  if (raw !== null) {
    const n = Number(raw);
    if (Number.isInteger(n) && n >= 0) return n;
  }
  return undefined;
}
