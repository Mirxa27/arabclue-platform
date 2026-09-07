/**
 * Tender Clarification Intelligence — orchestration and persistence.
 *
 * Reads the project's tender chunks, runs the deterministic detectors, asks
 * the model to read the most relevant windows, keeps only findings whose
 * quotes are verbatim in the text it saw, merges, and upserts by fingerprint
 * so the team's triage survives a re-run. The pure rules live in
 * `src/lib/tender-interrogation/*`; this file is the only one that touches
 * the database or a provider.
 *
 * Honesty contract: deterministic findings are always returned and labelled
 * as such. When the model cannot answer (no provider, unresolved key, schema
 * rejection) the result says so in `ai.status` and nothing is invented to
 * fill the gap — strict real-AI-only deployments get the same list, not a
 * refusal, because a rule-based finding is not a fabricated one.
 */

import { db } from "../db";
import { generateCompletion, type LLMFailureKind } from "../llm";
import { bumpUsage } from "../quotas";
import { audit } from "../audit";
import type { Locale } from "../types";
import { detectDeterministicFindings } from "../tender-interrogation/detectors";
import { fingerprintFinding } from "../tender-interrogation/fingerprint";
import { buildGroundingIndex, groundQuote } from "../tender-interrogation/grounding";
import { mergeFindings } from "../tender-interrogation/merge";
import {
  buildInterrogationSystemPrompt,
  buildInterrogationUserPrompt,
  parseInterrogationAnswer,
  type ModelFinding,
} from "../tender-interrogation/prompt";
import { selectInterrogationWindows, type InterrogationWindow } from "../tender-interrogation/windows";
import type { ClaritySummary } from "../tender-interrogation/clarity";
import type { ClarificationQuote, Finding, SourcePassage } from "../tender-interrogation/types";
import {
  listClarifications,
  summarizeClarifications,
  upsertFindings,
  type ClarificationRecord,
} from "../tender-interrogation/repository";

export type {
  ClarificationPatch,
  ClarificationRecord,
} from "../tender-interrogation/repository";

/** Documents on the buyer's side of the table; the bidder's own files are not tender text. */
export const TENDER_SIDE_CATEGORIES = ["RFP", "TECHNICAL_SPECS", "IT_CONTRACT", "EA_COMPLIANCE", "OTHER"] as const;
/** Chunk cap per interrogation: 600 chunks ≈ 600k characters, well past any real tender. */
export const MAX_PASSAGES = 600;
/** Model calls in flight at once. */
const MODEL_POOL = 2;
/** Budget for one window: a JSON answer over ~9k characters of tender text. */
const WINDOW_TIMEOUT_MS = 90_000;

export type InterrogationAiStatus = "complete" | "partial" | "unavailable" | "skipped";

export type InterrogationAiReport = Readonly<{
  status: InterrogationAiStatus;
  windows: number;
  windowsAnswered: number;
  tokensUsed: number;
  provider: string | null;
  model: string | null;
  failureKind: LLMFailureKind | null;
  /** Grounding gate statistics: how many model quotes were verbatim, how many were not. */
  quotesGrounded: number;
  quotesRejected: number;
  findingsDropped: number;
}>;


export type InterrogationResult = Readonly<{
  items: readonly ClarificationRecord[];
  summary: ClaritySummary;
  passages: number;
  deterministicFindings: number;
  modelFindings: number;
  created: number;
  refreshed: number;
  ai: InterrogationAiReport;
}>;

/* -------------------------------------------------------------------------- */
/* Loading                                                                     */
/* -------------------------------------------------------------------------- */

export async function loadInterrogationPassages(opts: {
  projectId: string;
  workspaceId: string;
}): Promise<SourcePassage[]> {
  const chunks = await db.documentChunk.findMany({
    where: {
      projectId: opts.projectId,
      workspaceId: opts.workspaceId,
      document: { docCategory: { in: [...TENDER_SIDE_CATEGORIES] } },
    },
    select: {
      id: true,
      documentId: true,
      chunkIndex: true,
      content: true,
      pageRef: true,
      sectionHeading: true,
      language: true,
      document: { select: { originalName: true } },
    },
    orderBy: [{ documentId: "asc" }, { chunkIndex: "asc" }],
    take: MAX_PASSAGES,
  });
  return chunks.map((c) => ({
    id: c.id,
    documentId: c.documentId,
    documentName: c.document.originalName,
    chunkIndex: c.chunkIndex,
    text: c.content,
    pageRef: c.pageRef,
    sectionHeading: c.sectionHeading,
    language: c.language,
  }));
}

