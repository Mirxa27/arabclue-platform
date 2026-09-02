import { db } from "../db";
import { RetryableError } from "workflow";
import { AGENTS, getTenderType } from "../constants";
import { tr } from "../i18n";
import type { AgentState, AgentId, IngestionEntities, ComplianceMatrixRow, FinancialExtract } from "../types";
import {
  classifyRunFailure,
  isTransientRunFailure,
  retryFindingLine,
  transientRetryDelayMs,
  type AgentRunFailureKind,
} from "./run-failure";
import {
  PipelineCancelledError,
  createRunRecorder,
  parseAgentStates,
  withHeartbeat,
  type RunRecorder,
} from "./run-recorder";
import { extractTextFromStorage, parseTenderText, buildIngestionSummary, sanitizeText } from "./ingestion";
import { engineNote } from "./run-presentation";
import { evaluateCompliance } from "./compliance";
import { runTechnicalArchitect } from "./technical";
import { runFinancialAgent } from "./financial";
import {
  appendContinuation,
  continueProposalDraft,
  draftProposal,
  type DraftProposalOptions,
} from "./drafting";
import { draftLawContract, validateContractDraft } from "./law-contract";
import { buildCoveragePlan, type CoveragePlan } from "./coverage";
import {
  enrichIngestionWithAi,
  enrichComplianceWithAi,
  enrichTechnicalWithAi,
  enrichFinancialWithAi,
} from "./enrich";
import type { RagDocument } from "../rag";
import { embedText } from "../llm";
import { loadProjectTenderCorpus } from "../document-chunks";
import { audit, AUDIT_ACTIONS } from "../audit";
import { resolveBidderDisplayName } from "../text-quality";
import { isQualityPastProjectTitle } from "../text-quality";
import {
  certificateKnowledgeContent,
  hashKnowledgeContent,
  libraryKnowledgeContent,
  methodologyKnowledgeContent,
  pastProjectKnowledgeContent,
} from "../knowledge-approval";
import {
  isCertificateValid,
  isLibraryItemEligible,
  isMethodologyEligible,
  isPastProjectEligible,
} from "../knowledge-eligibility";
import type { Locale } from "../types";
import { STRUCTURED_SNAPSHOT_INVALIDATION } from "../proposal-snapshot-persistence";
import { CONTRACT_RENDER_SNAPSHOT_INVALIDATION } from "../contract-render-snapshot";
import { isProposalEditLocked } from "../proposal-status";
import {
  createDecisionLogger,
  decision,
  truncateForLog,
  type AgentDecisionEntry,
} from "./decision-logger";
import {
  createMetricsTracker,
  mergeMetricsSnapshots,
  type MetricsSnapshot,
} from "./agent-metrics";
import type { DraftStreamSink } from "./draft-stream";
import { AGENT_CONFIG } from "./agent-config";
import {
  analyticsBackgroundOrigin,
  recordAgentRunAnalyticsEvent,
} from "../analytics-collector";

/**
 * The six-agent pipeline as four durable stages.
 *
 * Each exported stage runs inside its own workflow step (pipeline-workflow.ts)
 * and therefore in its own function, with the plan's full duration. Stages
 * hand each other plain data (`PreparedContext`) through the workflow's event
 * log; nothing here holds state across a stage boundary in memory. Agents 1–4
 * share the extracted corpus and stay together; drafting and the contract
 * share no inputs and run at the same time; the finalise stage merges the two
 * tails into the run record.
 *
 * ponytail: the prepared context travels as step arguments (twice, once per
 * tail step), a few hundred KB per run at most. If runs multiply past the
 * plan's included event-log volume, persist it on the run row and pass the id.
 */

export interface OrchestratorResult {
  agentStates: AgentState[];
  overallProgress: number;
  status: "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
  errorMessage?: string;
  proposalId?: string;
}

export interface PipelineInput {
  runId: string;
  projectId: string;
  workspaceId: string;
  userId: string;
  locale?: Locale;
  regenerateMode?: "version" | "fork";
  targetProposalId?: string | null;
}

/** Which attempt of the step this is, so a stage knows when to stop retrying. */
export interface StageAttempt {
  attempt: number;
  maxAttempts: number;
}

/** What agents 1–4 hand to the two tails and the finaliser. Plain JSON. */
export interface PreparedContext {
  runStartedAtIso: string;
  states: AgentState[];
  metrics: MetricsSnapshot;
  decisions: AgentDecisionEntry[];
  project: {
    id: string;
    title: string;
    titleAr: string | null;
    etimadRef: string | null;
    category: string | null;
    currency: string;
    saudizationTarget: number | null;
  };
  entities: IngestionEntities;
  rows: ComplianceMatrixRow[];
  score: number;
  technical: ReturnType<typeof runTechnicalArchitect>;
  financial: ReturnType<typeof runFinancialAgent>;
  coverage: CoveragePlan;
  brand: { tagline: string | null; taglineAr: string | null; vision2030Alignment: string | null } | null;
  workspaceIdentity: { name: string; nameAr: string | null } | null;
  /** Active restriction texts, in the order the stages used to read them. */
  restrictions: string[];
  restrictionsText: string;
  /** Approved evidence ids the validation gate checks citations against. */
  evidenceDocIds: string[];
  knowledgeFindings: string[];
}

/** A stage that ended the run itself has already written the row. */
export type StageFailure = { ok: false; result: OrchestratorResult };
/** A step whose function died without the stage getting to write anything. */
export type StageCrash = { ok: false; crashed: string };

export type PrepareOutcome = { ok: true; ctx: PreparedContext } | StageFailure;
export type DraftingOutcome =
  | {
      ok: true;
      proposalId: string;
      provider: string;
      /** The model stopped at the cap; the workflow runs one continuation step. */
      truncated: boolean;
      metrics: MetricsSnapshot;
      decisions: AgentDecisionEntry[];
    }
  | StageFailure;
export type LawOutcome =
  | {
      ok: true;
      contractId: string;
      contractValidation: ReturnType<typeof validateContractDraft>;
      researchedAt: string;
      articles: number;
      provider: string;
      metrics: MetricsSnapshot;
      decisions: AgentDecisionEntry[];
    }
  | StageFailure;

const ALL_AGENT_IDS: ReadonlySet<AgentId> = new Set(AGENTS.map((a) => a.id));

function agentLabel(id: AgentId, locale: "ar" | "en" = "en") {
  return {
    name: tr(`agent_${id}_name` as Parameters<typeof tr>[0], locale),
    nameAr: tr(`agent_${id}_name` as Parameters<typeof tr>[0], "ar"),
  };
}

/** Clamps recorded progress to the whole 0–100 count the analytics payload accepts. */
function toProgressPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function initStates(locale: Locale = "ar"): AgentState[] {
  return AGENTS.map((a) => ({
    id: a.id,
    ...agentLabel(a.id, locale),
    status: "pending" as const,
    progress: 0,
  }));
}

/**
 * The pipeline is a background operation, so analytics provenance comes from
 * the run's stored workspace and the member recorded as its initiator
 * (requirement 4.5). Every terminal transition derives its elapsed time from
 * the recorded start instant (requirement 4.2).
 */
function originOf(input: PipelineInput) {
  return analyticsBackgroundOrigin({
    subjectWorkspaceId: input.workspaceId,
    initiatorUserId: input.userId,
  });
}

function currentResult(
  row: { status: string; agentStates: string | null; overallProgress?: number; errorMessage?: string | null },
  fallbackStates: AgentState[],
): OrchestratorResult {
  const states = parseAgentStates(row.agentStates) ?? fallbackStates;
  const status = row.status as OrchestratorResult["status"];
  return {
    agentStates: states,
    overallProgress: row.overallProgress ?? Math.round(states.reduce((s, a) => s + a.progress, 0) / Math.max(states.length, 1)),
    status: status === "RUNNING" || status === "COMPLETED" || status === "FAILED" || status === "CANCELLED" ? status : "FAILED",
    errorMessage: row.errorMessage ?? undefined,
  };
}

/** The drafting call's inputs, from the prepared context; the continuation reuses them. */
function draftingInputsFrom(ctx: PreparedContext, locale: Locale): Omit<DraftProposalOptions, "onDelta"> {
  const tenderType = getTenderType(ctx.project.category);
  return {
    projectTitle: ctx.project.title,
    etimadRef: ctx.project.etimadRef,
    tenderTypeName: `${tenderType.name} / ${tenderType.nameAr}`,
    entities: ctx.entities,
    complianceRows: ctx.rows,
    technical: ctx.technical,
    financial: ctx.financial as FinancialExtract,
    coverage: ctx.coverage,
    brandTagline: resolveBidderDisplayName(
      locale,
      ctx.brand ? { tagline: ctx.brand.tagline, taglineAr: ctx.brand.taglineAr } : null,
      { name: ctx.workspaceIdentity?.name, nameAr: ctx.workspaceIdentity?.nameAr },
    ),
    vision2030: ctx.brand?.vision2030Alignment ?? "thriving-economy",
    locale,
    restrictions: ctx.restrictionsText,
  };
}

