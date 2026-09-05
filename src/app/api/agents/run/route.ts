import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireWriter } from "@/lib/auth";
import { getTenantContext } from "@/lib/workspace-context";
import { agentRunBodySchema, parseJsonBody } from "@/lib/validation";
import {
  apiFailure,
  jsonApiFailure,
  toErrorResponse,
} from "@/lib/api-controller";
import { launchProjectPipeline } from "@/lib/agents/launch-pipeline";
import { checkAiRateLimit } from "@/lib/ai-rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// POST /api/agents/run — kick off multi-agent workflow (idempotent per project).
// Onboarding, quota, provider preflight, document preflight, concurrency and
// the run row itself live in `launchProjectPipeline`, shared with the platform
// agent and both autopilots; this route only owns the HTTP shape.
export async function POST(req: NextRequest) {
  try {
    const session = await requireWriter();
    if (!session) {
      return jsonApiFailure("WORKSPACE_ROLE_FORBIDDEN", { status: 403 });
    }
    const parsed = await parseJsonBody(req, agentRunBodySchema);
    if (!parsed.ok) return parsed.response;

    const { workspace } = await getTenantContext(session.user.id);
    const userId = session.user.id;
    const { projectId, tenderType, budget } = parsed.data;
    const locale =
      parsed.data.locale ??
      (session.user.locale === "en" ? "en" : "ar");
    const regenerateMode = parsed.data.regenerateMode;
    const targetProposalId = parsed.data.targetProposalId;

    // The per-project in-progress guard below only stops a second run on the
    // *same* project. A script iterating a workspace's projects clears it every
    // time, so the workspace ceiling has to exist separately.
    const limited = await checkAiRateLimit({
      route: "agents.run",
      identifier: workspace.id,
      limit: 6,
      windowMs: 60_000,
    });
    if (limited) return limited;

    if (regenerateMode && !targetProposalId) {
      return jsonApiFailure("INVALID_REQUEST", {
        status: 400,
        fieldPaths: ["targetProposalId"],
      });
    }
    if (targetProposalId) {
      const target = await db.generatedProposal.findFirst({
        where: { id: targetProposalId, projectId, workspaceId: workspace.id },
      });
      if (!target) {
        return jsonApiFailure("RESOURCE_NOT_FOUND", { status: 404 });
      }
    }

    const launch = await launchProjectPipeline({
      workspaceId: workspace.id,
      userId,
      projectId,
      locale,
      source: "rest",
      regenerateMode,
      targetProposalId: targetProposalId ?? null,
      tenderType,
      budget,
    });

    if (!launch.ok) {
      if (launch.code === "ONBOARDING_INCOMPLETE") {
        // Only this code carries the step list the console needs; the
        // client-facing text comes from the registry, so an Arabic reader
        // gets Arabic.
        return NextResponse.json(
          {
            ...apiFailure("ONBOARDING_INCOMPLETE"),
            missing: launch.missing,
            readyForProposals: launch.readyForProposals,
          },
          { status: 403, headers: { "Cache-Control": "no-store" } }
        );
      }
      if (launch.code === "AGENT_RUN_IN_PROGRESS") {
        // `code` is spread from apiFailure so the client's
        // `err.code === "AGENT_RUN_IN_PROGRESS"` check also catches the
        // TOCTOU loser instead of falling through to the generic toast.
        return NextResponse.json(
          {
            ...apiFailure("AGENT_RUN_IN_PROGRESS"),
            runId: launch.runId,
            status: launch.status,
            stale: false,
          },
          { status: 409, headers: { "Cache-Control": "no-store" } }
        );
      }
      // 503 for no usable provider, 402 for a spent allowance, 404, 422: the
      // registry status for the code.
      return jsonApiFailure(launch.code);
    }

    return NextResponse.json({
      runId: launch.runId,
      projectId: launch.projectId,
      status: "QUEUED",
      agentStates: launch.agentStates,
    });
  } catch (err) {
    return toErrorResponse(err, "[agents/run]");
  }
}
