/**
 * The agent pipeline as a Vercel Workflow (workflow@4.8.5).
 *
 * This is the only module with directives. The workflow function orchestrates;
 * every step calls one stage from ./orchestrator, which owns the database and
 * provider work. Steps run in their own function at the plan's maximum
 * duration (the generated step route carries `maxDuration: "max"`), the run as
 * a whole has no limit, and a step whose function dies is retried by the
 * engine up to `maxRetries` times. A stage that hits a busy or slow provider
 * throws `RetryableError` itself (see settleStageFailure) so the retry comes
 * with a delay; the attempt count reaches the stage through `getStepMetadata`.
 */

import { getStepMetadata, getWritable } from "workflow";
import { DRAFT_STREAM_NAMESPACE, createDraftStreamSink, type DraftStreamChunk } from "./draft-stream";
import {
  failRunAfterCrash,
  runDraftContinuationStage,
  runDraftingStage,
  runFinalizeStage,
  runLawStage,
  runPreparationStage,
  type DraftingOutcome,
  type LawOutcome,
  type OrchestratorResult,
  type PipelineInput,
  type PrepareOutcome,
  type PreparedContext,
  type StageAttempt,
  type StageCrash,
} from "./orchestrator";

const STAGE_RETRIES = 2;

function attemptOf(maxRetries: number): StageAttempt {
  return { attempt: getStepMetadata().attempt, maxAttempts: maxRetries + 1 };
}

async function prepareStep(input: PipelineInput): Promise<PrepareOutcome> {
  "use step";
  return runPreparationStage(input, attemptOf(prepareStep.maxRetries));
}
prepareStep.maxRetries = STAGE_RETRIES;

async function draftingStep(input: PipelineInput, ctx: PreparedContext): Promise<DraftingOutcome> {
  "use step";
  // The run's live draft: read back by GET /api/agents/runs/[id]/stream.
  const sink = createDraftStreamSink(getWritable<DraftStreamChunk>({ namespace: DRAFT_STREAM_NAMESPACE }));
  return runDraftingStage(input, ctx, attemptOf(draftingStep.maxRetries), sink);
}
draftingStep.maxRetries = STAGE_RETRIES;

async function continueDraftStep(
  input: PipelineInput,
  ctx: PreparedContext,
  prior: Extract<DraftingOutcome, { ok: true }>,
): Promise<DraftingOutcome> {
  "use step";
  const sink = createDraftStreamSink(getWritable<DraftStreamChunk>({ namespace: DRAFT_STREAM_NAMESPACE }));
  return runDraftContinuationStage(input, ctx, prior, sink);
}
// Best effort and not idempotent (it appends to the proposal): one attempt.
continueDraftStep.maxRetries = 0;

async function lawStep(input: PipelineInput, ctx: PreparedContext): Promise<LawOutcome> {
  "use step";
  return runLawStage(input, ctx, attemptOf(lawStep.maxRetries));
}
lawStep.maxRetries = STAGE_RETRIES;

async function finalizeStep(
  input: PipelineInput,
  ctx: PreparedContext,
  drafting: DraftingOutcome | StageCrash,
  law: LawOutcome | StageCrash,
): Promise<OrchestratorResult> {
  "use step";
  return runFinalizeStage(input, ctx, drafting, law, attemptOf(finalizeStep.maxRetries));
}
finalizeStep.maxRetries = STAGE_RETRIES;

async function crashStep(input: PipelineInput, message: string): Promise<OrchestratorResult> {
  "use step";
  return failRunAfterCrash(input, message);
}
crashStep.maxRetries = STAGE_RETRIES;

/** The engine's reason for a step that exhausted its retries, as plain text. */
function crashMessage(stage: string, reason: unknown): string {
  const message =
    reason && typeof reason === "object" && typeof (reason as { message?: unknown }).message === "string"
      ? (reason as { message: string }).message
      : String(reason);
  return `${stage} stage stopped after its retries: ${message}`;
}

export async function agentPipelineWorkflow(input: PipelineInput): Promise<OrchestratorResult> {
  "use workflow";

  let prepared: PrepareOutcome;
  try {
    prepared = await prepareStep(input);
  } catch (err) {
    return crashStep(input, crashMessage("Preparation", err));
  }
  if (!prepared.ok) return prepared.result;

  // Both tails settle before anything is decided: a rejection in one while the
  // other is mid-write would otherwise leave a proposal row behind for a run
  // about to be marked FAILED.
  const [drafting, law] = await Promise.allSettled([
    draftingStep(input, prepared.ctx),
    lawStep(input, prepared.ctx),
  ]);
  let draftingOutcome: DraftingOutcome | StageCrash =
    drafting.status === "fulfilled" ? drafting.value : { ok: false, crashed: crashMessage("Drafting", drafting.reason) };
  const lawOutcome: LawOutcome | StageCrash =
    law.status === "fulfilled" ? law.value : { ok: false, crashed: crashMessage("Contract", law.reason) };

  // A draft that stopped at the token cap gets one continuation. Best effort:
  // if the step itself dies, the truncated draft stands as saved.
  if (draftingOutcome.ok && draftingOutcome.truncated) {
    try {
      draftingOutcome = await continueDraftStep(input, prepared.ctx, draftingOutcome);
    } catch {
      // keep the original outcome
    }
  }

  try {
    return await finalizeStep(input, prepared.ctx, draftingOutcome, lawOutcome);
  } catch (err) {
    return crashStep(input, crashMessage("Finalise", err));
  }
}
