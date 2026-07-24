import { db } from "../db";
import { AGENTS, getTenderType } from "../constants";
import { tr } from "../i18n";
import type { AgentState, AgentId, IngestionEntities, ComplianceMatrixRow, FinancialExtract } from "../types";
import { extractTextFromStorage, parseTenderText, buildIngestionSummary, sanitizeText } from "./ingestion";
import { evaluateCompliance } from "./compliance";
import { runTechnicalArchitect } from "./technical";
import { runFinancialAgent } from "./financial";
import { draftProposal } from "./drafting";
import { draftLawContract, validateContractDraft } from "./law-contract";
import {
  buildCoveragePlan,
} from "./coverage";
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
import type { Locale } from "../types";
import { parseAgentRunConfig } from "../proposal-studio";

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
  regenerateMode?: "version" | "fork";
  targetProposalId?: string | null;
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
    const overall = Math.round(
      states.reduce((s, a) => s + a.progress, 0) / Math.max(states.length, 1)
    );
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
    const workspaceIdentity = await db.workspace.findUnique({
      where: { id: opts.workspaceId },
      select: { name: true, nameAr: true },
    });
    const past = await db.pastProject.findMany({
      where: {
        workspaceId: opts.workspaceId,
        approved: true,
        revokedAt: null,
      },
    });
    const [libraryItems, staffMembers, methodologies, restrictions, certificates] =
      await Promise.all([
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
      db.certificate.findMany({
        where: {
          workspaceId: opts.workspaceId,
          approved: true,
          revokedAt: null,
        },
      }),
    ]);
    const { filterValidCertificates } = await import("../knowledge-eligibility");
    const validCerts = filterValidCertificates(certificates);
    const ragDocs: RagDocument[] = [];
    for (const p of past) {
      if (!isQualityPastProjectTitle(p.title)) continue;
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
      `Active staff: ${staffMembers.length}`,
      `Approved methodologies: ${methodologies.length}`,
      `Valid certificates (non-expired): ${validCerts.length}/${certificates.length}`,
    ];
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

    await mark("FINANCIAL_QUALIFICATION", {
      status: "completed",
      progress: 100,
      completedAt: new Date().toISOString(),
      output: `QLR=${financial.quickLiquidityRatio ?? "N/A"}; BoQ lines=${financial.boqItems.length}`,
      findings: financial.findings,
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
      await applyCoveragePlanToRequirements(opts.projectId, coverage);
    } catch (err) {
      console.warn("[orchestrator] coverage sync failed", err);
    }

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
      coverage,
      brandTagline: resolveBidderDisplayName(
        locale,
        brand
          ? { tagline: brand.tagline, taglineAr: brand.taglineAr }
          : null,
        {
          name: workspaceIdentity?.name,
          nameAr: workspaceIdentity?.nameAr,
        }
      ),
      vision2030: brand?.vision2030Alignment ?? "thriving-economy",
      locale,
      restrictions: restrictionsText,
    });

    // Mandatory validation gate (blocks marking export-ready)
    const { validateProposalOutput } = await import("../validation-gate");
    const validationReport = validateProposalOutput({
      contentMd: draft.contentMd,
      financial: financial as FinancialExtract,
      entities,
      complianceRows: rows as ComplianceMatrixRow[],
      restrictions: restrictions.map((r) => r.text),
      approvedEvidenceIds: ragDocs.map((d) => d.id),
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

    const targetId = opts.targetProposalId ?? null;
    const mode = opts.regenerateMode;

    if (mode === "version" && targetId) {
      const existing = await db.generatedProposal.findFirst({
        where: {
          id: targetId,
          projectId: opts.projectId,
          workspaceId: opts.workspaceId,
        },
      });
      if (!existing) {
        throw new Error("Target proposal not found for version regenerate");
      }
      const nextVersion = existing.version + 1;
      proposal = await db.$transaction(async (tx) => {
        await tx.proposalReview.deleteMany({ where: { proposalId: existing.id } });
        await tx.proposalVersion.create({
          data: {
            proposalId: existing.id,
            version: nextVersion,
            contentMd: draft.contentMd,
            changeLog: "AI regenerate (new version)",
            locale,
            createdBy: opts.userId,
          },
        });
        return tx.generatedProposal.update({
          where: { id: existing.id },
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
          },
        });
      });
    } else {
      const parentProposalId =
        mode === "fork" && targetId ? targetId : null;
      if (parentProposalId) {
        const parent = await db.generatedProposal.findFirst({
          where: {
            id: parentProposalId,
            projectId: opts.projectId,
            workspaceId: opts.workspaceId,
          },
        });
        if (!parent) {
          throw new Error("Parent proposal not found for fork regenerate");
        }
      }
      proposal = await db.generatedProposal.create({
        data: {
          workspaceId: opts.workspaceId,
          projectId: opts.projectId,
          createdById: opts.userId,
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
          createdBy: opts.userId,
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
      where: { id: opts.runId },
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

    // ─── Agent 6: LAW_CONTRACT (research then bilingual draft) ────────────
    await mark("LAW_CONTRACT", {
      status: "running",
      progress: 15,
      startedAt: new Date().toISOString(),
      findings: ["Researching Saudi regulatory registry and tender anchors…"],
    });

    const workspace = await db.workspace.findUnique({
      where: { id: opts.workspaceId },
    });

    const lawDraft = await draftLawContract({
      projectTitle: project.title,
      etimadRef: project.etimadRef,
      entities,
      complianceRows: rows as ComplianceMatrixRow[],
      brandName: workspace?.name,
      brandNameAr: workspace?.nameAr,
      clientName: "Client (procuring entity — complete from tender)",
      clientNameAr: "العميل (الجهة الطارحة — يُستكمل من الكراسة)",
      restrictions: restrictions.map((r) => r.text),
      locale,
    });

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
        workspaceId: opts.workspaceId,
        projectId: opts.projectId,
        createdById: opts.userId,
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
        createdBy: opts.userId,
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

    await mark("LAW_CONTRACT", {
      status: "completed",
      progress: 100,
      completedAt: new Date().toISOString(),
      output: `Contract ${contract.id} (${lawDraft.articles.length} articles) via ${lawDraft.provider}${lawDraft.fallback ? " (registry fallback)" : ""}`,
      findings: [
        `Research sources: ${lawDraft.research.sources.length}`,
        `Findings: ${lawDraft.research.findings.length}`,
        `Articles: ${lawDraft.articles.length}`,
        `Tokens: ${lawDraft.tokensUsed}`,
        contractValidation.blocking
          ? `Contract validation issues: ${contractValidation.issues.map((i) => i.code).join(", ")}`
          : "Contract draft ready for authorized legal review (not legal advice)",
        "No 100% legal certainty asserted — counsel verification mandatory",
      ],
    });

    // Augment final artifact with contract id
    const priorArtifact = await db.agentRun.findUnique({
      where: { id: opts.runId },
      select: { finalArtifact: true },
    });
    let artifactObj: Record<string, unknown> = {};
    try {
      artifactObj = priorArtifact?.finalArtifact
        ? JSON.parse(priorArtifact.finalArtifact)
        : {};
    } catch {
      artifactObj = {};
    }
    await db.agentRun.update({
      where: { id: opts.runId },
      data: {
        finalArtifact: JSON.stringify({
          ...artifactObj,
          contractId: contract.id,
          contractValidation,
          contractResearchAt: lawDraft.research.researchedAt,
        }),
      },
    });

    await audit({
      userId: opts.userId,
      action: AUDIT_ACTIONS.PROPOSAL_GENERATE,
      resource: "GeneratedProposal",
      resourceId: contract.id,
      severity: "INFO",
      details: {
        projectId: opts.projectId,
        type: "CONTRACT",
        provider: lawDraft.provider,
        articles: lawDraft.articles.length,
      },
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
          overallProgress: Math.round(
            states.reduce((s, a) => s + a.progress, 0) / Math.max(states.length, 1)
          ),
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
    const cfg = parseAgentRunConfig(run.configJson);
    return runAgentPipeline({
      runId,
      projectId: run.projectId,
      workspaceId: project.workspaceId,
      userId: run.triggeredById,
      locale: cfg?.locale,
      regenerateMode: cfg?.regenerateMode,
      targetProposalId: cfg?.targetProposalId,
    });
  }

  // Already RUNNING — return current states (pipeline may be in-process)
  return {
    agentStates: run.agentStates ? JSON.parse(run.agentStates) : initStates(),
    overallProgress: run.overallProgress,
    status: "RUNNING",
  };
}