/**
 * A retried attempt starts from the prepared context, whose copy of the agent
 * has no findings; the note the previous attempt left on the row ("Provider …
 * — retrying (attempt 2 of 3)") would vanish at its first mark. Carry it.
 */
async function carryRetryFindings(recorder: RunRecorder, agentId: AgentId, attempt: StageAttempt): Promise<void> {
  if (attempt.attempt <= 1) return;
  const row = await recorder.readRow();
  const previous = parseAgentStates(row.agentStates)?.find((s) => s.id === agentId);
  const idx = recorder.states.findIndex((s) => s.id === agentId);
  if (previous?.findings?.length && idx >= 0) {
    recorder.states[idx] = { ...recorder.states[idx], findings: previous.findings };
  }
}

/**
 * One failure path for every stage.
 *
 * Cancelled by the user: record it. Ended from outside (the stale check failed
 * the row, or the other tail already failed it): write nothing, report the row.
 * A provider that was busy, slow or briefly down, with attempts left: note it
 * on the agent and let the workflow retry the whole stage after a delay.
 * Anything else: fail the run with the classified reason, as before.
 */
async function settleStageFailure(
  err: unknown,
  opts: {
    input: PipelineInput;
    recorder: RunRecorder;
    agentId?: AgentId;
    attempt: StageAttempt;
    runStartedAtIso: string;
  },
): Promise<StageFailure> {
  const { input, recorder, attempt } = opts;
  const origin = originOf(input);
  if (err instanceof PipelineCancelledError) {
    if (err.status !== "CANCELLED") {
      // Terminal under our feet: the row already says what happened; only this
      // stage's own card is told the run ended while it was still working.
      if (opts.agentId) {
        try {
          await recorder.markInterrupted(opts.agentId);
        } catch (markErr) {
          console.warn("[orchestrator] could not mark the interrupted agent", markErr);
        }
      }
      const row = await db.agentRun.findUnique({
        where: { id: input.runId },
        select: { status: true, agentStates: true, overallProgress: true, errorMessage: true },
      });
      return { ok: false, result: row ? currentResult(row, recorder.states) : currentResult({ status: err.status, agentStates: null }, recorder.states) };
    }
    const overall = await recorder.cancel();
    await recordAgentRunAnalyticsEvent({
      eventType: "agent_run_cancelled",
      runId: input.runId,
      origin,
      startedAt: opts.runStartedAtIso,
      metadata: {
        projectId: input.projectId,
        outcomeReason: "cancelled_by_user",
        progressPercent: toProgressPercent(overall),
      },
    });
    return {
      ok: false,
      result: { agentStates: recorder.states, overallProgress: overall, status: "CANCELLED", errorMessage: "Cancelled by user" },
    };
  }

  const message = err instanceof Error ? err.message : "Agent pipeline failed";
  const kind = classifyRunFailure(err);
  console.error("[orchestrator]", err);

  if (isTransientRunFailure(kind) && attempt.attempt < attempt.maxAttempts) {
    if (opts.agentId) {
      const state = recorder.states.find((s) => s.id === opts.agentId);
      try {
        await recorder.mark(opts.agentId, {
          status: "running",
          findings: [
            ...(state?.findings ?? []),
            retryFindingLine(kind, attempt.attempt + 1, attempt.maxAttempts),
          ],
        });
      } catch (markErr) {
        if (markErr instanceof PipelineCancelledError) return settleStageFailure(markErr, opts);
        throw markErr;
      }
    }
    throw new RetryableError(message, { retryAfter: transientRetryDelayMs(kind) });
  }

  try {
    if (opts.agentId) {
      // The card that was "running" when the run failed says so.
      const idx = recorder.states.findIndex((s) => s.id === opts.agentId);
      if (idx >= 0) {
        recorder.states[idx] = {
          ...recorder.states[idx],
          status: "failed",
          completedAt: new Date().toISOString(),
        };
      }
    }
    const overall = await recorder.persist("FAILED", message, kind);
    // The provider message stays in the run record and the server log; the
    // analytics payload carries only a closed outcome code (requirement 4.6).
    await recordAgentRunAnalyticsEvent({
      eventType: "agent_run_failed",
      runId: input.runId,
      origin,
      startedAt: opts.runStartedAtIso,
      metadata: {
        projectId: input.projectId,
        outcomeReason: "pipeline_error",
        progressPercent: toProgressPercent(overall),
      },
    });
    return { ok: false, result: { agentStates: recorder.states, overallProgress: overall, status: "FAILED", errorMessage: message } };
  } catch (inner) {
    if (inner instanceof PipelineCancelledError) return settleStageFailure(inner, opts);
    throw inner;
  }
}

/**
 * Stage 1 — agents 1–4 (ingestion, compliance, technical, financial) and the
 * coverage plan. They share the extracted corpus, so they stay in one step.
 */