/* -------------------------------------------------------------------------- */
/* Model pass                                                                  */
/* -------------------------------------------------------------------------- */

type WindowOutcome =
  | { ok: true; findings: Finding[]; tokensUsed: number; provider: string; model: string; grounded: number; rejected: number; dropped: number }
  | { ok: false; failureKind: LLMFailureKind; provider: string | null; model: string | null; detail?: string };

/** Model findings whose quotes survive the grounding gate, as `Finding`s. */
export function admitModelFindings(
  raw: readonly ModelFinding[],
  window: InterrogationWindow,
  passageIds: ReadonlyMap<string, string>,
  meta: { provider: string; model: string; windowIndex: number }
): { findings: Finding[]; grounded: number; rejected: number; dropped: number } {
  const index = buildGroundingIndex(window.passages);
  const byId = new Map(window.passages.map((p) => [p.id, p]));
  const findings: Finding[] = [];
  let grounded = 0;
  let rejected = 0;
  let dropped = 0;
  for (const f of raw) {
    const quotes: ClarificationQuote[] = [];
    for (const q of f.quotes) {
      const preferred = q.passage ? passageIds.get(q.passage) ?? null : null;
      const result = groundQuote(q.text, index, preferred);
      if (!result.grounded) {
        rejected += 1;
        continue;
      }
      grounded += 1;
      const passage = result.passageId ? byId.get(result.passageId) : undefined;
      quotes.push({
        text: q.text.trim(),
        documentId: passage?.documentId ?? null,
        documentName: passage?.documentName ?? null,
        pageRef: passage?.pageRef ?? null,
        sectionHeading: passage?.sectionHeading ?? null,
      });
    }
    if (quotes.length === 0) {
      dropped += 1;
      continue;
    }
    findings.push({
      kind: f.kind,
      severity: f.severity,
      titleEn: f.titleEn.trim(),
      titleAr: f.titleAr.trim(),
      rationaleEn: f.rationaleEn.trim(),
      rationaleAr: f.rationaleAr.trim(),
      questionEn: f.questionEn.trim(),
      questionAr: f.questionAr.trim(),
      quotes,
      provenance: "AI_GENERATED",
      fingerprint: fingerprintFinding(f.kind, { quoteText: quotes[0].text }),
      provenanceDetail: { provider: meta.provider, model: meta.model, windowIndex: meta.windowIndex },
    });
  }
  return { findings, grounded, rejected, dropped };
}

async function runWindow(
  window: InterrogationWindow,
  ctx: { projectTitle: string; etimadRef: string | null; alreadyRaised: readonly string[]; locale: Locale }
): Promise<WindowOutcome> {
  const { prompt, passageIds } = buildInterrogationUserPrompt(window, ctx);
  const result = await generateCompletion(
    [
      { role: "system", content: buildInterrogationSystemPrompt(ctx.locale) },
      { role: "user", content: prompt },
    ],
    {
      engine: "INGESTION",
      maxTokens: 3_500,
      temperature: 0.2,
      timeoutMs: WINDOW_TIMEOUT_MS,
      maxAttempts: 2,
      promptOrigin: "system",
    }
  );
  if (result.fallback) {
    return {
      ok: false,
      failureKind: result.failureKind ?? "network",
      provider: result.provider === "none" ? null : result.provider,
      model: result.model === "none" ? null : result.model,
      detail: result.failureDetail,
    };
  }
  const parsed = parseInterrogationAnswer(result.content);
  if (!parsed.ok) {
    return {
      ok: false,
      failureKind: "guardrail_rejected",
      provider: result.provider,
      model: result.model,
      detail: `schema: ${parsed.issues.join("; ")}`.slice(0, 300),
    };
  }
  const admitted = admitModelFindings(parsed.data.findings, window, passageIds, {
    provider: result.provider,
    model: result.model,
    windowIndex: window.index,
  });
  return {
    ok: true,
    findings: admitted.findings,
    tokensUsed: result.tokensUsed,
    provider: result.provider,
    model: result.model,
    grounded: admitted.grounded,
    rejected: admitted.rejected,
    dropped: admitted.dropped,
  };
}

