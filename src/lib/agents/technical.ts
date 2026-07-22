import { EXECUTION_METHODOLOGY, VISION_2030_PILLARS } from "../constants";
import { retrieveRelevant, formatRagContext, type RagDocument } from "../rag";
import type { IngestionEntities, TechnicalArchitectOutput } from "../types";

/**
 * Technical & Solution Architecture Agent — senior tender architect.
 * Builds evaluation-aligned delivery narrative from approved evidence only.
 */
export function runTechnicalArchitect(opts: {
  entities: IngestionEntities | null;
  pastProjects: RagDocument[];
  tenderCorpus?: RagDocument[];
  vision2030Alignment?: string | null;
  queryEmbedding?: number[] | null;
}): TechnicalArchitectOutput & {
  findings: string[];
  ragContext: string;
  tenderContext: string;
} {
  const query = [
    opts.entities?.scope ?? "",
    ...(opts.entities?.milestones.map((m) => m.name) ?? []),
  ].join(" ");

  const defaultQuery =
    query.trim() || "government digital transformation Saudi Arabia Etimad";

  const pastHits = retrieveRelevant(defaultQuery, opts.pastProjects, {
    topK: 5,
    queryEmbedding: opts.queryEmbedding,
  });

  const tenderHits = retrieveRelevant(defaultQuery, opts.tenderCorpus ?? [], {
    topK: 8,
    queryEmbedding: opts.queryEmbedding,
  });

  const methodology = EXECUTION_METHODOLOGY.map((phase) => ({
    id: phase.id,
    name: phase.name,
    nameAr: phase.nameAr,
    rationale: `Phase ${phase.id} maps PMI ${phase.pmi} with Agile ${phase.agile} to tender outcomes: ${(opts.entities?.scope ?? "uploaded SOW").slice(0, 160)}. Entry criteria, exit criteria, and deliverables are defined per phase for evaluator traceability.`,
  }));

  const matchedProjects = pastHits.map((h) => ({
    id: h.id,
    title: h.title,
    score: h.score,
    why: `Relevance ${h.score.toFixed(3)} — ${h.summary.slice(0, 160)}`,
    experienceClass: (h.score >= 0.45
      ? "exact"
      : h.score >= 0.22
        ? "analogous"
        : "proposed") as "exact" | "analogous" | "proposed",
  }));

  const pillar =
    VISION_2030_PILLARS.find((p) => p.id === opts.vision2030Alignment) ??
    VISION_2030_PILLARS[1];

  const tenderSnippets = tenderHits
    .slice(0, 4)
    .map((h) => h.summary.slice(0, 180))
    .join(" | ");

  const techW = opts.entities?.evaluation.technical ?? 70;
  const finW = opts.entities?.evaluation.financial ?? 30;

  const solutionApproach = [
    "Solution architecture is tender-specific and organized by requirement coverage, not generic marketing language.",
    opts.entities?.scope
      ? `Project understanding: ${opts.entities.scope.slice(0, 500)}`
      : "Project understanding is derived strictly from the uploaded RFP / conditions booklet.",
    tenderSnippets
      ? `Tender-grounded constraints: ${tenderSnippets}`
      : "Tender corpus RAG pending richer chunks — architecture uses parsed entities.",
    matchedProjects.length
      ? `Evidence-backed experience: ${matchedProjects
          .map((p) => `${p.title} [${p.experienceClass}]`)
          .join("; ")}.`
      : "No sufficiently similar approved past projects ranked — solution remains standards-based and proposed approach only.",
    "Architecture principles applied only when supported by tender text or approved tenant policies: least privilege, secure SDLC, measurable acceptance criteria, and KSA-aligned hosting posture where configured.",
  ].join("\n\n");

  const deliveryModel = [
    "Hybrid delivery model combining Agile iterations for build/change streams with PMI stage-gates for contractual milestones.",
    opts.entities?.milestones?.length
      ? `Contractual milestones reflected: ${opts.entities.milestones
          .map((m) => `${m.name} (${m.weeks}w)`)
          .join(", ")}.`
      : "Milestones will follow the schedule extracted from the tender package once confirmed.",
    "RACI-defined workstreams: Program Management, Solution Architecture, Engineering, QA, Security, Change Management, and Transition.",
  ].join(" ");

  const governance = [
    "Governance board (monthly), project steering (bi-weekly), and delivery stand-ups (daily) with formal decision logs.",
    "Escalation path: Delivery Lead → Program Manager → Sponsor / Client Authority.",
    "All contractual commitments require authorized human approval before submission; ArabClue drafts are assistive only.",
  ].join(" ");

  const qualityPlan = [
    "Quality management integrates preventive reviews, peer design reviews, automated tests where applicable, and UAT acceptance mapped to tender deliverables.",
    "Defect triage with severity classes and release readiness checklist prior to each contractual milestone.",
    "Traceability: requirement ID → design artifact → test case → evidence of acceptance.",
  ].join(" ");

  const riskPlan = [
    "Risk register maintained with probability/impact scoring, owners, and mitigation actions.",
    "Typical tender risks addressed: schedule compression, dependency on client data, integration interfaces, security clearance, and resource continuity.",
    "Issues and risks reported in governance packs; no risk is closed without residual-risk acceptance by authority.",
  ].join(" ");

  const securityPrivacy = [
    "Security response addresses controls evidenced in the compliance matrix (NCA/PDPL as applicable) without inventing certifications.",
    "Secure-by-design practices: threat modeling for in-scope components, secrets management, least privilege, and audit logging.",
    "Personal data handling follows PDPL evaluation notes and tenant policy — not blanket legal assumptions. Legal review required where transfer/residency language is ambiguous.",
  ].join(" ");

  const serviceManagement = [
    opts.entities?.sla
      ? `SLA response uses tender-stated penalty terms (${opts.entities.sla.perWeek}%/week, max ${opts.entities.sla.maxPercent}%) without rewriting statutory candidates into tender facts.`
      : "SLA response will mirror tender clauses exactly once extracted.",
    "Service management includes incident, problem, change, and request fulfillment processes with measurable KPIs where the tender defines them.",
    "Reporting cadence and service review meetings align to governance calendar.",
  ].join(" ");

  const trainingTransition = [
    "Training plan covers administrator and end-user enablement with materials in Arabic and English as required by the tender.",
    "Knowledge transfer includes runbooks, operational handover checklist, and shadow-support period.",
    "Transition acceptance criteria are explicit and measurable.",
  ].join(" ");

  const continuity = [
    "Business continuity and disaster recovery commitments are limited to approved tenant BCP/DR assets and tender requirements.",
    "Backup, RPO/RTO, and failover statements appear only when evidenced in approved methodologies or tender text.",
    "Missing continuity evidence is listed as a gap for human completion — never fabricated.",
  ].join(" ");

  const evaluationAlignment = [
    `Technical evaluation weight: ${techW}%. Narrative density prioritizes mandatory technical requirements, architecture, methodology, team, security, and compliance.`,
    `Financial evaluation weight: ${finW}%. This proposal provides qualification structure and unpriced BoQ forms only — commercial pricing is entered by the client's authorized commercial team.`,
    "Each major section is written to be scorable against evaluation criteria; requirement coverage matrix links responses to tender clauses.",
  ].join(" ");

  const vision2030Notes = opts.vision2030Alignment
    ? `Alignment with Vision 2030 pillar "${pillar.name}" / "${pillar.nameAr}" is supportable via brand configuration and retrieved evidence only. No unsupported national-impact claims.`
    : `Vision 2030 references are included only when brand alignment or tender text supports them (pillar candidate: ${pillar.name}).`;

  const findings = [
    `Retrieved ${pastHits.length} approved past project(s) via tenant RAG`,
    `Retrieved ${tenderHits.length} tender chunk(s)`,
    ...matchedProjects
      .slice(0, 3)
      .map(
        (p) =>
          `Match: ${p.title} (${p.experienceClass}, score ${p.score.toFixed(3)})`
      ),
    evaluationAlignment,
    vision2030Notes,
  ];

  const tenderContext = formatRagContext(tenderHits).replace(
    "No matching past projects found in Brand Setup corpus.",
    "No matching tender chunks found in uploaded documents."
  );

  return {
    methodology,
    matchedProjects,
    solutionApproach,
    vision2030Notes,
    deliveryModel,
    governance,
    qualityPlan,
    riskPlan,
    securityPrivacy,
    serviceManagement,
    trainingTransition,
    continuity,
    evaluationAlignment,
    findings,
    ragContext: formatRagContext(pastHits),
    tenderContext,
  };
}