export async function runPreparationStage(
  input: PipelineInput,
  attempt: StageAttempt,
): Promise<PrepareOutcome> {
  const locale: Locale = input.locale === "en" ? "en" : "ar";
  const states = initStates(locale);
  const logger = createDecisionLogger();
  const metrics = createMetricsTracker(input.runId, input.projectId);
  const runStartedAtIso = new Date().toISOString();
  const analyticsOrigin = originOf(input);
  const recorder = createRunRecorder({ runId: input.runId, states, owned: ALL_AGENT_IDS });
  const { mark, persist } = recorder;

  decision(logger, {
    agentId: "ORCHESTRATOR",
    ruleId: "orchestration-order",
    sourceCategory: "INTERNAL_RECOMMENDATION",
    message: `Pipeline start for project ${input.projectId} locale=${locale} mode=${input.regenerateMode ?? "create"} attempt=${attempt.attempt}`,
    inputs: truncateForLog({ projectId: input.projectId, workspaceId: input.workspaceId, regenerateMode: input.regenerateMode, docsCount: undefined }) as Record<string, unknown>,
    runId: input.runId,
  });

  try {
    return await withHeartbeat(recorder, async (): Promise<PrepareOutcome> => {
    await persist("RUNNING");


    // Tenant predicate is mandatory: the pipeline is reachable from callers that
    // accept a client-supplied project identifier, so ownership is re-asserted
    // here rather than trusted from the caller.
    const project = await db.tenderProject.findFirst({
      where: { id: input.projectId, workspaceId: input.workspaceId },
    });
    if (!project) {
      throw new Error("Project not found");
    }

    const docs = await db.uploadedDocument.findMany({
      where: { projectId: input.projectId, workspaceId: input.workspaceId },
      orderBy: { createdAt: "asc" },
    });

    // ─── Agent 1: INGESTION ───────────────────────────────────────────────
    await mark("INGESTION", { status: "running", progress: 10, startedAt: new Date().toISOString() });
    metrics.startAgent("INGESTION");
    logger.startTimer("ingestion-extraction");

    const extractionConcurrency = AGENT_CONFIG.PERFORMANCE.maxParallelExtractions ?? 3;
    const texts: string[] = [];
    const extractionQueue = [...docs];
    const extractionWorkers: Promise<void>[] = [];
    const extractionErrors: string[] = [];

    for (let w = 0; w < Math.min(extractionConcurrency, extractionQueue.length); w++) {
      extractionWorkers.push(
        (async () => {
          while (extractionQueue.length > 0) {
            const docItem = extractionQueue.shift();
            if (!docItem) break;
            try {
              const t = await extractTextFromStorage(docItem.storagePath, docItem.mimeType, docItem.originalName);
              if (t) texts.push(`--- ${docItem.originalName} (${docItem.docCategory}) ---\n${t}`);
              decision(logger, {
                agentId: "INGESTION",
                ruleId: "text-extraction-routing",
                sourceCategory: "DETERMINISTIC_CALC",
                message: `Extracted ${docItem.originalName} (${t?.length ?? 0} chars)`,
                inputs: truncateForLog({ docId: docItem.id, category: docItem.docCategory, mime: docItem.mimeType }) as Record<string, unknown>,
                output: `${t?.length ?? 0} chars`,
                runId: input.runId,
              });
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              extractionErrors.push(`${docItem.originalName}: ${msg}`);
              metrics.failAgent("INGESTION", msg);
              decision(logger, {
                agentId: "INGESTION",
                ruleId: "text-extraction-routing",
                sourceCategory: "DETERMINISTIC_CALC",
                level: "WARNING",
                message: `Failed extraction ${docItem.originalName}`,
                evidence: msg,
                runId: input.runId,
              });
            }
          }
        })()
      );
    }

    await Promise.all(extractionWorkers);
    const extractionDuration = logger.endTimer("ingestion-extraction");
    const combined = texts.join("\n\n");

    decision(logger, {
      agentId: "INGESTION",
      ruleId: "sla-preservation",
      sourceCategory: "EXPLICIT_TENDER",
      message: `Combined ${texts.length}/${docs.length} docs, ${combined.length} chars, extraction ${extractionDuration}ms`,
      inputs: truncateForLog({ docsCount: docs.length, combinedLength: combined.length }) as Record<string, unknown>,
      output: `${texts.length} texts`,
      evidence: extractionErrors.length ? extractionErrors.join("; ") : undefined,
      runId: input.runId,
    });

    if (!combined && docs.length === 0) {
      await mark("INGESTION", {
        status: "failed",
        progress: 100,
        completedAt: new Date().toISOString(),
        output: {
          ar: "لم يتم رفع أي مستند",
          en: "No documents uploaded",
        },
        findings: ["Upload at least one RFP / conditions booklet before running agents"],
      });
      const overall = await persist("FAILED", "No documents uploaded for ingestion", "INVALID_INPUT");
      await recordAgentRunAnalyticsEvent({
        eventType: "agent_run_failed",
        runId: input.runId,
        origin: analyticsOrigin,
        startedAt: runStartedAtIso,
        metadata: {
          projectId: input.projectId,
          outcomeReason: "no_documents",
        },
      });
      return {
        ok: false,
        result: { agentStates: states, overallProgress: overall, status: "FAILED", errorMessage: "No documents uploaded" },
      };
    }

    let entities: IngestionEntities = parseTenderText(
      combined || `Tender project: ${project.title}`,
      project.category
    );

    // AI skill: refine ingestion narrative / evidence (numbers stay from deterministic parse)
    const ingestionAi = await enrichIngestionWithAi({
      deterministic: entities,
      excerpt: combined.slice(0, 6000),
    });
    if (ingestionAi.data) {
      const refined = ingestionAi.data as Partial<IngestionEntities> & {
        refinementNotes?: string[];
        evidence?: string[];
        scope?: string;
      };
      if (typeof refined.scope === "string" && refined.scope.length > 40) {
        entities = { ...entities, scope: refined.scope };
      }
      if (Array.isArray(refined.evidence) && refined.evidence.length) {
        entities = {
          ...entities,
          evidence: [...entities.evidence, ...refined.evidence.map(String)].slice(0, 20),
        };
      }
      if (Array.isArray(refined.refinementNotes)) {
        entities.evidence.push(...refined.refinementNotes.map((n) => `AI: ${n}`).slice(0, 5));
      }
      entities.evidence.push(
        ingestionAi.fallback
          ? "Ingestion AI skill unavailable — deterministic parse used"
          : `Ingestion AI skill applied via ${ingestionAi.provider}`
      );
    }

    const summary = buildIngestionSummary(
      entities,
      docs.map((d) => d.originalName)
    );

    // Persist entities onto primary RFP/doc
    const primary =
      docs.find((d) => d.docCategory === "RFP") ??
      docs.find((d) => d.docCategory === "TECHNICAL_SPECS") ??
      docs[0];
    if (primary) {
      await db.uploadedDocument.update({
        where: { id: primary.id },
        data: {
          parseStatus: "PARSED",
          parsedSummary: summary.en,
          extractedEntities: JSON.stringify(entities),
        },
      });
    }

    await mark("INGESTION", {
      status: "completed",
      progress: 100,
      completedAt: new Date().toISOString(),
      output: summary,
      findings: [...entities.evidence, ...logger.getFindingsForState(10)],
    });
    metrics.completeAgent("INGESTION", {
      evidenceCount: entities.evidence.length,
      // Straight from the AI call. Reading it back out of the evidence prose
      // missed the case that matters: enrichJson returns data:null on failure,
      // the prose is only written when data exists, so a hard failure recorded
      // a clean run.
      enriched: !ingestionAi.fallback && !!ingestionAi.data,
      fallback: ingestionAi.fallback,
      provider: ingestionAi.provider,
    });

    // Persist tender requirements matrix (structure + account linking)
    try {
      const { persistTenderRequirements } = await import("../requirements");
      await persistTenderRequirements(
        project.id,
        project.workspaceId,
        entities,
        combined
      );
    } catch (err) {
      console.warn("[orchestrator] requirements persist failed", err);
    }

    // ─── Agent 2: COMPLIANCE_REGULATORY ───────────────────────────────────
    metrics.startAgent("COMPLIANCE_REGULATORY");
    logger.startTimer("compliance");
    await mark("COMPLIANCE_REGULATORY", {
      status: "running",
      progress: 15,
      startedAt: new Date().toISOString(),
    });

    decision(logger, {
      agentId: "COMPLIANCE_REGULATORY",
      ruleId: "pdpl-residency-explicit",
      sourceCategory: "EXPLICIT_TENDER",
      message: `Starting compliance evaluation with ${combined.length} chars corpus`,
      inputs: truncateForLog({ combinedLength: combined.length, frameworks: AGENT_CONFIG.COMPLIANCE.frameworks }) as Record<string, unknown>,
      runId: input.runId,
    });

    let { rows, findings: cFindings, score } = evaluateCompliance({
      tenderText: combined,
      entities,
      tenderCategory: project.category,
      saudizationTarget: project.saudizationTarget,
      localContentTarget: project.localContentTarget,
    });

    const complianceAi = await enrichComplianceWithAi({
      rows: rows.slice(0, 30),
      findings: cFindings,
      score,
      tenderExcerpt: combined.slice(0, 4000),
    });
    if (complianceAi.data) {
      const updates = (complianceAi.data.rowUpdates as Array<{
        controlId: string;
        evidence?: string;
        status?: string;
        remediation?: string | null;
      }>) ?? [];
      const byId = new Map(updates.map((u) => [u.controlId, u]));
      rows = rows.map((r) => {
        const u = byId.get(r.controlId);
        if (!u) return r;
        return {
          ...r,
          evidence: u.evidence || r.evidence,
          status: (u.status as typeof r.status) || r.status,
          remediation: u.remediation ?? r.remediation,
        };
      });
      const extra = (complianceAi.data.findings as string[]) ?? [];
      cFindings = [
        ...cFindings,
        ...extra,
        complianceAi.fallback
          ? "Compliance AI skill unavailable — rule matrix used"
          : `Compliance AI skill applied via ${complianceAi.provider}`,
      ];
      const compliant = rows.filter((r) => r.status === "COMPLIANT").length;
      score = rows.length ? Math.round((compliant / rows.length) * 100) : score;
    }

    // Upsert compliance checks from matrix
    for (const row of rows) {
      const existing = await db.complianceCheck.findFirst({
        where: { projectId: input.projectId, controlId: row.controlId },
      });
      if (existing) {
        await db.complianceCheck.update({
          where: { id: existing.id },
          data: {
            status: row.status,
            evidence: row.evidence,
            remediation: row.remediation ?? null,
          },
        });
      } else {
        await db.complianceCheck.create({
          data: {
            projectId: input.projectId,
            framework: row.frameworkId,
            controlId: row.controlId,
            title: row.title,
            titleAr: row.title,
            requirement: row.evidence,
            status: row.status,
            evidence: row.evidence,
            remediation: row.remediation ?? null,
            complianceLevel: "C1",
          },
        });
      }
    }

    const complianceDuration = logger.endTimer("compliance");
    decision(logger, {
      agentId: "COMPLIANCE_REGULATORY",
      ruleId: "sla-tender-vs-statutory-separation",
      sourceCategory: "EXPLICIT_TENDER",
      message: `Compliance completed ${rows.length} controls, score ${score}% in ${complianceDuration}ms`,
      inputs: truncateForLog({ rowsCount: rows.length, score }) as Record<string, unknown>,
      output: `score ${score}%`,
      runId: input.runId,
    });

    await mark("COMPLIANCE_REGULATORY", {
      status: "completed",
      progress: 100,
      completedAt: new Date().toISOString(),
      output: {
        ar: `نتيجة الامتثال ${score}% بعد تقييم ${rows.length} ضابطاً تنظيمياً`,
        en: `Compliance score ${score}% across ${rows.length} regulatory controls`,
      },
      findings: [...cFindings, ...logger.getEntries().filter(e=>e.agentId==="COMPLIANCE_REGULATORY").slice(-3).map(e=>`${e.ruleId}: ${e.message}`)],
    });
    metrics.completeAgent("COMPLIANCE_REGULATORY", {
      complianceScore: score,
      evidenceCount: rows.length,
      enriched: !complianceAi.fallback && !!complianceAi.data,
      fallback: complianceAi.fallback,
      provider: complianceAi.provider,
    });

    // ─── Agent 3: TECHNICAL_ARCHITECT ─────────────────────────────────────
    metrics.startAgent("TECHNICAL_ARCHITECT");
    logger.startTimer("technical");
    await mark("TECHNICAL_ARCHITECT", {
      status: "running",
      progress: 20,
      startedAt: new Date().toISOString(),
    });

    const brand = await db.brandProfile.findFirst({
      where: { workspaceId: input.workspaceId },
    });
    const workspaceIdentity = await db.workspace.findUnique({
      where: { id: input.workspaceId },
      select: { name: true, nameAr: true },
    });
    const reviewedWhere = {
      approved: true,
      reviewStatus: "APPROVED" as const,
      revokedAt: null,
      evidenceRef: { not: null },
      provenanceJson: { not: null },
      reviewedById: { not: null },
      approvedAt: { not: null },
      contentHash: { not: null },
    };
    const pastRows = await db.pastProject.findMany({
      where: {
        workspaceId: input.workspaceId,
        ...reviewedWhere,
      },
    });
    const now = new Date();
    const [libraryRows, methodologyRows, restrictions, certificateRows] =
      await Promise.all([
      db.contentLibraryItem.findMany({
        where: {
          workspaceId: input.workspaceId,
          ...reviewedWhere,
          restricted: false,
        },
      }),
      db.methodologyAsset.findMany({
        where: { workspaceId: input.workspaceId, ...reviewedWhere },
      }),
      db.restriction.findMany({
        where: { workspaceId: input.workspaceId, active: true },
      }),
      db.certificate.findMany({
        where: {
          workspaceId: input.workspaceId,
          ...reviewedWhere,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
      }),
    ]);
    const past = pastRows.filter((project) =>
      isPastProjectEligible({
        ...project,
        expectedContentHash: hashKnowledgeContent(
          pastProjectKnowledgeContent(project)
        ),
      }).eligible
    );
    const libraryItems = libraryRows.filter((item) =>
      isLibraryItemEligible({
        ...item,
        expectedContentHash: hashKnowledgeContent(
          libraryKnowledgeContent(item)
        ),
      }).eligible
    );
    const methodologies = methodologyRows.filter((methodology) =>
      isMethodologyEligible({
        ...methodology,
        expectedContentHash: hashKnowledgeContent(
          methodologyKnowledgeContent(methodology)
        ),
      }).eligible
    );
    const validCerts = certificateRows.filter((certificate) =>
      isCertificateValid({
        ...certificate,
        now,
        expectedContentHash: hashKnowledgeContent(
          certificateKnowledgeContent(certificate)
        ),
      }).eligible
    );
    const ragDocs: RagDocument[] = [];
    for (const p of past) {
      if (!isQualityPastProjectTitle(p.title)) continue;
      let embedding: number[] | null = p.embeddingJson
        ? (JSON.parse(p.embeddingJson) as number[])
        : null;
      if (!embedding?.length) {
        embedding = await embedText(`${p.title}\n${p.summary}\n${p.sector ?? ""}\n${p.tags ?? ""}`);
        if (embedding) {
          await db.pastProject.update({
            where: { id: p.id },
            data: { embeddingJson: JSON.stringify(embedding) },
          });
        }
      }
      ragDocs.push({
        id: p.id,
        title: p.title,
        summary: p.summary,
        sector: p.sector,
        clientName: p.clientName,
        contractValue: p.contractValue,
        tags: p.tags,
        embedding,
      });
    }
    for (const item of libraryItems) {
      ragDocs.push({
        id: item.id,
        title: `[Library] ${item.title}`,
        summary: item.bodyMd.slice(0, 1500),
        tags: item.tags,
        embedding: item.embeddingJson
          ? (JSON.parse(item.embeddingJson) as number[])
          : null,
      });
    }
    for (const m of methodologies) {
      ragDocs.push({
        id: m.id,
        title: `[Methodology:${m.category}] ${m.title}`,
        summary: m.bodyMd.slice(0, 1500),
        tags: m.category,
        embedding: null,
      });
    }
    for (const c of validCerts) {
      ragDocs.push({
        id: c.id,
        title: `[Certificate:${c.certType}] ${c.name}`,
        summary: [
          c.number ? `Number: ${c.number}` : null,
          c.issuer ? `Issuer: ${c.issuer}` : null,
          c.expiresAt ? `Expires: ${c.expiresAt.toISOString().slice(0, 10)}` : "No expiry",
          c.notes,
        ]
          .filter(Boolean)
          .join("\n")
          .slice(0, 1500),
        tags: c.certType,
        embedding: null,
      });
    }
    const knowledgeFindings = [
      `Approved past projects: ${past.length}`,
      `Approved library items: ${libraryItems.length}`,
      "Staff claims: excluded until evidence review is available",
      `Approved methodologies: ${methodologies.length}`,
      `Valid certificates (non-expired): ${validCerts.length}/${certificateRows.length}`,
    ];
    const restrictionsText = restrictions
      .map((r) => `${r.restrictionType}: ${r.text}`)
      .join("\n");

    const queryEmbedding = await embedText(
      sanitizeText(
        `${project.title}\n${entities.scope}\n${entities.milestones.map((m) => m.name).join(" ")}`
      )
    );

    const tenderCorpus = await loadProjectTenderCorpus(input.projectId);

    let technical = runTechnicalArchitect({
      entities,
      pastProjects: ragDocs,
      tenderCorpus,
      vision2030Alignment: brand?.vision2030Alignment,
      queryEmbedding,
      locale,
    });

    const technicalAi = await enrichTechnicalWithAi({
      solutionApproach: technical.solutionApproach,
      vision2030Notes: technical.vision2030Notes,
      deliveryModel: technical.deliveryModel,
      governance: technical.governance,
      qualityPlan: technical.qualityPlan,
      riskPlan: technical.riskPlan,
      securityPrivacy: technical.securityPrivacy,
      serviceManagement: technical.serviceManagement,
      trainingTransition: technical.trainingTransition,
      continuity: technical.continuity,
      evaluationAlignment: technical.evaluationAlignment,
      methodology: technical.methodology,
      matchedProjects: technical.matchedProjects,
      ragContext: technical.ragContext,
      tenderContext: technical.tenderContext,
      scope: entities.scope,
    });
    if (technicalAi.data) {
      const d = technicalAi.data as Record<string, unknown>;
      const pick = (key: string, min: number, current: string) => {
        const v = d[key];
        return typeof v === "string" && v.length >= min ? v : current;
      };
      technical = {
        ...technical,
        solutionApproach: pick("solutionApproach", 40, technical.solutionApproach),
        vision2030Notes: pick("vision2030Notes", 20, technical.vision2030Notes),
        deliveryModel: pick("deliveryModel", 20, technical.deliveryModel),
        governance: pick("governance", 20, technical.governance),
        qualityPlan: pick("qualityPlan", 20, technical.qualityPlan),
        riskPlan: pick("riskPlan", 20, technical.riskPlan),
        securityPrivacy: pick("securityPrivacy", 20, technical.securityPrivacy),
        serviceManagement: pick(
          "serviceManagement",
          20,
          technical.serviceManagement
        ),
        trainingTransition: pick(
          "trainingTransition",
          20,
          technical.trainingTransition
        ),
        continuity: pick("continuity", 20, technical.continuity),
        evaluationAlignment: pick(
          "evaluationAlignment",
          20,
          technical.evaluationAlignment
        ),
        findings: [
          ...technical.findings,
          ...((d.findings as string[]) ?? []),
          technicalAi.fallback
            ? "Technical AI skill unavailable — RAG template used"
            : `Technical AI skill applied via ${technicalAi.provider}`,
        ],
      };
    }

    await mark("TECHNICAL_ARCHITECT", {
      status: "completed",
      progress: 100,
      completedAt: new Date().toISOString(),
      output: technical.solutionApproach.slice(0, 500),
      findings: technical.findings,
    });
    metrics.completeAgent("TECHNICAL_ARCHITECT", {
      evidenceCount: technical.matchedProjects.length,
      enriched: !technicalAi.fallback && !!technicalAi.data,
      fallback: technicalAi.fallback,
      provider: technicalAi.provider,
    });
    decision(logger, {
      agentId: "TECHNICAL_ARCHITECT",
      ruleId: "rag-retrieval-thresholds",
      sourceCategory: "APPROVED_KNOWLEDGE",
      message: `Technical completed with ${technical.matchedProjects.length} matches`,
      inputs: truncateForLog({ matchedProjects: technical.matchedProjects.length }) as Record<string, unknown>,
      output: `${technical.findings.length} findings`,
      runId: input.runId,
    });

    // ─── Agent 4: FINANCIAL_QUALIFICATION ─────────────────────────────────
    metrics.startAgent("FINANCIAL_QUALIFICATION");
    logger.startTimer("financial");
    await mark("FINANCIAL_QUALIFICATION", {
      status: "running",
      progress: 20,
      startedAt: new Date().toISOString(),
    });

    const financialDocs = docs.filter((d) => d.docCategory === "FINANCIAL" || d.docCategory === "QUALIFICATION");
    let financialText = "";
    for (const d of financialDocs) {
      financialText +=
        "\n" +
        (await extractTextFromStorage(d.storagePath, d.mimeType, d.originalName));
    }
    // Also search combined for financial figures
    if (!financialText.trim()) financialText = combined;

    let financial = runFinancialAgent({
      financialText,
      entities,
      projectBudget: project.budget,
      currency: project.currency,
      tenderText: combined,
    });

    const financialAi = await enrichFinancialWithAi({
      financial,
      budget: project.budget,
      currency: project.currency,
    });
    if (financialAi.data) {
      const d = financialAi.data as {
        notes?: string[];
        findings?: string[];
        narrative?: string;
      };
      financial = {
        ...financial,
        notes: [
          ...financial.notes,
          ...((d.notes as string[]) ?? []),
          ...(typeof d.narrative === "string" ? [d.narrative] : []),
        ].slice(0, 20),
        findings: [
          ...financial.findings,
          ...((d.findings as string[]) ?? []),
          financialAi.fallback
            ? "Financial AI skill unavailable — deterministic QLR/BoQ used"
            : `Financial AI skill applied via ${financialAi.provider}`,
        ],
      };
    }

    const finDuration = logger.endTimer("financial");
    decision(logger, {
      agentId: "FINANCIAL_QUALIFICATION",
      ruleId: "qlr-formula-exact",
      sourceCategory: "DETERMINISTIC_CALC",
      message: `Financial QLR ${financial.quickLiquidityRatio ?? "N/A"} BoQ ${financial.boqItems.length} lines in ${finDuration}ms`,
      inputs: truncateForLog({ boqLines: financial.boqItems.length, qlr: financial.quickLiquidityRatio }) as Record<string, unknown>,
      runId: input.runId,
    });

    await mark("FINANCIAL_QUALIFICATION", {
      status: "completed",
      progress: 100,
      completedAt: new Date().toISOString(),
      output: {
        ar:
          financial.quickLiquidityRatio === null
            ? `جدول الكميات: ${financial.boqItems.length} بنداً. نسبة السيولة السريعة غير متاحة — القوائم المالية ناقصة`
            : `نسبة السيولة السريعة ${financial.quickLiquidityRatio}. جدول الكميات: ${financial.boqItems.length} بنداً`,
        en:
          financial.quickLiquidityRatio === null
            ? `Bill of quantities: ${financial.boqItems.length} line(s). Quick liquidity ratio unavailable — financial statements incomplete`
            : `Quick liquidity ratio ${financial.quickLiquidityRatio}. Bill of quantities: ${financial.boqItems.length} line(s)`,
      },
      findings: financial.findings,
    });
    metrics.completeAgent("FINANCIAL_QUALIFICATION", {
      evidenceCount: financial.boqItems.length,
      enriched: !financialAi.fallback && !!financialAi.data,
      fallback: financialAi.fallback,
      provider: financialAi.provider,
    });

    // ─── Coverage plan (requirement → evidence matrix) ────────────────────
    const coverage = buildCoveragePlan({
      entities,
      evidenceDocs: ragDocs,
      complianceRows: rows as ComplianceMatrixRow[],
      locale,
    });

    try {
      const { applyCoveragePlanToRequirements } = await import("../requirements");
      await applyCoveragePlanToRequirements(input.projectId, coverage);
    } catch (err) {
      console.warn("[orchestrator] coverage sync failed", err);
    }

    return {
      ok: true,
      ctx: {
        runStartedAtIso,
        states,
        metrics: metrics.snapshot(),
        decisions: logger.getEntries(),
        project: {
          id: project.id,
          title: project.title,
          titleAr: project.titleAr,
          etimadRef: project.etimadRef,
          category: project.category,
          currency: project.currency,
          saudizationTarget: project.saudizationTarget,
        },
        entities,
        rows: rows as ComplianceMatrixRow[],
        score,
        technical,
        financial,
        coverage,
        brand: brand
          ? { tagline: brand.tagline, taglineAr: brand.taglineAr, vision2030Alignment: brand.vision2030Alignment }
          : null,
        workspaceIdentity: workspaceIdentity
          ? { name: workspaceIdentity.name, nameAr: workspaceIdentity.nameAr }
          : null,
        restrictions: restrictions.map((r) => r.text),
        restrictionsText,
        evidenceDocIds: ragDocs.map((d) => d.id),
        knowledgeFindings,
      },
    };
    });
  } catch (err) {
    return settleStageFailure(err, {
      input,
      recorder,
      agentId: states.find((s) => s.status === "running")?.id ?? "INGESTION",
      attempt,
      runStartedAtIso,
    });
  }
}

/** Stage 2a — agent 5, the proposal. Runs beside the contract with its own window. */
export async function runDraftingStage(
  input: PipelineInput,
  ctx: PreparedContext,
  attempt: StageAttempt,
  /** The run's live draft stream, when the step opened one. */
  sink?: DraftStreamSink,
): Promise<DraftingOutcome> {
  const locale: Locale = input.locale === "en" ? "en" : "ar";
  const states = ctx.states.map((s) => ({ ...s }));
  const logger = createDecisionLogger(ctx.decisions);
  const metrics = createMetricsTracker(input.runId, input.projectId, ctx.metrics);
  const recorder = createRunRecorder({ runId: input.runId, states, owned: new Set<AgentId>(["PROPOSAL_DRAFTING"]) });
  const { mark } = recorder;
  const {
    project, entities, rows, score, technical, financial, coverage,
    restrictions, evidenceDocIds, knowledgeFindings,
  } = ctx;

  // A retried attempt appends to the same stream; the page starts over on `reset`.
  sink?.reset(attempt.attempt);
  let streamedChars = 0;
  let draftStreamed = false;
  let draftTruncated = false;

  try {
    await carryRetryFindings(recorder, "PROPOSAL_DRAFTING", attempt);
    return await withHeartbeat(recorder, async (): Promise<DraftingOutcome> => {
    metrics.startAgent("PROPOSAL_DRAFTING");
    logger.startTimer("drafting");
    await mark("PROPOSAL_DRAFTING", {
      status: "running",
      progress: 25,
      startedAt: new Date().toISOString(),
    });

    const draft = await draftProposal({
      ...draftingInputsFrom(ctx, locale),
      onDelta: sink
        ? (text) => {
            streamedChars += text.length;
            sink.push(text);
          }
        : undefined,
    });
    // A transport that cannot stream (SDK paths) delivers the whole draft at
    // once; the page still gets to show it.
    if (sink && streamedChars === 0 && draft.contentMd) sink.push(draft.contentMd);
    // A cut-off draft is continued by the next step on this same stream.
    await sink?.done(draft.truncated, draft.truncated ? { continues: true } : undefined);
    draftStreamed = true;
    draftTruncated = draft.truncated;

    // Mandatory validation gate (blocks marking export-ready)
    const { validateProposalOutput } = await import("../validation-gate");
    const validationReport = validateProposalOutput({
      contentMd: draft.contentMd,
      financial: financial as FinancialExtract,
      entities,
      complianceRows: rows as ComplianceMatrixRow[],
      restrictions,
      approvedEvidenceIds: evidenceDocIds,
    });

    const artifacts = [
      {
        type: "PDF",
        filename: "Technical_Proposal.pdf",
        downloadPath: `/api/proposals/PLACEHOLDER/download?format=pdf`,
      },
      {
        type: "PPTX",
        filename: "Technical_Proposal_Slides.pptx",
        downloadPath: `/api/proposals/PLACEHOLDER/download?format=pptx`,
      },
      {
        type: "HTML",
        filename: "Technical_Proposal_Slides.html",
        downloadPath: `/api/proposals/PLACEHOLDER/download?format=slides`,
      },
      {
        type: "XLSX",
        filename: "Compliance_Matrix.xlsx",
        downloadPath: `/api/proposals/PLACEHOLDER/download?format=ea-matrix`,
      },
      {
        type: "XLSX",
        filename: "Financial_BoQ.xlsx",
        downloadPath: `/api/proposals/PLACEHOLDER/download?format=boq`,
      },
      {
        type: "ZIP",
        filename: "Arabclue_Bid_Package.zip",
        downloadPath: `/api/proposals/PLACEHOLDER/download?format=zip`,
      },
    ];

    const titleEn = `Technical & Financial Proposal — ${project.title}`;
    const titleAr = `العطاء الفني والمالي — ${project.titleAr ?? project.title}`;
    const status = validationReport.blocking ? "DRAFT" : "GENERATED";
    const financialFormsJson = JSON.stringify({
      boqItems: financial.boqItems,
      currency: project.currency,
      updatedAt: new Date().toISOString(),
      source: "agent_structure_only",
    });

    let proposal: {
      id: string;
      version: number;
      artifactsJson: string | null;
    };

    const targetId = input.targetProposalId ?? null;
    const mode = input.regenerateMode;

    if (mode === "version" && targetId) {
      const existing = await db.generatedProposal.findFirst({
        where: {
          id: targetId,
          projectId: input.projectId,
          workspaceId: input.workspaceId,
        },
      });
      if (!existing) {
        throw new Error("Target proposal not found for version regenerate");
      }
      if (isProposalEditLocked(existing.status)) {
        throw new Error(
          "Target proposal is locked for editing in its current review status"
        );
      }
      const nextVersion = existing.version + 1;
      proposal = await db.$transaction(async (tx) => {
        const write = await tx.generatedProposal.updateMany({
          where: {
            id: existing.id,
            workspaceId: input.workspaceId,
            projectId: input.projectId,
            status: existing.status,
            version: existing.version,
            updatedAt: existing.updatedAt,
          },
          data: {
            title: titleEn,
            titleAr,
            status,
            version: nextVersion,
            locale,
            contentMd: draft.contentMd,
            artifactsJson: JSON.stringify(artifacts),
            financialFormsJson,
            complianceScore: score,
            generatedAt: new Date(),
            submittedAt: null,
            approvedAt: null,
            ...STRUCTURED_SNAPSHOT_INVALIDATION,
            ...CONTRACT_RENDER_SNAPSHOT_INVALIDATION,
          },
        });
        if (write.count !== 1) {
          throw new Error(
            "Target proposal changed concurrently; regenerate from the latest version"
          );
        }
        await tx.proposalReview.deleteMany({
          where: { proposalId: existing.id },
        });
        await tx.proposalVersion.create({
          data: {
            proposalId: existing.id,
            version: nextVersion,
            contentMd: draft.contentMd,
            changeLog: "AI regenerate (new version)",
            locale,
            createdBy: input.userId,
          },
        });
        return tx.generatedProposal.findUniqueOrThrow({
          where: { id: existing.id },
        });
      });
    } else {
      const parentProposalId =
        mode === "fork" && targetId ? targetId : null;
      if (parentProposalId) {
        const parent = await db.generatedProposal.findFirst({
          where: {
            id: parentProposalId,
            projectId: input.projectId,
            workspaceId: input.workspaceId,
          },
        });
        if (!parent) {
          throw new Error("Parent proposal not found for fork regenerate");
        }
      }
      proposal = await db.generatedProposal.create({
        data: {
          workspaceId: input.workspaceId,
          projectId: input.projectId,
          createdById: input.userId,
          parentProposalId,
          title: titleEn,
          titleAr,
          type: "COMBINED",
          status,
          version: 1,
          locale,
          contentMd: draft.contentMd,
          artifactsJson: JSON.stringify(artifacts),
          financialFormsJson,
          complianceScore: score,
          generatedAt: new Date(),
        },
      });

      await db.proposalVersion.create({
        data: {
          proposalId: proposal.id,
          version: 1,
          contentMd: draft.contentMd,
          changeLog: parentProposalId
            ? `Forked from ${parentProposalId}`
            : "Initial AI generation",
          locale,
          createdBy: input.userId,
        },
      });
    }

    const realArtifacts = artifacts.map((a) => ({
      ...a,
      downloadPath: a.downloadPath.replace("PLACEHOLDER", proposal.id),
    }));
    await db.generatedProposal.update({
      where: { id: proposal.id },
      data: {
        artifactsJson: JSON.stringify(realArtifacts),
      },
    });

    // Store BoQ on agent run finalArtifact for download generators
    await db.agentRun.update({
      where: { id: input.runId },
      data: {
        finalArtifact: JSON.stringify({
          proposalId: proposal.id,
          regenerateMode: mode ?? "create",
          parentProposalId: mode === "fork" ? targetId : null,
          boqItems: financial.boqItems,
          financial,
          coverage: {
            coveragePercent: coverage.coveragePercent,
            coveredCount: coverage.coveredCount,
            partialCount: coverage.partialCount,
            gapCount: coverage.gapCount,
            evaluationWeights: coverage.evaluationWeights,
            missingEvidenceTasks: coverage.missingEvidenceTasks,
            strengths: coverage.strengths,
            winStrategyNotes: coverage.winStrategyNotes,
            rows: coverage.rows,
          },
          technicalPackage: {
            evaluationAlignment: technical.evaluationAlignment,
            deliveryModel: technical.deliveryModel,
            matchedProjects: technical.matchedProjects,
          },
          complianceScore: score,
          provider: draft.provider,
          model: draft.model,
          tokensUsed: draft.tokensUsed,
          fallback: draft.fallback,
          // Stable reason when the live model degraded to the deterministic
          // template, plus a flag when the completion hit the token ceiling.
          failureKind: draft.failureKind ?? null,
          truncated: draft.truncated,
          validation: validationReport,
          knowledgeFindings,
          exportReady: !validationReport.blocking,
          slidesMetrics: {
            quickLiquidityRatio: financial.quickLiquidityRatio,
            qlrPasses: financial.qlrPasses,
            saudizationPercent: financial.saudizationPercent,
            saudizationTarget: project.saudizationTarget,
            complianceScore: score,
            localContentPreference: financial.localContentPreferenceApplied,
            coveragePercent: coverage.coveragePercent,
          },
        }),
      },
    });

    await db.tenderProject.update({
      where: { id: input.projectId },
      data: { status: "REVIEW" },
    });

    // Usage tracking
    const sub = await db.subscription.findUnique({ where: { userId: input.userId } });
    if (sub) {
      await db.subscription.update({
        where: { id: sub.id },
        data: {
          proposalsUsed: { increment: 1 },
          tokensUsed: { increment: draft.tokensUsed },
        },
      });
    }

    const draftingDuration = logger.endTimer("drafting");
    decision(logger, {
      agentId: "PROPOSAL_DRAFTING",
      ruleId: "validation-gate-blocking",
      sourceCategory: "DETERMINISTIC_CALC",
      level: validationReport.blocking ? "BLOCKING" : "INFO",
      message: `Proposal ${proposal.id} ${validationReport.blocking ? "BLOCKED" : "GENERATED"} coverage ${coverage.coveragePercent}% in ${draftingDuration}ms`,
      inputs: truncateForLog({ coveragePercent: coverage.coveragePercent, compliant: score, tokens: draft.tokensUsed }) as Record<string, unknown>,
      output: draft.provider,
      blocking: validationReport.blocking,
      runId: input.runId,
    });
    if (validationReport.blocking) metrics.blockExport();

    await mark("PROPOSAL_DRAFTING", {
      status: "completed",
      progress: 100,
      completedAt: new Date().toISOString(),
      output: {
        ar: `تمت صياغة العطاء — تغطية المتطلبات ${coverage.coveragePercent}%. ${engineNote(draft.fallback, "ar")}`,
        en: `Proposal drafted — ${coverage.coveragePercent}% requirement coverage. ${engineNote(draft.fallback, "en")}`,
      },
      findings: [
        `Tokens: ${draft.tokensUsed}`,
        `Compliance score: ${score}%`,
        `Requirement coverage: ${coverage.coveragePercent}% (${coverage.coveredCount} covered / ${coverage.gapCount} gaps)`,
        `Artifacts: ${realArtifacts.length}`,
        ...knowledgeFindings,
        validationReport.blocking
          ? `Validation BLOCKED export: ${validationReport.issues
              .filter((i) => i.severity === "error")
              .map((i) => i.code)
              .join(", ")}`
          : "Validation passed — draft ready for human review",
      ],
    });
    metrics.completeAgent("PROPOSAL_DRAFTING", {
      coveragePercent: coverage.coveragePercent,
      complianceScore: score,
      gapCount: coverage.gapCount,
      evidenceCount: realArtifacts.length,
      enriched: !draft.fallback,
      fallback: draft.fallback,
      provider: draft.provider,
      tokensUsed: draft.tokensUsed,
    });

    return {
      ok: true,
      proposalId: proposal.id,
      provider: draft.provider,
      truncated: draft.truncated,
      metrics: metrics.snapshot(),
      decisions: logger.getEntries(),
    };
    });
  } catch (err) {
    return settleStageFailure(err, { input, recorder, agentId: "PROPOSAL_DRAFTING", attempt, runStartedAtIso: ctx.runStartedAtIso });
  } finally {
    // Closed only once the draft finished whole. A failed attempt leaves the
    // stream open so the retry can keep writing to it (a closed stream answers
    // 409), and a truncated draft leaves it open for the continuation step.
    if (sink) await (draftStreamed && !draftTruncated ? sink.close() : sink.release());
  }
}

/**
 * Stage 2a′ — one continuation of a draft that stopped at the token cap.
 *
 * The model is shown the whole prompt and its own draft and asked to carry on
 * where it stopped; the continuation is appended, the validation gate re-run on
 * the whole, the proposal row and its latest version updated, and the tokens
 * streamed into the same live draft. Bounded to this one step: a draft still
 * truncated afterwards stays flagged. Best effort — a failure here leaves the
 * truncated proposal exactly as the drafting stage saved it and never fails
 * the run; the workflow catches a rejection and keeps the original outcome.
 */
export async function runDraftContinuationStage(
  input: PipelineInput,
  ctx: PreparedContext,
  prior: Extract<DraftingOutcome, { ok: true }>,
  sink?: DraftStreamSink,
): Promise<DraftingOutcome> {
  const locale: Locale = input.locale === "en" ? "en" : "ar";
  const states = ctx.states.map((s) => ({ ...s }));
  const recorder = createRunRecorder({ runId: input.runId, states, owned: new Set<AgentId>(["PROPOSAL_DRAFTING"]) });
  const logger = createDecisionLogger(prior.decisions);

  try {
    return await withHeartbeat(recorder, async (): Promise<DraftingOutcome> => {
      const proposal = await db.generatedProposal.findFirst({
        where: { id: prior.proposalId, workspaceId: input.workspaceId, projectId: input.projectId },
        select: { id: true, contentMd: true, version: true, status: true },
      });
      if (!proposal?.contentMd) return prior;

      const more = await continueProposalDraft({
        ...draftingInputsFrom(ctx, locale),
        draftSoFar: proposal.contentMd,
        onDelta: sink ? (text) => sink.push(text) : undefined,
      });
      if (more.fallback || !more.continuation.trim()) {
        await sink?.done(true);
        return prior;
      }

      const contentMd = appendContinuation(proposal.contentMd, more.continuation);
      const { validateProposalOutput } = await import("../validation-gate");
      const validationReport = validateProposalOutput({
        contentMd,
        financial: ctx.financial as FinancialExtract,
        entities: ctx.entities,
        complianceRows: ctx.rows,
        restrictions: ctx.restrictions,
        approvedEvidenceIds: ctx.evidenceDocIds,
      });
      const status = validationReport.blocking ? "DRAFT" : "GENERATED";

      await db.$transaction([
        db.generatedProposal.update({
          where: { id: proposal.id },
          data: {
            contentMd,
            status,
            ...STRUCTURED_SNAPSHOT_INVALIDATION,
            ...CONTRACT_RENDER_SNAPSHOT_INVALIDATION,
          },
        }),
        db.proposalVersion.updateMany({
          where: { proposalId: proposal.id, version: proposal.version },
          data: { contentMd },
        }),
      ]);

      // The run record's summary of the draft follows the completed text.
      const row = await db.agentRun.findUnique({ where: { id: input.runId }, select: { finalArtifact: true } });
      let artifact: Record<string, unknown> = {};
      try {
        artifact = row?.finalArtifact ? (JSON.parse(row.finalArtifact) as Record<string, unknown>) : {};
      } catch {
        artifact = {};
      }
      const priorTokens = typeof artifact.tokensUsed === "number" ? artifact.tokensUsed : 0;
      await db.agentRun.update({
        where: { id: input.runId },
        data: {
          finalArtifact: JSON.stringify({
            ...artifact,
            tokensUsed: priorTokens + more.tokensUsed,
            truncated: more.truncated,
            validation: validationReport,
            exportReady: !validationReport.blocking,
            continuation: { tokensUsed: more.tokensUsed, truncated: more.truncated, at: new Date().toISOString() },
          }),
        },
      });
      if (proposal.status !== status) {
        // Idempotent either way; recorded so the change of status is explained.
        decision(logger, {
          agentId: "PROPOSAL_DRAFTING",
          ruleId: "validation-gate-blocking",
          sourceCategory: "DETERMINISTIC_CALC",
          level: validationReport.blocking ? "BLOCKING" : "INFO",
          message: `Proposal ${proposal.id} ${status} after continuation`,
          runId: input.runId,
        });
      }

      const state = states.find((s) => s.id === "PROPOSAL_DRAFTING");
      await recorder.mark("PROPOSAL_DRAFTING", {
        findings: [
          ...(state?.findings ?? []),
          `Continued after the token cap (+${more.tokensUsed} tokens${more.truncated ? ", still cut off" : ""})`,
        ],
      });
      await sink?.done(more.truncated);
      return { ...prior, truncated: more.truncated, decisions: logger.getEntries() };
    });
  } catch (err) {
    if (err instanceof PipelineCancelledError) {
      // Cancelled or ended from outside while continuing: the row says so.
      return prior;
    }
    console.error("[orchestrator] draft continuation failed; the truncated draft stands", err);
    await sink?.done(true);
    return prior;
  } finally {
    // This step is the stream's last writer whatever happened.
    await sink?.close();
  }
}

/** Stage 2b — agent 6, the bilingual contract. Independent of the proposal. */
export async function runLawStage(
  input: PipelineInput,
  ctx: PreparedContext,
  attempt: StageAttempt,
  /** The run's live contract stream, when the step opened one. */
  sink?: DraftStreamSink,
): Promise<LawOutcome> {
  const locale: Locale = input.locale === "en" ? "en" : "ar";
  const states = ctx.states.map((s) => ({ ...s }));
  const logger = createDecisionLogger(ctx.decisions);
  const metrics = createMetricsTracker(input.runId, input.projectId, ctx.metrics);
  const recorder = createRunRecorder({ runId: input.runId, states, owned: new Set<AgentId>(["LAW_CONTRACT"]) });
  const { mark } = recorder;
  const { project, entities, rows, score, workspaceIdentity, restrictions } = ctx;
  sink?.reset(attempt.attempt);
  let streamedText = "";
  let contractStreamed = false;

  try {
    await carryRetryFindings(recorder, "LAW_CONTRACT", attempt);
    return await withHeartbeat(recorder, async (): Promise<LawOutcome> => {
    metrics.startAgent("LAW_CONTRACT");
    logger.startTimer("law_contract");
    await mark("LAW_CONTRACT", {
      status: "running",
      progress: 15,
      startedAt: new Date().toISOString(),
      findings: ["Researching Saudi regulatory registry and tender anchors…"],
    });

    const lawDraft = await draftLawContract({
      projectTitle: project.title,
      etimadRef: project.etimadRef,
      entities,
      complianceRows: rows as ComplianceMatrixRow[],
      brandName: workspaceIdentity?.name,
      brandNameAr: workspaceIdentity?.nameAr,
      clientName: "Client (procuring entity — complete from tender)",
      clientNameAr: "العميل (الجهة الطارحة — يُستكمل من الكراسة)",
      restrictions,
      locale,
      onDelta: sink
        ? (text) => {
            streamedText += text;
            sink.push(text);
          }
        : undefined,
    });
    if (sink) {
      // The saved contract can differ from what was streamed: the deterministic
      // draft stands in when the model's version parses to too few articles.
      // The page is then shown the document that was actually kept.
      if (streamedText.trim() !== lawDraft.contentMd.trim()) {
        sink.reset(attempt.attempt);
        sink.push(lawDraft.contentMd);
      }
      await sink.done(false);
      contractStreamed = true;
    }

    await mark("LAW_CONTRACT", {
      status: "running",
      progress: 70,
      findings: [
        `Research findings: ${lawDraft.research.findings.length}`,
        `Sources: ${lawDraft.research.sources.length}`,
        "Drafting bilingual EN|AR operative articles…",
      ],
    });

    const contractValidation = validateContractDraft(lawDraft.contentMd);
    const contractStatus = contractValidation.blocking ? "DRAFT" : "GENERATED";
    const contractArtifacts = [
      {
        type: "CONTRACT",
        format: "bilingual_legal_v1",
        research: lawDraft.research,
        articles: lawDraft.articles,
        entities,
        provider: lawDraft.provider,
        model: lawDraft.model,
        fallback: lawDraft.fallback,
      },
      {
        type: "HTML",
        filename: "Draft_Contract_Bilingual.html",
        downloadPath: `/api/proposals/PLACEHOLDER/download?format=html`,
      },
      {
        type: "PDF",
        filename: "Draft_Contract_Bilingual.pdf",
        downloadPath: `/api/proposals/PLACEHOLDER/download?format=pdf`,
      },
    ];

    const contract = await db.generatedProposal.create({
      data: {
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        createdById: input.userId,
        title: `Draft Contract — ${project.title}`,
        titleAr: `مسودة عقد — ${project.titleAr ?? project.title}`,
        type: "CONTRACT",
        status: contractStatus,
        version: 1,
        locale: "ar",
        contentMd: lawDraft.contentMd,
        artifactsJson: JSON.stringify(contractArtifacts),
        complianceScore: score,
        generatedAt: new Date(),
      },
    });

    await db.proposalVersion.create({
      data: {
        proposalId: contract.id,
        version: 1,
        contentMd: lawDraft.contentMd,
        changeLog: "Law agent: Saudi registry research + bilingual draft",
        locale: "ar",
        createdBy: input.userId,
      },
    });

    const realContractArtifacts = contractArtifacts.map((a) =>
      "downloadPath" in a && typeof a.downloadPath === "string"
        ? {
            ...a,
            downloadPath: a.downloadPath.replace("PLACEHOLDER", contract.id),
          }
        : a
    );
    await db.generatedProposal.update({
      where: { id: contract.id },
      data: { artifactsJson: JSON.stringify(realContractArtifacts) },
    });

    const lawDuration = logger.endTimer("law_contract");
    decision(logger, {
      agentId: "LAW_CONTRACT",
      ruleId: "contract-validation-blocking",
      sourceCategory: "DETERMINISTIC_CALC",
      level: contractValidation.blocking ? "BLOCKING" : "INFO",
      message: `Contract ${contract.id} ${lawDraft.articles.length} articles ${contractValidation.blocking ? "BLOCKED" : "READY"} in ${lawDuration}ms`,
      inputs: truncateForLog({ articles: lawDraft.articles.length, sources: lawDraft.research.sources.length }) as Record<string, unknown>,
      output: `${lawDraft.articles.length} articles`,
      blocking: contractValidation.blocking,
      runId: input.runId,
    });
    if (contractValidation.blocking) metrics.blockExport();

    await mark("LAW_CONTRACT", {
      status: "completed",
      progress: 100,
      completedAt: new Date().toISOString(),
      output: {
        ar: `تمت صياغة العقد بـ${lawDraft.articles.length} مادة. ${engineNote(lawDraft.fallback, "ar")}`,
        en: `Contract drafted with ${lawDraft.articles.length} article(s). ${engineNote(lawDraft.fallback, "en")}`,
      },
      findings: [
        `Research sources: ${lawDraft.research.sources.length}`,
        `Findings: ${lawDraft.research.findings.length}`,
        `Articles: ${lawDraft.articles.length}`,
        `Tokens: ${lawDraft.tokensUsed}`,
        contractValidation.blocking
          ? `Contract validation issues: ${contractValidation.issues.map((i) => i.code).join(", ")}`
          : "Contract draft ready for authorized legal review (not legal advice)",
        "No 100% legal certainty asserted — counsel verification mandatory",
        ...logger.getEntries().filter(e=>e.agentId==="LAW_CONTRACT").slice(-2).map(e=>`${e.ruleId}: ${e.message}`),
      ],
    });
    metrics.completeAgent("LAW_CONTRACT", {
      evidenceCount: lawDraft.research.sources.length + lawDraft.research.findings.length,
      enriched: !lawDraft.fallback,
      fallback: lawDraft.fallback,
      provider: lawDraft.provider,
      tokensUsed: lawDraft.tokensUsed,
    });

    return {
      ok: true,
      contractId: contract.id,
      contractValidation,
      researchedAt: lawDraft.research.researchedAt,
      articles: lawDraft.articles.length,
      provider: lawDraft.provider,
      metrics: metrics.snapshot(),
      decisions: logger.getEntries(),
    };
    });
  } catch (err) {
    return settleStageFailure(err, { input, recorder, agentId: "LAW_CONTRACT", attempt, runStartedAtIso: ctx.runStartedAtIso });
  } finally {
    if (sink) await (contractStreamed ? sink.close() : sink.release());
  }
}

/**
 * Stage 3 — merge the two tails into the run record and complete it.
 *
 * A tail that ended the run itself (`StageFailure`) has written the row: its
 * result is returned untouched. A tail whose function died before it could
 * write (`StageCrash`) is failed here with the reason the engine reported.
 */
export async function runFinalizeStage(
  input: PipelineInput,
  ctx: PreparedContext,
  drafting: DraftingOutcome | StageCrash,
  law: LawOutcome | StageCrash,
  attempt: StageAttempt,
): Promise<OrchestratorResult> {
  const row = await db.agentRun.findUnique({
    where: { id: input.runId },
    select: { status: true, agentStates: true, overallProgress: true, errorMessage: true, finalArtifact: true },
  });
  const states = parseAgentStates(row?.agentStates) ?? ctx.states.map((s) => ({ ...s }));
  const recorder = createRunRecorder({ runId: input.runId, states, owned: new Set<AgentId>() });

  for (const tail of [drafting, law]) {
    if (tail.ok) continue;
    if ("result" in tail) return tail.result;
  }
  const crashed = [drafting, law].filter((t): t is StageCrash => !t.ok && "crashed" in t);
  if (crashed.length > 0) {
    const message = crashed.map((c) => c.crashed).join("; ");
    return (
      await settleStageFailure(new Error(message), {
        input,
        recorder,
        attempt: { attempt: attempt.maxAttempts, maxAttempts: attempt.maxAttempts },
        runStartedAtIso: ctx.runStartedAtIso,
      })
    ).result;
  }
  if (!drafting.ok || !law.ok) throw new Error("unreachable: both tails succeeded");

  const metrics = createMetricsTracker(
    input.runId,
    input.projectId,
    mergeMetricsSnapshots(ctx.metrics, drafting.metrics, law.metrics),
  );
  const logger = createDecisionLogger([
    ...ctx.decisions,
    ...drafting.decisions.slice(ctx.decisions.length),
    ...law.decisions.slice(ctx.decisions.length),
  ]);
  const { persist } = recorder;
  const analyticsOrigin = originOf(input);
  const runStartedAtIso = ctx.runStartedAtIso;
  const score = ctx.score;

  try {
    // Augment final artifact with contract id
    let artifactObj: Record<string, unknown> = {};
    try {
      artifactObj = row?.finalArtifact ? JSON.parse(row.finalArtifact) : {};
    } catch {
      artifactObj = {};
    }
    const finalMetrics = metrics.build("COMPLETED", 100);
    const decisionLog = logger.toLog(input.runId, input.projectId, runStartedAtIso);
    await db.agentRun.update({
      where: { id: input.runId },
      data: {
        finalArtifact: JSON.stringify({
          ...artifactObj,
          contractId: law.contractId,
          contractValidation: law.contractValidation,
          contractResearchAt: law.researchedAt,
          metrics: finalMetrics,
          decisionLog: {
            entries: decisionLog.entries.slice(-100),
            total: decisionLog.entries.length,
            auditChecklist: (await import("./agent-registry")).AUDIT_CHECKLIST,
          },
        }),
      },
    });

    await audit({
      userId: input.userId,
      action: AUDIT_ACTIONS.PROPOSAL_GENERATE,
      resource: "GeneratedProposal",
      resourceId: law.contractId,
      severity: "INFO",
      details: {
        projectId: input.projectId,
        type: "CONTRACT",
        provider: law.provider,
        articles: law.articles,
      },
    });

    await audit({
      userId: input.userId,
      action: AUDIT_ACTIONS.PROPOSAL_GENERATE,
      resource: "GeneratedProposal",
      resourceId: drafting.proposalId,
      severity: "INFO",
      details: { projectId: input.projectId, score, provider: drafting.provider },
    });

    const overall = await persist("COMPLETED");
    await recordAgentRunAnalyticsEvent({
      eventType: "agent_run_completed",
      runId: input.runId,
      origin: analyticsOrigin,
      startedAt: runStartedAtIso,
      metadata: {
        projectId: input.projectId,
        proposalId: drafting.proposalId,
        progressPercent: toProgressPercent(overall),
      },
    });

    return {
      agentStates: states,
      overallProgress: overall,
      status: "COMPLETED",
      proposalId: drafting.proposalId,
    };
  } catch (err) {
    return (await settleStageFailure(err, { input, recorder, attempt, runStartedAtIso })).result;
  }
}

/** A step died before its stage could write anything: fail the run with the engine's reason. */
export async function failRunAfterCrash(input: PipelineInput, message: string): Promise<OrchestratorResult> {
  const row = await db.agentRun.findUnique({
    where: { id: input.runId },
    select: { status: true, agentStates: true, overallProgress: true, errorMessage: true },
  });
  const states = parseAgentStates(row?.agentStates) ?? initStates(input.locale === "en" ? "en" : "ar");
  const recorder = createRunRecorder({ runId: input.runId, states, owned: new Set<AgentId>() });
  const settled = await settleStageFailure(new Error(message), {
    input,
    recorder,
    attempt: { attempt: 1, maxAttempts: 1 },
    runStartedAtIso: new Date().toISOString(),
  });
  return settled.result;
}