/** Run the windows through a small pool; each outcome is recorded, none aborts the others. */
async function runModelPass(
  windows: readonly InterrogationWindow[],
  ctx: { projectTitle: string; etimadRef: string | null; alreadyRaised: readonly string[]; locale: Locale }
): Promise<{ findings: Finding[]; report: InterrogationAiReport }> {
  const outcomes: WindowOutcome[] = new Array(windows.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < windows.length) {
      const i = cursor;
      cursor += 1;
      try {
        outcomes[i] = await runWindow(windows[i], ctx);
      } catch (error) {
        outcomes[i] = {
          ok: false,
          failureKind: "network",
          provider: null,
          model: null,
          detail: error instanceof Error ? error.message.slice(0, 200) : "unknown",
        };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(MODEL_POOL, windows.length) }, worker));

  const findings: Finding[] = [];
  let tokensUsed = 0;
  let answered = 0;
  let grounded = 0;
  let rejected = 0;
  let dropped = 0;
  let provider: string | null = null;
  let model: string | null = null;
  let failureKind: LLMFailureKind | null = null;
  for (const o of outcomes) {
    if (o.ok) {
      answered += 1;
      tokensUsed += o.tokensUsed;
      grounded += o.grounded;
      rejected += o.rejected;
      dropped += o.dropped;
      provider = provider ?? o.provider;
      model = model ?? o.model;
      findings.push(...o.findings);
    } else {
      failureKind = failureKind ?? o.failureKind;
      provider = provider ?? o.provider;
      model = model ?? o.model;
    }
  }
  const status: InterrogationAiStatus =
    windows.length === 0 ? "skipped" : answered === 0 ? "unavailable" : answered < windows.length ? "partial" : "complete";
  return {
    findings,
    report: {
      status,
      windows: windows.length,
      windowsAnswered: answered,
      tokensUsed,
      provider,
      model,
      failureKind: status === "complete" ? null : failureKind,
      quotesGrounded: grounded,
      quotesRejected: rejected,
      findingsDropped: dropped,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                 */
/* -------------------------------------------------------------------------- */

export class NoTenderTextError extends Error {
  constructor() {
    super("No parsed tender text for this project.");
    this.name = "NoTenderTextError";
  }
}

export async function interrogateTender(opts: {
  projectId: string;
  workspaceId: string;
  userId: string;
  locale: Locale;
  project: { title: string; etimadRef: string | null };
  /** `false` runs the rules only — used by tests and by the offline sanity script. */
  withModel?: boolean;
}): Promise<InterrogationResult> {
  const passages = await loadInterrogationPassages({ projectId: opts.projectId, workspaceId: opts.workspaceId });
  if (passages.length === 0) throw new NoTenderTextError();

  const deterministic = detectDeterministicFindings(passages);

  let modelFindings: Finding[] = [];
  let ai: InterrogationAiReport = {
    status: "skipped",
    windows: 0,
    windowsAnswered: 0,
    tokensUsed: 0,
    provider: null,
    model: null,
    failureKind: null,
    quotesGrounded: 0,
    quotesRejected: 0,
    findingsDropped: 0,
  };
  if (opts.withModel !== false) {
    const windows = selectInterrogationWindows(passages);
    const pass = await runModelPass(windows, {
      projectTitle: opts.project.title,
      etimadRef: opts.project.etimadRef,
      alreadyRaised: deterministic.map((f) => f.titleEn),
      locale: opts.locale,
    });
    modelFindings = pass.findings;
    ai = pass.report;
    if (ai.tokensUsed > 0) await bumpUsage(opts.userId, "tokens", ai.tokensUsed);
  }

  const merged = mergeFindings(deterministic, modelFindings);
  const { created, refreshed } = await upsertFindings({
    projectId: opts.projectId,
    workspaceId: opts.workspaceId,
    userId: opts.userId,
    findings: merged,
  });

  await audit({
    userId: opts.userId,
    action: "TENDER_INTERROGATE",
    resource: "TenderProject",
    resourceId: opts.projectId,
    details: {
      passages: passages.length,
      deterministic: deterministic.length,
      model: modelFindings.length,
      created,
      refreshed,
      ai,
    },
  });

  const items = await listClarifications(opts.projectId);
  return {
    items,
    summary: summarizeClarifications(items),
    passages: passages.length,
    deterministicFindings: deterministic.length,
    modelFindings: modelFindings.length,
    created,
    refreshed,
    ai,
  };
}

