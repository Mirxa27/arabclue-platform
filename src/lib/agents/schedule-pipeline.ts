/**
 * Start the multi-agent pipeline as a durable workflow run.
 *
 * The run executes in the workflow's own functions (pipeline-workflow.ts), not
 * in the caller's invocation, so the response can go out at once and the
 * platform's per-function ceiling no longer bounds the whole pipeline. The
 * workflow run id is kept on the run row for `npx workflow inspect run <id>`.
 * A start that fails is written to the row as a classified failure; a QUEUED
 * row that never moves would otherwise sit until the stale check found it.
 */
import { start } from "workflow/api";
import { db } from "@/lib/db";
import { parseAgentRunConfig } from "@/lib/proposal-studio";
import { agentPipelineWorkflow } from "@/lib/agents/pipeline-workflow";

export type ScheduleAgentPipelineArgs = {
  runId: string;
  projectId: string;
  workspaceId: string;
  userId: string;
  locale: "ar" | "en";
  regenerateMode?: "fork" | "version";
  targetProposalId?: string | null;
  logLabel?: string;
};

export async function scheduleAgentPipeline(args: ScheduleAgentPipelineArgs): Promise<void> {
  const label = args.logLabel ?? "[agents/pipeline]";
  try {
    const run = await start(agentPipelineWorkflow, [
      {
        runId: args.runId,
        projectId: args.projectId,
        workspaceId: args.workspaceId,
        userId: args.userId,
        locale: args.locale,
        regenerateMode: args.regenerateMode,
        targetProposalId: args.targetProposalId ?? null,
      },
    ]);
    const row = await db.agentRun.findUnique({ where: { id: args.runId }, select: { configJson: true } });
    const cfg = parseAgentRunConfig(row?.configJson);
    if (cfg) {
      await db.agentRun.update({
        where: { id: args.runId },
        data: { configJson: JSON.stringify({ ...cfg, workflowRunId: run.runId }) },
      });
    }
  } catch (err) {
    console.error(label, "workflow start failed", err);
    const message = err instanceof Error ? err.message : "Workflow start failed";
    await db.agentRun
      .updateMany({
        where: { id: args.runId, status: { in: ["QUEUED", "RUNNING"] } },
        data: {
          status: "FAILED",
          errorMessage: `Pipeline could not be started: ${message}`.slice(0, 500),
          failureKind: "INTERNAL",
          completedAt: new Date(),
        },
      })
      .catch((dbErr) => console.error(label, "failed to record start failure", dbErr));
  }
}
