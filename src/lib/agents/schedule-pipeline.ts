/**
 * Schedule the multi-agent pipeline after the HTTP response is sent.
 * Prefer Next.js `after()` so serverless platforms keep the invocation alive
 * via waitUntil; fall back to fire-and-forget when after is unavailable.
 */
import { after } from "next/server";
import { runAgentPipeline } from "@/lib/agents/orchestrator";

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

export function scheduleAgentPipeline(args: ScheduleAgentPipelineArgs): void {
  const label = args.logLabel ?? "[agents/pipeline]";
  const work = () =>
    runAgentPipeline({
      runId: args.runId,
      projectId: args.projectId,
      workspaceId: args.workspaceId,
      userId: args.userId,
      locale: args.locale,
      regenerateMode: args.regenerateMode,
      targetProposalId: args.targetProposalId ?? null,
    }).catch((err) => console.error(label, err));

  try {
    after(work);
  } catch {
    // Local/test runtimes without request context — still start the pipeline.
    void work();
  }
}
