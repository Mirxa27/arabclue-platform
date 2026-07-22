import { db } from "../db";
import { AGENTS, getTenderType } from "../constants";
import { tr } from "../i18n";
import type { AgentState, AgentId, IngestionEntities, ComplianceMatrixRow, FinancialExtract } from "../types";
import { extractTextFromStorage, parseTenderText, buildIngestionSummary, sanitizeText } from "./ingestion";
import { evaluateCompliance } from "./compliance";
import { runTechnicalArchitect } from "./technical";
import { runFinancialAgent } from "./financial";
import { draftProposal } from "./drafting";
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
import type { Locale } from "../types";

export interface OrchestratorResult {
  agentStates: AgentState[];
  overallProgress: number;
  status: "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
  errorMessage?: string;
  proposalId?: string;
}

class PipelineCancelledError extends Error {
  constructor() {
    super("Agent pipeline cancelled");
    this.name = "PipelineCancelledError";
  }
}

function agentLabel(id: AgentId, locale: "ar" | "en" = "en") {
  return {
    name: tr(`agent_${id}_name` as Parameters<typeof tr>[0], locale),
    nameAr: tr(`agent_${id}_name` as Parameters<typeof tr>[0], "ar"),
  };
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
 * Execute the full multi-agent pipeline for a project.
 * Progress advances only after each real agent completes.
 */
export async function runAgentPipeline(opts: {
  runId: string;
  projectId: string;
  workspaceId: string;
  userId: string;
  locale?: Locale;
}): Promise<OrchestratorResult> {
  const locale: Locale = opts.locale === "en" ? "en" : "ar";
  const states = initStates(locale);

  const assertNotCancelled = async () => {
    const row = await db.agentRun.findUnique({
      where: { id: opts.runId },
      select: { status: true },
    });
    if (row?.status === "CANCELLED") {
      throw new PipelineCancelledError();
    }
  };

  const persist = async (status: "RUNNING" | "COMPLETED" | "FAILED", errorMessage?: string) => {
    await assertNotCancelled();
    const overall =
      states.reduce((s, a) => s + a.progress, 0) / Math.max(states.length, 1);
    await db.agentRun.update({
      where: { id: opts.runId },
      data: {
        status,
        overallProgress: overall,
        agentStates: JSON.stringify(states),
        errorMessage: errorMessage ?? null,
        ...(status === "COMPLETED" || status === "FAILED"
          ? { completedAt: new Date() }
          : {}),
        ...(status === "RUNNING" ? { startedAt: new Date() } : {}),
      },
    });
    return overall;
  };

  const mark = async (
    id: AgentId,
    patch: Partial<AgentState>
  ) => {
    await assertNotCancelled();
    const idx = states.findIndex((s) => s.id === id);
    if (idx >= 0) states[idx] = { ...states[idx], ...patch };
    await persist("RUNNING");
  };

  try {
    await persist("RUNNING");

    const project = await db.tenderProject.findUnique({ where: { id: opts.projectId } });
    if (!project) {
      throw new Error("Project not found");
    }

    const docs = await db.uploadedDocument.findMany({
      where: { projectId: opts.projectId },
      orderBy: { createdAt: "asc" },
    });

    // ─── Agent 1: INGESTION ───────────────────────────────────────────────
    await mark("INGESTION", { status: "running", progress: 10, startedAt: new Date().toISOString() });

    const texts: string[] = [];
    for (const d of docs) {
      const t = await extractTextFromStorage(d.storagePath, d.mimeType, d.originalName);
      if (t) texts.push(`--- ${d.originalName} (${d.docCategory}) ---\n${t}`);
    }
    const combined = texts.join("\n\n");
    if (!combined && docs.length === 0) {
      await mark("INGESTION", {
        status: "failed",
        progress: 100,
        completedAt: new Date().toISOString(),
        output: "No documents uploaded",
        findings: ["Upload at least one RFP / conditions booklet before running agents"],
      });
      const overall = await persist("FAILED", "No documents uploaded for ingestion");
      return { agentStates: states, overallProgress: overall, status: "FAILED", errorMessage: "No documents uploaded" };
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
          parsedSummary: summary,
          extractedEntities: JSON.stringify(entities),
        },
      });
    }

    await mark("INGESTION", {
      status: "completed",
      progress: 100,
      completedAt: new Date().toISOString(),
      output: summary,
      findings: entities.evidence,
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
    await mark("COMPLIANCE_REGULATORY", {
      status: "running",
      progress: 15,
      startedAt: new Date().toISOString(),
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
        where: { projectId: opts.projectId, controlId: row.controlId },
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
            projectId: opts.projectId,
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

    await mark("COMPLIANCE_REGULATORY", {
      status: "completed",
      progress: 100,
      completedAt: new Date().toISOString(),
      output: `Compliance score ${score}% — ${rows.length} controls evaluated`,
      findings: cFindings,
    });

    // ─── Agent 3: TECHNICAL_ARCHITECT ─────────────────────────────────────
    await mark("TECHNICAL_ARCHITECT", {
      status: "running",
      progress: 20,
      startedAt: new Date().toISOString(),
    });

    const brand = await db.brandProfile.findFirst({
      where: { workspaceId: opts.workspaceId },
    });
    const past = await db.pastProject.findMany({
      where: { workspaceId: opts.workspaceId },
    });
    const [libraryItems, staffMembers, methodologies, restrictions] = await Promise.all([
      db.contentLibraryItem.findMany({
        where: { workspaceId: opts.workspaceId, approved: true, restricted: false },
      }),
      db.staffMember.findMany({
        where: { workspaceId: opts.workspaceId, active: true },
      }),
      db.methodologyAsset.findMany({
        where: { workspaceId: opts.workspaceId, approved: true },
      }),
      db.restriction.findMany({
        where: { workspaceId: opts.workspaceId, active: true },
      }),
    ]);
    const ragDocs: RagDocument[] = [];
    for (const p of past) {
      let embedding: number[] | null = p.embeddingJson
        ? (JSON.parse(p.embeddingJson) as number[])
        : null;
      if (!embedding?.length) {
        embedding = await embedText(`${p.title}\n${p.summary}\n${p.sector ?? ""}\n${p.tags ?? ""}`);
        await db.pastProject.update({
          where: { id: p.id },
          data: { embeddingJson: JSON.stringify(embedding) },
        });
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
    for (const s of staffMembers) {
      ragDocs.push({
        id: s.id,
        title: `[Staff] ${s.name} — ${s.roleTitle}`,
        summary: [s.cvSummary, s.certifications, s.requirementTags]
          .filter(Boolean)
          .join("\n")
          .slice(0, 1500),
        tags: s.requirementTags,
        embedding: s.embeddingJson ? (JSON.parse(s.embeddingJson) as number[]) : null,
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
    const restrictionsText = restrictions
      .map((r) => `${r.restrictionType}: ${r.text}`)
      .join("\n");

    const queryEmbedding = await embedText(
      sanitizeText(
        `${project.title}\n${entities.scope}\n${entities.milestones.map((m) => m.name).join(" ")}`
      )
    );

    const tenderCorpus = await loadProjectTenderCorpus(opts.projectId);

    let technical = runTechnicalArchitect({
      entities,
      pastProjects: ragDocs,
      tenderCorpus,
      vision2030Alignment: brand?.vision2030Alignment,
      queryEmbedding,
    });

    const technicalAi = await enrichTechnicalWithAi({
      solutionApproach: technical.solutionApproach,
      vision2030Notes: technical.vision2030Notes,
      methodology: technical.methodology,
      matchedProjects: technical.matchedProjects,
      ragContext: technical.ragContext,
      tenderContext: technical.tenderContext,
      scope: entities.scope,
    });
    if (technicalAi.data) {
      const d = technicalAi.data as {
        solutionApproach?: string;
        vision2030Notes?: string;
        findings?: string[];
      };
      technical = {
        ...technical,
        solutionApproach:
          typeof d.solutionApproach === "string" && d.solutionApproach.length > 40
            ? d.solutionApproach
            : technical.solutionApproach,
        vision2030Notes:
          typeof d.vision2030Notes === "string" && d.vision2030Notes.length > 20
            ? d.vision2030Notes
            : technical.vision2030Notes,
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

    // ─── Agent 4: FINANCIAL_QUALIFICATION ─────────────────────────────────
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

    await mark("FINANCIAL_QUALIFICATION", {
      status: "completed",
      progress: 100,
      completedAt: new Date().toISOString(),
      output: `QLR=${financial.quickLiquidityRatio ?? "N/A"}; BoQ lines=${financial.boqItems.length}`,
      findings: financial.findings,
    });

    // ─── Agent 5: PROPOSAL_DRAFTING ───────────────────────────────────────
    await mark("PROPOSAL_DRAFTING", {
      status: "running",
      progress: 25,
      startedAt: new Date().toISOString(),
    });

    const tenderType = getTenderType(project.category);
    const draft = await draftProposal({
      projectTitle: project.title,
      etimadRef: project.etimadRef,
      tenderTypeName: `${tenderType.name} / ${tenderType.nameAr}`,
      entities,
      complianceRows: rows as ComplianceMatrixRow[],
      technical,
      financial: financial as FinancialExtract,
      brandTagline:
        locale === "ar"
          ? brand?.taglineAr || brand?.tagline || "أراب كلاو"
          : brand?.tagline || "Arabclue",
      vision2030: brand?.vision2030Alignment ?? "thriving-economy",
      locale,
      restrictions: restrictionsText,
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

    const proposal = await db.generatedProposal.create({
      data: {
        workspaceId: opts.workspaceId,
        projectId: opts.projectId,
        createdById: opts.userId,
        title: `Technical & Financial Proposal — ${project.title}`,
        titleAr: `العطاء الفني والمالي — ${project.titleAr ?? project.title}`,
        type: "COMBINED",
        status: "GENERATED",
        version: 1,
        locale,
        contentMd: draft.contentMd,
        artifactsJson: JSON.stringify(artifacts),
        financialFormsJson: JSON.stringify({
          boqItems: financial.boqItems,
          currency: project.currency,
          updatedAt: new Date().toISOString(),
          source: "agent_structure_only",
        }),
        complianceScore: score,
        generatedAt: new Date(),
      },
    });

    await db.proposalVersion.create({
      data: {
        proposalId: proposal.id,
        version: 1,
        contentMd: draft.contentMd,
        changeLog: "Initial AI generation",
        locale,
        createdBy: opts.userId,
      },
    });

    const realArtifacts = artifacts.map((a) => ({
      ...a,
      downloadPath: a.downloadPath.replace("PLACEHOLDER", proposal.id),
    }));
    await db.generatedProposal.update({
      where: { id: proposal.id },
      data: {
        artifactsJson: JSON.stringify(realArtifacts),
        // Store financial/compliance JSON for generators
        // contentMd already set; attach meta in finalArtifact on run
      },
    });

    // Store BoQ on agent run finalArtifact for download generators
    await db.agentRun.update({
      where: { id: opts.runId },
      data: {
        finalArtifact: JSON.stringify({
          proposalId: proposal.id,
          boqItems: financial.boqItems,
          financial,
          complianceScore: score,
          provider: draft.provider,
          model: draft.model,
          tokensUsed: draft.tokensUsed,
          fallback: draft.fallback,
          slidesMetrics: {
            quickLiquidityRatio: financial.quickLiquidityRatio,
            qlrPasses: financial.qlrPasses,
            saudizationPercent: financial.saudizationPercent,
            saudizationTarget: project.saudizationTarget,
            complianceScore: score,
          },
        }),
      },
    });

    await db.tenderProject.update({
      where: { id: opts.projectId },
      data: { status: "REVIEW" },
    });

    // Usage tracking
    const sub = await db.subscription.findUnique({ where: { userId: opts.userId } });
    if (sub) {
      await db.subscription.update({
        where: { id: sub.id },
        data: {
          proposalsUsed: { increment: 1 },
          tokensUsed: { increment: draft.tokensUsed },
        },
      });
    }

    await mark("PROPOSAL_DRAFTING", {
      status: "completed",
      progress: 100,
      completedAt: new Date().toISOString(),
      output: `Proposal ${proposal.id} generated via ${draft.provider}${draft.fallback ? " (fallback)" : ""}`,
      findings: [
        `Tokens: ${draft.tokensUsed}`,
        `Compliance score: ${score}%`,
        `Artifacts: ${realArtifacts.length}`,
      ],
    });

    await audit({
      userId: opts.userId,
      action: AUDIT_ACTIONS.PROPOSAL_GENERATE,
      resource: "GeneratedProposal",
      resourceId: proposal.id,
      severity: "INFO",
      details: { projectId: opts.projectId, score, provider: draft.provider },
    });

    const overall = await persist("COMPLETED");
    return {
      agentStates: states,
      overallProgress: overall,
      status: "COMPLETED",
      proposalId: proposal.id,
    };
  } catch (err) {
    if (err instanceof PipelineCancelledError) {
      const overall =
        states.reduce((s, a) => s + a.progress, 0) / Math.max(states.length, 1);
      await db.agentRun.update({
        where: { id: opts.runId },
        data: {
          status: "CANCELLED",
          overallProgress: overall,
          agentStates: JSON.stringify(states),
          errorMessage: "Cancelled by user",
          completedAt: new Date(),
        },
      });
      return {
        agentStates: states,
        overallProgress: overall,
        status: "CANCELLED",
        errorMessage: "Cancelled by user",
      };
    }
    const message = err instanceof Error ? err.message : "Agent pipeline failed";
    console.error("[orchestrator]", err);
    try {
      const overall = await persist("FAILED", message);
      return {
        agentStates: states,
        overallProgress: overall,
        status: "FAILED",
        errorMessage: message,
      };
    } catch (inner) {
      if (inner instanceof PipelineCancelledError) {
        return {
          agentStates: states,
          overallProgress: states.reduce((s, a) => s + a.progress, 0) / Math.max(states.length, 1),
          status: "CANCELLED",
          errorMessage: "Cancelled by user",
        };
      }
      throw inner;
    }
  }
}

/** Advance one step if run is QUEUED/RUNNING — used by status polling to execute pipeline once */
export async function ensurePipelineStarted(runId: string): Promise<OrchestratorResult | null> {
  const run = await db.agentRun.findUnique({ where: { id: runId } });
  if (!run) return null;
  if (run.status === "COMPLETED" || run.status === "FAILED") {
    return {
      agentStates: run.agentStates ? JSON.parse(run.agentStates) : [],
      overallProgress: run.overallProgress,
      status: run.status as "COMPLETED" | "FAILED",
      errorMessage: run.errorMessage ?? undefined,
    };
  }

  // If still QUEUED, kick off pipeline (async-safe: mark RUNNING first)
  if (run.status === "QUEUED") {
    await db.agentRun.update({
      where: { id: runId },
      data: { status: "RUNNING", startedAt: new Date() },
    });
    const project = await db.tenderProject.findUnique({ where: { id: run.projectId } });
    if (!project) return null;
    return runAgentPipeline({
      runId,
      projectId: run.projectId,
      workspaceId: project.workspaceId,
      userId: run.triggeredById,
    });
  }

  // Already RUNNING — return current states (pipeline may be in-process)
  return {
    agentStates: run.agentStates ? JSON.parse(run.agentStates) : initStates(),
    overallProgress: run.overallProgress,
    status: "RUNNING",
  };
}
