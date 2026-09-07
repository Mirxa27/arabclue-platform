import { generateCompletion, type LLMMessage, type LLMResult } from "../llm";
import { guardOrThrow } from "../ai/provider-unavailable";
import {
  systemDrafting,
  draftingUserPrompt,
  systemDraftingSection,
  sectionDraftingUserPrompt,
  coverageFillUserPrompt,
  LIVE_RESEARCH_BLOCK_TITLE,
  HUMAN_APPROVAL_NOTICE,
  HUMAN_APPROVAL_NOTICE_AR,
  type SectionContextBlock,
} from "./prompts";
import { LEGAL_DISCLAIMER, LEGAL_DISCLAIMER_AR } from "../procurement-rules";
import { isPlaceholderCompanyName, isQualityScopeText } from "../text-quality";
import {
  CLARIFICATIONS_BLOCK_TITLE,
  REGISTER_MAX_CHARS,
  clarificationsRegisterMarkdown,
  formatClarificationsRegister,
  type RegisterItem,
} from "../tender-interrogation/register";
import type { CoveragePlan, CoverageRow } from "./coverage";
import type {
  IngestionEntities,
  FinancialExtract,
  TechnicalArchitectOutput,
  ComplianceMatrixRow,
  Locale,
} from "../types";

export const DRAFTING_MAX_TOKENS = 12_288;
/**
 * One more step's worth of draft when the first hit the cap. The continuation
 * prompt carries the whole draft so far as an assistant turn, so its budget is
 * smaller than the first pass's.
 */
export const DRAFT_CONTINUATION_MAX_TOKENS = 8_192;

/** Hard ceiling on the assembled drafting prompt, in characters. */
const MAX_PROMPT_CHARS = 90_000;

/* -------------------------------------------------------------------------- */
/* Sectioned drafting budgets                                                 */
/* -------------------------------------------------------------------------- */

/** Sections generated at once; a tiny pool, no library. */
export const SECTION_CONCURRENCY = 3;
/** One section's call; a 2 000-token section runs well under this at the drafting row's pace. */
export const SECTION_TIMEOUT_MS = 90_000;
/** Wall clock for the whole sectioned run; later sections take their deterministic slice past it. */
export const SECTION_DEADLINE_MS = 240_000;
/** The one continuation a truncated section gets. */
export const SECTION_CONTINUATION_MAX_TOKENS = 800;
/** The one call that adds matrix rows for requirement IDs the draft never mentioned. */
export const COVERAGE_FILL_MAX_TOKENS = 1_200;
const COVERAGE_FILL_TIMEOUT_MS = 60_000;
/** Section 4 receives every coverage row up to this many; the others up to `SECTION_ROWS_CAP`. */
const MATRIX_ROWS_CAP = 60;
const SECTION_ROWS_CAP = 40;
const ENTITIES_DIGEST_CHARS = 8_000;
const TENDER_CONTEXT_CHARS = MAX_PROMPT_CHARS / 3;
const LIVE_RESEARCH_CHARS = 8_000;
const RAG_CHARS_DEFAULT = 40_000;

export type DraftProposalOptions = {
  projectTitle: string;
  etimadRef: string | null;
  tenderTypeName: string;
  entities: IngestionEntities | null;
  complianceRows: ComplianceMatrixRow[];
  technical: TechnicalArchitectOutput & { ragContext: string; tenderContext?: string };
  financial: FinancialExtract;
  coverage: CoveragePlan;
  brandTagline: string;
  vision2030: string;
  locale?: Locale;
  restrictions?: string;
  /** Target sectors the workspace declared, as labels. */
  sectors?: string[];
  /** Dated web research on the buyer and the regulatory frame, already formatted as a block. */
  liveResearch?: string;
  /** The clarifications register: kept / submitted / answered questions to the buyer. */
  clarifications?: readonly RegisterItem[];
  /** Wall clock for a sectioned run, from its start; default `SECTION_DEADLINE_MS`. */
  deadlineMs?: number;
  /** Receives the draft as the model writes it; the result is unchanged. */
  onDelta?: (text: string) => void;
};

export type DraftProposalResult = {
  contentMd: string;
  provider: string;
  model: string;
  /** Summed across every call the draft made. */
  tokensUsed: number;
  /** True whenever any content was supplied by a deterministic fallback. */
  fallback: boolean;
  locale: Locale;
  /** Why the LLM path degraded (null when a live draft was produced). */
  failureKind: string | null;
  /** True only if some section stayed truncated after its own continuation. */
  truncated: boolean;
  /** Sections the document was assembled from (1 on the single-shot path). */
  sections: number;
  /** Sections that took their deterministic slice. */
  sectionFallbacks: number[];
  /** Requirement IDs from the coverage plan still absent from the draft after the fill. */
  uncoveredRequirementIds: string[];
};

/** The bidder's own description, for the drafting prompt. */
export function describeBidder(
  opts: Pick<DraftProposalOptions, "brandTagline" | "vision2030" | "sectors">
): string {
  const lines = [
    `Company: ${opts.brandTagline}`,
    `Vision 2030 alignment: ${opts.vision2030}`,
  ];
  if (opts.sectors?.length) lines.push(`Target sectors: ${opts.sectors.join(", ")}`);
  return lines.join("\n");
}

/** The system and user turns the draft is written from; the continuation reuses both. */
export function buildDraftingMessages(opts: Omit<DraftProposalOptions, "onDelta">): { system: string; user: string } {

  const locale: Locale = opts.locale === "en" ? "en" : "ar";
  const complianceJson = complianceJsonOf(opts.complianceRows);

  const coverageJson = JSON.stringify(
    {
      coveragePercent: opts.coverage.coveragePercent,
      coveredCount: opts.coverage.coveredCount,
      gapCount: opts.coverage.gapCount,
      evaluationWeights: opts.coverage.evaluationWeights,
      winStrategyNotes: opts.coverage.winStrategyNotes,
      missingEvidenceTasks: opts.coverage.missingEvidenceTasks.slice(0, 15),
      rows: opts.coverage.rows.slice(0, 40).map((r) => ({
        id: r.requirementId,
        text: r.requirementText.slice(0, 200),
        status: r.status,
        section: r.proposalSection,
        evidence: r.evidenceTitles,
        outline: r.responseOutline,
        sectionRef: r.sectionRef,
        pageRef: r.pageRef,
      })),
    },
    null,
    2
  );

  const ragContext = opts.technical.ragContext.slice(0, MAX_PROMPT_CHARS);
  const user = draftingUserPrompt({
    projectTitle: opts.projectTitle,
    etimadRef: opts.etimadRef,
    tenderType: opts.tenderTypeName,
    ingestionJson: JSON.stringify(opts.entities, null, 2).slice(0, 8000),
    complianceJson,
    technicalJson: JSON.stringify(
      {
        approach: opts.technical.solutionApproach,
        methodology: opts.technical.methodology,
        matchedProjects: opts.technical.matchedProjects,
        deliveryModel: opts.technical.deliveryModel,
        governance: opts.technical.governance,
        qualityPlan: opts.technical.qualityPlan,
        riskPlan: opts.technical.riskPlan,
        securityPrivacy: opts.technical.securityPrivacy,
        serviceManagement: opts.technical.serviceManagement,
        trainingTransition: opts.technical.trainingTransition,
        continuity: opts.technical.continuity,
        evaluationAlignment: opts.technical.evaluationAlignment,
        vision: opts.technical.vision2030Notes,
      },
      null,
      2
    ),
    financialJson: JSON.stringify(opts.financial, null, 2),
    coverageJson,
    ragContext,
    restrictions: opts.restrictions,
    // Already retrieved by the technical agent; the draft used to receive only
    // the past-project corpus and never the tender's own wording.
    tenderContext: (opts.technical.tenderContext ?? "").slice(0, TENDER_CONTEXT_CHARS),
    bidderProfile: describeBidder(opts),
    liveResearch: opts.liveResearch?.slice(0, LIVE_RESEARCH_CHARS),
    clarifications: formatClarificationsRegister(opts.clarifications ?? []) ?? undefined,
  });

  return { system: systemDrafting(locale), user };
}

/**
 * The proposal, eighteen sections at a time. `ARABCLUE_DRAFTING_SINGLE_SHOT=1`
 * is the kill switch back to one call for the whole document.
 */
export async function draftProposal(opts: DraftProposalOptions): Promise<DraftProposalResult> {
  if (process.env.ARABCLUE_DRAFTING_SINGLE_SHOT === "1") {
    const single = await draftProposalSingleShot(opts);
    return {
      ...single,
      sections: 1,
      sectionFallbacks: [],
      uncoveredRequirementIds: verifyRequirementCoverage(single.contentMd, opts.coverage),
    };
  }
  return draftProposalSectioned(opts);
}

/** One call for the whole document: the path every run took before sectioned drafting. */
export async function draftProposalSingleShot(opts: DraftProposalOptions): Promise<{
  contentMd: string;
  provider: string;
  model: string;
  tokensUsed: number;
  fallback: boolean;
  locale: Locale;
  /** Why the LLM path degraded (null when a live draft was produced). */
  failureKind: string | null;
  truncated: boolean;
}> {
  const locale: Locale = opts.locale === "en" ? "en" : "ar";
  const { system, user } = buildDraftingMessages(opts);

  const result = await generateCompletion(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    {
      // The first two real runs (2026-09-02) both ended `truncated: true` at
      // 8 192: a full technical-and-financial proposal in this template runs
      // longer than that. Measured at ~65 tokens/s on the production drafting
      // row, 12 288 fits the 270 s budget below with margin; the transport
      // still records `truncated` if the model runs out of room.
      maxTokens: DRAFTING_MAX_TOKENS,
      temperature: 0.28,
      engine: "DRAFTING",
      // Minutes of generation, once, inside the drafting step's own 300 s
      // function. The row's 60 s is an enrichment budget; a timed-out draft is
      // retried by the workflow as a whole stage, not by the transport.
      timeoutMs: 270_000,
      maxAttempts: 1,
      onDelta: opts.onDelta,
      promptOrigin: "system",
    }
  );
  if (result.failureKind === "pricing_refusal") {
    // The refusal sentence is not a proposal. Once it was saved as one
    // (2026-09-02); the run fails with the reason instead.
    throw new Error(
      "drafting:generateProposal refused: the composed prompt tripped the pricing guard"
    );
  }

  let contentMd = result.content?.trim() ?? "";
  if (contentMd.startsWith("```")) {
    contentMd = contentMd
      .replace(/^```(?:markdown|md)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
  }
  const usedFallback = !contentMd || result.fallback;
  if (usedFallback) {
    guardOrThrow(result, "drafting:generateProposal");
    contentMd = buildDeterministicProposal({ ...opts, locale });
  }

  return {
    contentMd,
    provider: result.provider,
    model: result.model,
    tokensUsed: result.tokensUsed,
    fallback: usedFallback || !result.content,
    locale,
    failureKind:
      usedFallback || result.fallback
        ? (result.failureKind ?? "unknown")
        : null,
    truncated: result.truncated === true && !usedFallback,
  };
}

/* -------------------------------------------------------------------------- */
/* Section registry                                                           */
/* -------------------------------------------------------------------------- */

/** A context slice a section's prompt may receive; anything not named stays out of it. */
export type ContextSliceName =
  | "entities"
  | "tenderContext"
  | "technical"
  | "compliance"
  | "financial"
  | "rag"
  | "coverageSummary"
  | "liveResearch"
  | "clarifications";

/** The fields of the technical package, by the names the single-shot prompt used. */
export type TechnicalField =
  | "approach"
  | "methodology"
  | "matchedProjects"
  | "deliveryModel"
  | "governance"
  | "qualityPlan"
  | "riskPlan"
  | "securityPrivacy"
  | "serviceManagement"
  | "trainingTransition"
  | "continuity"
  | "evaluationAlignment"
  | "vision";

export type SectionSpec = {
  number: number;
  titleEn: string;
  titleAr: string;
  /** What the section must contain, from the single-shot prompt's bullet. */
  contentBrief: string;
  maxTokens: number;
  /** The context slices the section's prompt receives. */
  slices: readonly ContextSliceName[];
  /** For the `technical` slice: which fields of the package. */
  technicalFields?: readonly TechnicalField[];
  /** For the `rag` slice: its character cap (default `RAG_CHARS_DEFAULT`). */
  ragChars?: number;
};

const TOKENS_DEEP = 2_000;
const TOKENS_MID = 1_400;
const TOKENS_BASE = 1_000;

/**
 * The eighteen sections, numbered and titled as `systemDrafting` lists them
 * and `buildDeterministicProposal` emits them. Section 10's Arabic title
 * follows the deterministic template (the fuller of the two spellings).
 */
export const PROPOSAL_SECTIONS: readonly SectionSpec[] = [
  {
    number: 1,
    titleEn: "Executive Summary",
    titleAr: "الملخص التنفيذي",
    contentBrief:
      "Outcomes the buyer gets, coverage highlights stating the requirement coverage percent from the coverage summary, the evidence-backed strengths, and explicit limitations: every GAP or NEEDS_USER_INPUT item named as such. No superlatives without evidence.",
    maxTokens: TOKENS_BASE,
    slices: ["entities", "coverageSummary", "liveResearch"],
  },
  {
    number: 2,
    titleEn: "Project Understanding",
    titleAr: "فهم المشروع",
    contentBrief:
      "Restatement of the tender scope of work, deliverables, milestones and SLA terms with citations to the tender passages (section/page where given); the buyer's context from the live research only where dated and sourced. Use the tender's own wording for penalty and preference terms; never substitute statutory defaults.",
    maxTokens: TOKENS_MID,
    slices: ["entities", "tenderContext", "liveResearch"],
  },
  {
    number: 3,
    titleEn: "Evaluation Alignment",
    titleAr: "مواءمة معايير التقييم",
    contentBrief:
      "Technical versus financial evaluation weights as the tender states them, how the response maximizes the technical score ethically (which sections carry the weight and which evidence supports them), and the win-strategy notes as a documentation strategy — never a pricing strategy.",
    maxTokens: TOKENS_BASE,
    slices: ["entities", "technical", "coverageSummary"],
    technicalFields: ["evaluationAlignment"],
  },
  {
    number: 4,
    titleEn: "Requirement Coverage Matrix",
    titleAr: "مصفوفة تغطية المتطلبات",
    contentBrief:
      'A Markdown table with exactly these columns: Req ID | requirement | response summary | evidence | status — one row per routed requirement, every ID verbatim, the requirement wording quoted from the tender, evidence limited to the listed titles ("— gap —" when none), status as given. Below the table, an evidence-completion task list for every GAP / NEEDS_USER_INPUT row.',
    maxTokens: TOKENS_DEEP,
    slices: ["tenderContext"],
  },
  {
    number: 5,
    titleEn: "Execution Methodology",
    titleAr: "منهجية التنفيذ",
    contentBrief:
      "Agile + PMI phases with entry and exit criteria per phase, grounded in the methodology and solution approach of the technical package; the deliverables of each phase; how the routed requirements are met by the method.",
    maxTokens: TOKENS_DEEP,
    slices: ["technical"],
    technicalFields: ["approach", "methodology"],
  },
  {
    number: 6,
    titleEn: "Solution Architecture & Delivery Model",
    titleAr: "المعمارية ونموذج التسليم",
    contentBrief:
      "The solution architecture and delivery model from the technical package mapped to the tender's scope passages: components, integration points, environments, and the delivery model; the routed requirements answered one by one with evidence titles. Experience is cited only from the approved corpus and the matched projects.",
    maxTokens: TOKENS_DEEP,
    slices: ["tenderContext", "technical", "rag"],
    technicalFields: ["deliveryModel", "matchedProjects"],
    ragChars: 15_000,
  },
  {
    number: 7,
    titleEn: "Governance & Quality",
    titleAr: "الحوكمة والجودة",
    contentBrief:
      "Governance structure (steering, reporting cadence, escalation, change control) and the quality plan (standards, reviews, acceptance criteria, defect handling) from the technical package; routed quality requirements answered by ID.",
    maxTokens: TOKENS_MID,
    slices: ["technical"],
    technicalFields: ["governance", "qualityPlan"],
  },
  {
    number: 8,
    titleEn: "Risk Management",
    titleAr: "إدارة المخاطر",
    contentBrief:
      "The risk plan from the technical package as a register — risk, likelihood, impact, mitigation, owner — tied to the tender's milestones and penalty terms as stated; routed risk requirements answered by ID; every open clarification about liability, penalties or termination carried as a risk with the pending question as its mitigation.",
    maxTokens: TOKENS_BASE,
    slices: ["technical", "clarifications"],
    technicalFields: ["riskPlan"],
  },
  {
    number: 9,
    titleEn: "Security & Privacy Response",
    titleAr: "الأمن والخصوصية",
    contentBrief:
      "Security and privacy response grounded in the technical package and the compliance matrix: NCA controls, PDPL obligations and the data-residency posture only as the tender and the matrix support them; routed security requirements answered by ID with the tender wording cited. No universal residency claims.",
    maxTokens: TOKENS_MID,
    slices: ["tenderContext", "technical", "compliance"],
    technicalFields: ["securityPrivacy"],
  },
  {
    number: 10,
    titleEn: "SLA & Service Management",
    titleAr: "اتفاقيات مستوى الخدمة وإدارة الخدمة",
    contentBrief:
      "Service levels, penalties and the service-management model: the tender's SLA and penalty terms quoted exactly as written (never rewritten to statutory defaults), then the service-management approach from the technical package (incident, problem, change, reporting); routed SLA requirements answered by ID.",
    maxTokens: TOKENS_MID,
    slices: ["entities", "tenderContext", "technical"],
    technicalFields: ["serviceManagement"],
  },
  {
    number: 11,
    titleEn: "Team & Qualifications",
    titleAr: "الفريق والمؤهلات",
    contentBrief:
      "Roles and qualifications drawn ONLY from approved staff evidence in the corpus; where the corpus has no matching evidence, state the gap as a task for the human team. No invented names, certifications or headcounts.",
    maxTokens: TOKENS_BASE,
    slices: ["rag"],
  },
  {
    number: 12,
    titleEn: "Relevant Experience",
    titleAr: "الخبرات ذات الصلة",
    contentBrief:
      "Past projects from the approved corpus only, each classified exact, analogous or proposed, with the evidence title cited and its relevance to this tender explained; NEVER invent clients, outcomes or metrics; state a gap where the corpus is thin.",
    maxTokens: TOKENS_DEEP,
    slices: ["rag"],
  },
  {
    number: 13,
    titleEn: "Compliance Commitments",
    titleAr: "الالتزامات التنظيمية",
    contentBrief:
      "Compliance commitments from the compliance matrix, by control and status, with remediation for anything not COMPLIANT; regulatory context from the live research cited by its numbered source and date; not legal advice — include the disclaimer verbatim.",
    maxTokens: TOKENS_MID,
    slices: ["compliance", "liveResearch"],
  },
  {
    number: 14,
    titleEn: "Training, Transition & Continuity",
    titleAr: "التدريب والانتقال والاستمرارية",
    contentBrief:
      "Training and knowledge-transfer plan, transition in and out, and the business-continuity / disaster-recovery approach from the technical package; routed training and continuity requirements answered by ID.",
    maxTokens: TOKENS_BASE,
    slices: ["technical"],
    technicalFields: ["trainingTransition", "continuity"],
  },
  {
    number: 15,
    titleEn: "Financial Forms Structure",
    titleAr: "هيكل النماذج المالية",
    contentBrief:
      "QLR narrative from the financial qualification (formula and source values; pass/fail only where the tender states a threshold), local-content preference only as tender-stated, and the BoQ table with columns Item | Unit | Qty | Unit Price | Total where every Unit Price and Total cell is an em dash (—). No prices, no commercial commentary.",
    maxTokens: TOKENS_MID,
    slices: ["financial"],
  },
  {
    number: 16,
    titleEn: "Assumptions, Exclusions & Clarifications",
    titleAr: "الافتراضات والاستثناءات والتوضيحات",
    contentBrief:
      "Assumptions, exclusions and clarification requests: one explicit task for the human team per routed GAP / NEEDS_USER_INPUT requirement (by ID); every entry of the clarifications register — open or submitted questions stated as explicit assumptions with their tender reference, answered ones cited as the entity's dated response; further ambiguities in the tender passages worth raising; and the standing notes that prices are entered only by the authorized commercial team and that regulatory content is not legal advice.",
    maxTokens: TOKENS_BASE,
    slices: ["entities", "tenderContext", "clarifications"],
  },
  {
    number: 17,
    titleEn: "Vision 2030 Alignment",
    titleAr: "المواءمة مع رؤية 2030",
    contentBrief:
      "Alignment with Vision 2030 pillars only where the technical package, the bidder profile or dated research supports it; no unsupported programme claims.",
    maxTokens: TOKENS_BASE,
    slices: ["technical", "liveResearch"],
    technicalFields: ["vision"],
  },
  {
    number: 18,
    titleEn: "Closing",
    titleAr: "الخاتمة",
    contentBrief:
      "Closing: readiness of the draft for internal human review and authorization before any official submission, the legal disclaimer verbatim, and the human-approval line verbatim.",
    maxTokens: TOKENS_BASE,
    slices: [],
  },
];

export function sectionSpecOf(number: number): SectionSpec | undefined {
  return PROPOSAL_SECTIONS.find((s) => s.number === number);
}

/** The exact heading line a section starts with: the locale's title first, the other after a slash. */
export function sectionHeading(spec: SectionSpec, locale: Locale): string {
  return locale === "ar"
    ? `## ${spec.number}. ${spec.titleAr} / ${spec.titleEn}`
    : `## ${spec.number}. ${spec.titleEn} / ${spec.titleAr}`;
}

/** Every heading, one per line; the section being written carries an arrow. */
export function proposalOutline(locale: Locale, current?: number): string {
  return PROPOSAL_SECTIONS.map(
    (s) => `${s.number === current ? "→ " : "  "}${sectionHeading(s, locale)}`
  ).join("\n");
}

/* -------------------------------------------------------------------------- */
/* Routing coverage rows to sections                                          */
/* -------------------------------------------------------------------------- */

/** `mapRequirementToSection` labels (coverage.ts) to section numbers; anything else is the technical response. */
const COVERAGE_LABEL_TO_SECTION: Readonly<Record<string, number>> = {
  "Security & Privacy": 9,
  "SLA & Service Management": 10,
  "Team & Qualifications": 11,
  "Training & Transition": 14,
  "Risk Management": 8,
  "Quality Management": 7,
  "Business Continuity": 14,
  "Solution Architecture": 6,
  Compliance: 13,
  Methodology: 5,
  "Delivery Plan": 6,
  "Technical Response": 6,
};

export function sectionNumberForCoverageLabel(label: string): number {
  return COVERAGE_LABEL_TO_SECTION[label] ?? 6;
}

/**
 * Which rows each section answers: its routed rows, plus every row for the
 * matrix (section 4) and every gap for the assumptions (section 16). No
 * planning call — the coverage planner already named the section.
 */
export function assignCoverageRows(coverage: Pick<CoveragePlan, "rows">): Map<number, CoverageRow[]> {
  const assigned = new Map<number, CoverageRow[]>();
  const add = (section: number, row: CoverageRow, cap: number) => {
    const rows = assigned.get(section) ?? [];
    if (rows.length < cap) assigned.set(section, [...rows, row]);
  };
  for (const row of coverage.rows) {
    add(4, row, MATRIX_ROWS_CAP);
    add(sectionNumberForCoverageLabel(row.proposalSection), row, SECTION_ROWS_CAP);
    if (row.status === "GAP" || row.status === "NEEDS_USER_INPUT") add(16, row, SECTION_ROWS_CAP);
  }
  return assigned;
}

/* -------------------------------------------------------------------------- */
/* Per-section context and prompt                                             */
/* -------------------------------------------------------------------------- */

type DraftInputs = Omit<DraftProposalOptions, "onDelta">;

function coverageRowJson(r: CoverageRow) {
  return {
    id: r.requirementId,
    text: r.requirementText.slice(0, 300),
    status: r.status,
    evidence: r.evidenceTitles,
    outline: r.responseOutline,
    sectionRef: r.sectionRef,
    pageRef: r.pageRef,
  };
}

function complianceJsonOf(rows: ComplianceMatrixRow[]): string {
  return JSON.stringify(
    rows.slice(0, 50).map((r) => ({
      control: r.controlId,
      status: r.status,
      sourceCategory: r.sourceCategory,
      evidence: r.evidence.slice(0, 220),
      remediation: r.remediation,
    })),
    null,
    2
  );
}

function technicalSlice(
  t: TechnicalArchitectOutput,
  fields: readonly TechnicalField[]
): Record<string, unknown> {
  const all: Record<TechnicalField, unknown> = {
    approach: t.solutionApproach,
    methodology: t.methodology,
    matchedProjects: t.matchedProjects,
    deliveryModel: t.deliveryModel,
    governance: t.governance,
    qualityPlan: t.qualityPlan,
    riskPlan: t.riskPlan,
    securityPrivacy: t.securityPrivacy,
    serviceManagement: t.serviceManagement,
    trainingTransition: t.trainingTransition,
    continuity: t.continuity,
    evaluationAlignment: t.evaluationAlignment,
    vision: t.vision2030Notes,
  };
  return Object.fromEntries(fields.map((f) => [f, all[f]]));
}

/** The `<document>` blocks a section receives — exactly the slices its registry entry names. */
export function sectionContextBlocks(
  spec: SectionSpec,
  opts: DraftInputs
): Array<SectionContextBlock & { slice: ContextSliceName }> {
  const blocks: Array<SectionContextBlock & { slice: ContextSliceName }> = [];
  for (const slice of spec.slices) {
    switch (slice) {
      case "entities": {
        const e = opts.entities;
        blocks.push({
          slice,
          title: "Tender extract digest (scope, evaluation weights, SLA, milestones)",
          body: e
            ? JSON.stringify(
              { scope: e.scope, evaluation: e.evaluation, sla: e.sla, milestones: e.milestones },
              null,
              2
            ).slice(0, ENTITIES_DIGEST_CHARS)
            : "No tender extract available.",
        });
        break;
      }
      case "tenderContext":
        blocks.push({
          slice,
          title: "Tender document passages most relevant to the scope (cite requirement wording from here)",
          body:
            (opts.technical.tenderContext ?? "").trim().slice(0, TENDER_CONTEXT_CHARS) ||
            "No tender passages retrieved.",
        });
        break;
      case "technical":
        blocks.push({
          slice,
          title: "Technical architecture package (the fields this section draws on)",
          body: JSON.stringify(technicalSlice(opts.technical, spec.technicalFields ?? []), null, 2),
        });
        break;
      case "compliance":
        blocks.push({
          slice,
          title: "Compliance matrix (evidence-backed only)",
          body: complianceJsonOf(opts.complianceRows),
        });
        break;
      case "financial":
        blocks.push({
          slice,
          title: "Financial qualification (structure-only; prices must remain blank)",
          body: JSON.stringify(opts.financial, null, 2),
        });
        break;
      case "rag":
        blocks.push({
          slice,
          title: "Approved tenant RAG corpus (ONLY source of experience/staff/methods)",
          body:
            opts.technical.ragContext.slice(0, spec.ragChars ?? RAG_CHARS_DEFAULT) ||
            "No approved corpus retrieved.",
        });
        break;
      case "coverageSummary": {
        const c = opts.coverage;
        blocks.push({
          slice,
          title: "Requirement coverage summary and win-strategy notes (documentation strategy, never pricing)",
          body: JSON.stringify(
            {
              coveragePercent: c.coveragePercent,
              coveredCount: c.coveredCount,
              partialCount: c.partialCount,
              gapCount: c.gapCount,
              evaluationWeights: c.evaluationWeights,
              strengths: c.strengths.slice(0, 10),
              winStrategyNotes: c.winStrategyNotes,
              missingEvidenceTasks: c.missingEvidenceTasks.slice(0, 15),
            },
            null,
            2
          ),
        });
        break;
      }
      case "liveResearch": {
        const text = opts.liveResearch?.trim();
        if (text) {
          blocks.push({ slice, title: LIVE_RESEARCH_BLOCK_TITLE, body: text.slice(0, LIVE_RESEARCH_CHARS) });
        }
        break;
      }
      case "clarifications": {
        const text = formatClarificationsRegister(opts.clarifications ?? []);
        if (text) {
          blocks.push({ slice, title: CLARIFICATIONS_BLOCK_TITLE, body: text.slice(0, REGISTER_MAX_CHARS) });
        }
        break;
      }
    }
  }
  return blocks;
}

/** The user turn for one section; the system turn is `systemDraftingSection(locale)`, shared. */
export function buildSectionUserPrompt(
  spec: SectionSpec,
  opts: DraftInputs,
  rows: readonly CoverageRow[]
): string {
  const locale: Locale = opts.locale === "en" ? "en" : "ar";
  return sectionDraftingUserPrompt({
    projectTitle: opts.projectTitle,
    etimadRef: opts.etimadRef,
    tenderType: opts.tenderTypeName,
    bidderProfile: describeBidder(opts),
    restrictions: opts.restrictions,
    outline: proposalOutline(locale, spec.number),
    heading: sectionHeading(spec, locale),
    contentBrief: spec.contentBrief,
    coverageRowsJson: rows.length ? JSON.stringify(rows.map(coverageRowJson), null, 2) : null,
    blocks: sectionContextBlocks(spec, opts).map(({ title, body }) => ({ title, body })),
  });
}

/* -------------------------------------------------------------------------- */
/* Ordered streaming                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Keeps the live stream linear while sections are generated concurrently:
 * text for the lowest unfinished section is forwarded as it arrives, text for
 * later sections is held, and when the head finishes the next sections flush
 * in order — whatever they have so far, then live from there. Pure: no timers,
 * no promises; the sink is whatever `onDelta` the caller gave.
 */
export class OrderedFlusher {
  private headIndex = 0;
  private readonly buffers = new Map<number, string>();
  private readonly finished = new Set<number>();
  private readonly received = new Map<number, number>();
  private lastEmitted: number | null = null;
  private closed = false;

  constructor(
    private readonly order: readonly number[],
    private readonly sink?: (text: string) => void,
    private readonly separator = "\n\n"
  ) { }

  /** The section whose text goes straight through; undefined once everything finished. */
  get head(): number | undefined {
    return this.order[this.headIndex];
  }

  /** Characters accepted for a section so far — zero when its transport never streamed. */
  pushed(section: number): number {
    return this.received.get(section) ?? 0;
  }

  push(section: number, text: string): void {
    if (this.closed || !text || this.finished.has(section)) return;
    this.received.set(section, this.pushed(section) + text.length);
    if (section === this.head) {
      this.emit(section, text);
      return;
    }
    this.buffers.set(section, (this.buffers.get(section) ?? "") + text);
  }

  complete(section: number): void {
    if (this.closed) return;
    this.finished.add(section);
    while (this.head !== undefined && this.finished.has(this.head)) {
      this.headIndex += 1;
      const next = this.head;
      if (next === undefined) return;
      const held = this.buffers.get(next);
      if (held) {
        this.buffers.delete(next);
        this.emit(next, held);
      }
    }
  }

  /** Stops forwarding; late deltas from abandoned calls go nowhere. */
  close(): void {
    this.closed = true;
  }

  private emit(section: number, text: string): void {
    if (!this.sink) return;
    if (this.lastEmitted !== null && this.lastEmitted !== section) this.sink(this.separator);
    this.sink(text);
    this.lastEmitted = section;
  }
}

/* -------------------------------------------------------------------------- */
/* Assembly                                                                   */
/* -------------------------------------------------------------------------- */

export type SectionPart = { number: number; text: string };

const ARABIC_INDIC_DIGITS = /[٠-٩]/g;
function asciiDigits(text: string): string {
  return text.replace(ARABIC_INDIC_DIGITS, (d) => String(d.charCodeAt(0) - 0x0660));
}

/** Whether the text opens with a `## N.` heading for this section, whatever the title spelling. */
export function startsWithSectionHeading(text: string, number: number): boolean {
  const firstLine = asciiDigits(text.trimStart().split("\n", 1)[0] ?? "");
  return new RegExp(`^##\\s*${number}\\.\\s`).test(firstLine);
}

/** The model's outer code fence removed, when it wrapped the section in one. */
export function stripMarkdownFences(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed
    .replace(/^```(?:markdown|md)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

/** The deterministic document split on its `## N. ` headings; the title block before section 1 is dropped. */
export function deterministicSectionsOf(md: string): Map<number, string> {
  const starts = [...md.matchAll(/^## (\d+)\. /gm)].map((m) => ({
    number: Number(m[1]),
    index: m.index ?? 0,
  }));
  const sections = new Map<number, string>();
  starts.forEach((start, i) => {
    const end = i + 1 < starts.length ? starts[i + 1].index : md.length;
    sections.set(start.number, md.slice(start.index, end).trim());
  });
  return sections;
}

/** A section's deterministic slice under the heading the live sections use. */
function deterministicSlice(sections: Map<number, string>, spec: SectionSpec, locale: Locale): string {
  const slice = sections.get(spec.number);
  const heading = sectionHeading(spec, locale);
  if (!slice) return heading;
  const newline = slice.indexOf("\n");
  const body = newline === -1 ? "" : slice.slice(newline + 1);
  return `${heading}\n${body}`.trimEnd();
}

/** Sections in numeric order joined by blank lines; one that lost its heading gets it back. */
export function assembleSections(parts: readonly SectionPart[], locale: Locale): string {
  return [...parts]
    .sort((a, b) => a.number - b.number)
    .map((part) => {
      const text = part.text.trim();
      const spec = sectionSpecOf(part.number);
      if (!spec || startsWithSectionHeading(text, part.number)) return text;
      return `${sectionHeading(spec, locale)}\n${text}`.trimEnd();
    })
    .join("\n\n");
}

/** The lines the single-shot prompt demanded verbatim, appended when a section left them out. */
export function ensureMandatoryLines(md: string, locale: Locale): string {
  const required =
    locale === "ar"
      ? [LEGAL_DISCLAIMER, HUMAN_APPROVAL_NOTICE, LEGAL_DISCLAIMER_AR, HUMAN_APPROVAL_NOTICE_AR]
      : [LEGAL_DISCLAIMER, HUMAN_APPROVAL_NOTICE];
  const missing = required.filter((line) => !md.includes(line));
  return missing.length ? `${md.trimEnd()}\n\n${missing.join("\n")}` : md;
}

/** Requirement IDs from the coverage plan that the draft never mentions verbatim. */
export function verifyRequirementCoverage(
  contentMd: string,
  coverage: Pick<CoveragePlan, "rows">
): string[] {
  return coverage.rows.map((r) => r.requirementId).filter((id) => !contentMd.includes(id));
}

/* -------------------------------------------------------------------------- */
/* The sectioned run                                                          */
/* -------------------------------------------------------------------------- */

type CompleteFn = typeof generateCompletion;

export type SectionedDraftDeps = {
  /** The completion call; tests hand in a fake so no provider is contacted. */
  complete?: CompleteFn;
  now?: () => number;
};

type SectionOutcome = {
  text: string;
  live: boolean;
  truncated: boolean;
};

const SECTION_MAX_ATTEMPTS = 2;

/**
 * Eighteen bounded calls instead of one: each section gets its own budget and
 * only the context it needs, three at a time. The stream stays linear through
 * `OrderedFlusher`. A section cut off at its cap is continued once; a section
 * whose call degrades after the first live one takes its deterministic slice;
 * a first call that degrades is the whole-document decision the single call
 * made (strict throws, permissive takes the template). Past the deadline the
 * rest of the sections take their slices. Afterwards the requirement IDs the
 * draft never mentioned get one fill call under section 4.
 */
export async function draftProposalSectioned(
  opts: DraftProposalOptions,
  deps: SectionedDraftDeps = {}
): Promise<DraftProposalResult> {
  const complete = deps.complete ?? generateCompletion;
  const now = deps.now ?? Date.now;
  const locale: Locale = opts.locale === "en" ? "en" : "ar";
  const startedAt = now();
  const deadlineAt = startedAt + (opts.deadlineMs ?? SECTION_DEADLINE_MS);
  const remaining = () => deadlineAt - now();
  /** A per-attempt timeout that fits the attempts left inside the deadline; never 0 (the transport would read 0 as "row default"). */
  const timeoutFor = (cap: number, attempts: number) =>
    Math.max(1, Math.min(cap, Math.floor(remaining() / attempts)));

  const system = systemDraftingSection(locale);
  const assigned = assignCoverageRows(opts.coverage);
  const deterministicDoc = buildDeterministicProposal({ ...opts, locale });
  const deterministic = deterministicSectionsOf(deterministicDoc);
  const flusher = new OrderedFlusher(
    PROPOSAL_SECTIONS.map((s) => s.number),
    opts.onDelta
  );

  const outcomes = new Map<number, SectionOutcome>();
  const state = {
    settled: 0,
    aborted: false,
    tokens: 0,
    provider: "",
    model: "",
    firstFailure: null as LLMResult | null,
    wholeFallback: null as LLMResult | null,
  };
  const abort = () => {
    state.aborted = true;
    flusher.close();
  };
  const takeSlice = (
    spec: SectionSpec,
    failure?: Pick<LLMResult, "fallback" | "failureKind" | "provider">
  ) => {
    guardOrThrow(
      failure ?? { fallback: true, failureKind: "timeout", provider: state.provider || "none" },
      "drafting:section"
    );
    const text = deterministicSlice(deterministic, spec, locale);
    outcomes.set(spec.number, { text, live: false, truncated: false });
    flusher.push(spec.number, text);
    flusher.complete(spec.number);
  };

  const runSection = async (spec: SectionSpec): Promise<void> => {
    if (remaining() <= 0) {
      takeSlice(spec);
      return;
    }
    const user = buildSectionUserPrompt(spec, opts, assigned.get(spec.number) ?? []);
    const result = await complete(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      {
        maxTokens: spec.maxTokens,
        temperature: 0.28,
        engine: "DRAFTING",
        promptOrigin: "system",
        maxAttempts: SECTION_MAX_ATTEMPTS,
        timeoutMs: timeoutFor(SECTION_TIMEOUT_MS, SECTION_MAX_ATTEMPTS),
        onDelta: (text) => flusher.push(spec.number, text),
      }
    );
    if (state.aborted) return;
    if (result.failureKind === "pricing_refusal") {
      abort();
      throw new Error(
        "drafting:generateProposal refused: the composed prompt tripped the pricing guard"
      );
    }
    const isFirst = state.settled === 0;
    state.settled += 1;
    state.tokens += result.tokensUsed;
    let text = stripMarkdownFences(result.content ?? "");
    if (result.fallback || !text) {
      // An empty answer that the transport did not flag is still no section.
      const degraded: LLMResult = result.fallback
        ? result
        : { ...result, fallback: true, failureKind: "invalid_response" };
      if (isFirst) {
        // Nothing live has arrived and the provider degraded: the decision the
        // single call made. Strict mode throws here.
        guardOrThrow(degraded, "drafting:generateProposal");
        state.wholeFallback = degraded;
        abort();
        return;
      }
      state.firstFailure ??= degraded;
      takeSlice(spec, degraded);
      return;
    }
    if (!state.provider) {
      state.provider = result.provider;
      state.model = result.model;
    }
    let truncated = result.truncated === true;
    if (truncated && remaining() > 0) {
      const more = await complete(
        continuationMessages({ system, user, draftSoFar: text, locale, scope: "section" }),
        {
          maxTokens: SECTION_CONTINUATION_MAX_TOKENS,
          temperature: 0.28,
          engine: "DRAFTING",
          promptOrigin: "system",
          maxAttempts: 1,
          timeoutMs: timeoutFor(SECTION_TIMEOUT_MS, 1),
          onDelta: (text) => flusher.push(spec.number, text),
        }
      );
      state.tokens += more.tokensUsed;
      if (!more.fallback && more.content?.trim()) {
        text = appendContinuation(text, more.content);
        truncated = more.truncated === true;
      }
    }
    outcomes.set(spec.number, { text, live: true, truncated });
    // A transport that cannot stream (the SDK paths) delivers the section at
    // once; the live draft still gets it, in its place.
    if (flusher.pushed(spec.number) === 0) flusher.push(spec.number, text);
    flusher.complete(spec.number);
  };

  const queue = [...PROPOSAL_SECTIONS];
  await Promise.all(
    Array.from({ length: SECTION_CONCURRENCY }, async () => {
      try {
        for (let spec = queue.shift(); spec && !state.aborted; spec = queue.shift()) {
          await runSection(spec);
        }
      } catch (error) {
        abort();
        throw error;
      }
    })
  );

  const liveCount = [...outcomes.values()].filter((o) => o.live).length;
  if (state.wholeFallback || liveCount === 0) {
    // A deadline that expired before the first call is not a provider failure,
    // but a template standing in for a model is still the strict-mode refusal.
    const degraded: Pick<LLMResult, "fallback" | "failureKind" | "provider"> =
      state.wholeFallback ?? { fallback: true, failureKind: "timeout", provider: "none" };
    guardOrThrow(degraded, "drafting:generateProposal");
    const sectionFallbacks = PROPOSAL_SECTIONS.map((s) => s.number);
    const uncoveredRequirementIds = verifyRequirementCoverage(deterministicDoc, opts.coverage);
    logSectionedRun({
      sectionFallbacks,
      uncovered: uncoveredRequirementIds.length,
      tokens: state.tokens,
      ms: now() - startedAt,
      failureKind: degraded.failureKind,
    });
    return {
      contentMd: deterministicDoc,
      provider: state.wholeFallback?.provider ?? "none",
      model: state.wholeFallback?.model ?? "none",
      tokensUsed: state.tokens,
      fallback: true,
      locale,
      failureKind: degraded.failureKind ?? "unknown",
      truncated: false,
      sections: PROPOSAL_SECTIONS.length,
      sectionFallbacks,
      uncoveredRequirementIds,
    };
  }

  const parts: SectionPart[] = PROPOSAL_SECTIONS.map((s) => ({
    number: s.number,
    text: outcomes.get(s.number)?.text ?? deterministicSlice(deterministic, s, locale),
  }));
  const sectionFallbacks = PROPOSAL_SECTIONS.filter((s) => !outcomes.get(s.number)?.live).map(
    (s) => s.number
  );
  let contentMd = assembleSections(parts, locale);
  let uncovered = verifyRequirementCoverage(contentMd, opts.coverage);
  if (uncovered.length > 0 && remaining() > 0) {
    const missingRows = opts.coverage.rows.filter((r) => uncovered.includes(r.requirementId));
    const matrix = sectionSpecOf(4)!;
    const fill = await complete(
      [
        { role: "system", content: system },
        {
          role: "user",
          content: coverageFillUserPrompt({
            projectTitle: opts.projectTitle,
            heading: sectionHeading(matrix, locale),
            missingRowsJson: JSON.stringify(missingRows.map(coverageRowJson), null, 2),
          }),
        },
      ],
      {
        maxTokens: COVERAGE_FILL_MAX_TOKENS,
        temperature: 0.28,
        engine: "DRAFTING",
        promptOrigin: "system",
        maxAttempts: 1,
        timeoutMs: timeoutFor(COVERAGE_FILL_TIMEOUT_MS, 1),
      }
    );
    state.tokens += fill.tokensUsed;
    const addition = fill.fallback ? "" : stripMarkdownFences(fill.content ?? "");
    if (addition) {
      // Under section 4, which is before section 5's heading once assembled.
      contentMd = assembleSections(
        parts.map((p) => (p.number === 4 ? { ...p, text: `${p.text.trimEnd()}\n\n${addition}` } : p)),
        locale
      );
      uncovered = verifyRequirementCoverage(contentMd, opts.coverage);
    }
  }
  contentMd = ensureMandatoryLines(contentMd, locale);

  logSectionedRun({
    sectionFallbacks,
    uncovered: uncovered.length,
    tokens: state.tokens,
    ms: now() - startedAt,
    failureKind: state.firstFailure?.failureKind,
  });
  return {
    contentMd,
    provider: state.provider,
    model: state.model,
    tokensUsed: state.tokens,
    fallback: sectionFallbacks.length > 0,
    locale,
    failureKind: sectionFallbacks.length > 0
      ? state.firstFailure?.failureKind ?? "timeout"
      : null,
    truncated: [...outcomes.values()].some((o) => o.truncated),
    sections: PROPOSAL_SECTIONS.length,
    sectionFallbacks,
    uncoveredRequirementIds: uncovered,
  };
}

/** One line per run, no content. */
function logSectionedRun(run: {
  sectionFallbacks: number[];
  uncovered: number;
  tokens: number;
  ms: number;
  failureKind?: string;
}): void {
  console.info(
    `[drafting] sectioned draft: sections=${PROPOSAL_SECTIONS.length} fallbacks=[${run.sectionFallbacks.join(",")}]${run.failureKind ? ` fallbackKind=${run.failureKind}` : ""
    } uncovered=${run.uncovered} tokens=${run.tokens} ms=${run.ms}`
  );
}

/**
 * The turns that ask the model to finish a draft it left cut off: the original
 * prompt, its own draft so far as an assistant turn, and the instruction.
 * `scope: "section"` asks for the rest of one section rather than the document.
 */
export function continuationMessages(input: {
  system: string;
  user: string;
  draftSoFar: string;
  locale: Locale;
  scope?: "document" | "section";
}): LLMMessage[] {
  const section = input.scope === "section";
  const instruction =
    input.locale === "ar"
      ? section
        ? "توقف القسم أعلاه عند حد الرموز. تابع من النقطة التي انتهى فيها تماماً، دون تكرار أي نص سابق ودون إعادة كتابة العنوان، وأكمل هذا القسم وحده حتى نهايته — لا تبدأ أي قسم آخر."
        : "توقفت المسودة أعلاه عند حد الرموز. تابع من النقطة التي انتهت فيها تماماً، دون تكرار أي نص سابق ودون إعادة كتابة العناوين المكتملة، وأكمل الأقسام المتبقية حتى نهاية الوثيقة."
      : section
        ? "The section above stopped at the token limit. Continue exactly where it stops — do not repeat any earlier text or rewrite the heading — and finish this section only; do not start any other section."
        : "The draft above stopped at the token limit. Continue exactly where it stops — do not repeat any earlier text or rewrite completed headings — and finish the remaining sections through the end of the document.";
  return [
    { role: "system", content: input.system },
    { role: "user", content: input.user },
    { role: "assistant", content: input.draftSoFar },
    { role: "user", content: instruction },
  ];
}

/** The draft with its continuation appended; a repeated last line is kept once. */
export function appendContinuation(draft: string, continuation: string): string {
  const more = continuation.replace(/^```(?:markdown|md)?\s*/i, "").replace(/\s*```$/i, "").trimEnd();
  if (!more.trim()) return draft;
  const lastLine = draft.slice(draft.lastIndexOf("\n") + 1).trim();
  const trimmedMore = more.replace(/^\s+/, "");
  if (lastLine.length > 0 && trimmedMore.startsWith(lastLine)) {
    // Whatever followed the repeated line — a paragraph break, a space — is
    // the model's own spacing for what comes next; keep it.
    return `${draft}${trimmedMore.slice(lastLine.length)}`;
  }
  // Mid-word cut: the model resumes the word, so no separator.
  const midWord = /\S$/.test(draft) && /^\S/.test(more) && !/^[#\-*|>]/.test(more);
  return midWord ? `${draft}${more}` : `${draft}\n${trimmedMore}`;
}

export async function continueProposalDraft(
  opts: DraftProposalOptions & { draftSoFar: string }
): Promise<{
  continuation: string;
  provider: string;
  model: string;
  tokensUsed: number;
  truncated: boolean;
  fallback: boolean;
}> {
  const locale: Locale = opts.locale === "en" ? "en" : "ar";
  const { system, user } = buildDraftingMessages(opts);
  const result = await generateCompletion(
    continuationMessages({ system, user, draftSoFar: opts.draftSoFar, locale }),
    {
      maxTokens: DRAFT_CONTINUATION_MAX_TOKENS,
      temperature: 0.28,
      engine: "DRAFTING",
      timeoutMs: 270_000,
      maxAttempts: 1,
      onDelta: opts.onDelta,
      promptOrigin: "system",
    }
  );
  if (result.failureKind === "pricing_refusal") {
    throw new Error("drafting:continueProposal refused: the composed prompt tripped the pricing guard");
  }
  if (result.fallback || !result.content?.trim()) {
    // No deterministic continuation exists; the truncated draft stands.
    guardOrThrow(result, "drafting:continueProposal");
    return {
      continuation: "",
      provider: result.provider,
      model: result.model,
      tokensUsed: result.tokensUsed,
      truncated: false,
      fallback: true,
    };
  }
  return {
    continuation: result.content,
    provider: result.provider,
    model: result.model,
    tokensUsed: result.tokensUsed,
    truncated: result.truncated === true,
    fallback: false,
  };
}

function coverageTable(coverage: CoveragePlan, locale: Locale): string {
  const header =
    locale === "ar"
      ? "| المعرف | المتطلب | القسم | الأدلة | الحالة |\n| --- | --- | --- | --- | --- |"
      : "| ID | Requirement | Section | Evidence | Status |\n| --- | --- | --- | --- | --- |";
  const rows = coverage.rows
    .slice(0, 40)
    .map((r) => {
      const ev =
        r.evidenceTitles.length > 0
          ? r.evidenceTitles.slice(0, 2).join("; ")
          : locale === "ar"
            ? "— فجوة —"
            : "— gap —";
      return `| ${r.requirementId} | ${r.requirementText.replace(/\|/g, "/").slice(0, 120)} | ${r.proposalSection} | ${ev.replace(/\|/g, "/")} | ${r.status} |`;
    })
    .join("\n");
  return `${header}\n${rows}`;
}

export function buildDeterministicProposal(opts: {
  projectTitle: string;
  etimadRef: string | null;
  tenderTypeName: string;
  entities: IngestionEntities | null;
  complianceRows: ComplianceMatrixRow[];
  technical: TechnicalArchitectOutput & { ragContext: string; tenderContext?: string };
  financial: FinancialExtract;
  coverage: CoveragePlan;
  brandTagline: string;
  vision2030: string;
  locale?: Locale;
  /** The clarifications register; section 16 lists it. */
  clarifications?: readonly RegisterItem[];
}): string {
  const locale: Locale = opts.locale === "en" ? "en" : "ar";
  const e = opts.entities;
  const registerMd = clarificationsRegisterMarkdown(opts.clarifications ?? [], locale);
  const clarificationsMd = registerMd ? `\n${registerMd}\n` : "";
  const c = opts.coverage;
  const compliant = opts.complianceRows.filter((r) => r.status === "COMPLIANT").length;
  const qlr = opts.financial.quickLiquidityRatio;
  const qlrLabel =
    qlr == null
      ? locale === "ar"
        ? "غير محسوب — يلزم كشف مالي معتمد"
        : "N/A — upload approved financial statements"
      : opts.financial.qlrPasses == null
        ? `${qlr} (${opts.financial.qlrFormula ?? "QLR"}; no tender threshold)`
        : `${qlr} (${opts.financial.qlrPasses ? "PASS" : "FAIL"} vs ${opts.financial.qlrThreshold})`;
  const lcPref = opts.financial.localContentPreferenceApplied;
  const lcLabel =
    lcPref == null
      ? locale === "ar"
        ? "غير مذكور في المناقصة"
        : "Not stated in tender"
      : `${lcPref}% (tender-stated)`;
  const gaps = c.missingEvidenceTasks
    .slice(0, 12)
    .map((t) => `- ${t}`)
    .join("\n");
  const experienceBlock = opts.technical.matchedProjects.length
    ? opts.technical.matchedProjects
      .map((p) =>
        locale === "ar"
          ? `- **${p.title}** [${p.experienceClass}] — ${p.why}`
          : `- **${p.title}** [${p.experienceClass}] — score ${p.score.toFixed(2)}: ${p.why}`
      )
      .join("\n")
    : locale === "ar"
      ? "_لا توجد مشاريع معتمدة مطابقة — يُدرج كفجوة أدلة_"
      : "_No approved matching projects — recorded as evidence gap_";

  const complianceBlock = opts.complianceRows
    .slice(0, 25)
    .map(
      (r) =>
        `| ${r.controlId} | ${r.title} | ${r.status} | ${r.sourceCategory ?? "—"} | ${(r.evidence ?? "").replace(/\|/g, "/").slice(0, 100)} |`
    )
    .join("\n");

  const brandLabel = isPlaceholderCompanyName(opts.brandTagline)
    ? locale === "ar"
      ? "الشركة المقدّمة للعطاء"
      : "Bidding Company"
    : opts.brandTagline;

  const scopeText =
    e?.scope && isQualityScopeText(e.scope)
      ? e.scope
      : locale === "ar"
        ? "نطاق العمل كما ورد في كراسة الشروط المرفوعة (يُستكمل يدوياً إن لزم)."
        : "Scope as defined in the uploaded conditions booklet (complete manually if needed).";

  const humanNotice = locale === "ar" ? HUMAN_APPROVAL_NOTICE_AR : HUMAN_APPROVAL_NOTICE;

  if (locale === "ar") {
    return `# العطاء الفني — ${opts.projectTitle}

**العلامة:** ${brandLabel}  
**مرجع اعتماد:** ${opts.etimadRef ?? "غير متوفر"}  
**نوع المناقصة:** ${opts.tenderTypeName}  
**تغطية المتطلبات:** ${c.coveragePercent}% (${c.coveredCount} مكتمل / ${c.partialCount} جزئي / ${c.gapCount} فجوة)

## 1. الملخص التنفيذي
يقدّم هذا العطاء استجابة منظّمة وفق مصفوفة تغطية المتطلبات، مع أولوية الوزن الفني (${c.evaluationWeights.technical}%). تُستخدم حصراً الأدلة المعتمدة لدى المستأجر ونص المناقصة.
نقاط القوة: ${c.strengths.slice(0, 3).join("؛ ") || "قيد استكمال الأدلة"}
${LEGAL_DISCLAIMER_AR}
${humanNotice}

## 2. فهم المشروع
${scopeText}

| البند | القيمة |
| --- | --- |
| الوزن الفني | ${c.evaluationWeights.technical}% |
| الوزن المالي | ${c.evaluationWeights.financial}% |
| غرامة التأخير (نص المناقصة) | ${e?.sla.perWeek ?? "—"}% / أسبوع (حد ${e?.sla.maxPercent ?? "—"}%) |

## 3. مواءمة معايير التقييم
${opts.technical.evaluationAlignment}

استراتيجية التوثيق (بدون تسعير):
${c.winStrategyNotes.map((n) => `- ${n}`).join("\n")}

## 4. مصفوفة تغطية المتطلبات
${coverageTable(c, "ar")}

### مهام استكمال الأدلة
${gaps || "- لا توجد فجوات مسجّلة في الاستخراج الحالي"}

## 5. منهجية التنفيذ
${opts.technical.methodology.map((m) => `### ${m.id}. ${m.nameAr}\n${m.rationale}`).join("\n\n")}

## 6. المعمارية ونموذج التسليم
${opts.technical.solutionApproach}

**نموذج التسليم:** ${opts.technical.deliveryModel}

## 7. الحوكمة والجودة
**الحوكمة:** ${opts.technical.governance}

**الجودة:** ${opts.technical.qualityPlan}

## 8. إدارة المخاطر
${opts.technical.riskPlan}

## 9. الأمن والخصوصية
${opts.technical.securityPrivacy}

## 10. اتفاقيات مستوى الخدمة وإدارة الخدمة
${opts.technical.serviceManagement}

## 11. الفريق والمؤهلات
تُدرج مؤهلات الفريق فقط من أدلة الكوادر المعتمدة في قاعدة المعرفة. أي نقص يُسجَّل كمهمة استكمال.

## 12. الخبرات ذات الصلة
${experienceBlock}

تصنيف الخبرة: exact = تطابق مباشر من دليل معتمد؛ analogous = خبرة مشابهة؛ proposed = نهج مقترح دون ادّعاء إنجاز سابق.

## 13. الالتزامات التنظيمية
ضوابط COMPLIANT: ${compliant}/${opts.complianceRows.length}

| الضابط | العنوان | الحالة | فئة المصدر | الدليل |
| --- | --- | --- | --- | --- |
${complianceBlock}

${LEGAL_DISCLAIMER_AR}

## 14. التدريب والانتقال والاستمرارية
**التدريب والانتقال:** ${opts.technical.trainingTransition}

**الاستمرارية:** ${opts.technical.continuity}

## 15. هيكل النماذج المالية
- QLR: ${qlrLabel}
- تفضيل المحتوى المحلي: ${lcLabel}
- بنود BoQ (هيكل فقط): ${opts.financial.boqItems.length}

${opts.financial.notes.map((n) => `- ${n}`).join("\n")}

| البند | الوحدة | الكمية | السعر | الإجمالي |
| --- | --- | --- | --- | --- |
${opts.financial.boqItems
        .slice(0, 20)
        .map((b) => `| ${b.item} | ${b.unit} | ${b.qty} | — | — |`)
        .join("\n")}

## 16. الافتراضات والاستثناءات والتوضيحات
- الأسعار والتعبئة التجارية من مسؤولية الفريق التجاري المعتمد لدى العميل فقط.
- أي متطلب بحالة GAP/NEEDS_USER_INPUT يتطلب دليلاً معتمداً قبل التسليم النهائي.
- المحتوى التنظيمي ليس استشارة قانونية.
${clarificationsMd}
## 17. المواءمة مع رؤية 2030
${opts.technical.vision2030Notes}
ملاحظة العلامة: ${opts.vision2030}

## 18. الخاتمة
نؤكد جاهزية المسودة للمراجعة البشرية والاعتماد الداخلي قبل أي تقديم رسمي.
${humanNotice}

---
*أراب كلاو — صياغة مساعدة عالية الدقة · المؤلف النهائي هو المستخدم*
`;
  }

  return `# Technical Proposal — ${opts.projectTitle}

**Brand:** ${opts.brandTagline}  
**Etimad Ref:** ${opts.etimadRef ?? "N/A"}  
**Tender Type:** ${opts.tenderTypeName}  
**Requirement coverage:** ${c.coveragePercent}% (${c.coveredCount} covered / ${c.partialCount} partial / ${c.gapCount} gaps)

## 1. Executive Summary
This package is organized as an evaluator-scorable technical response prioritizing the technical evaluation weight (${c.evaluationWeights.technical}%). All factual claims are limited to tender text and approved tenant evidence.
Strengths: ${c.strengths.slice(0, 3).join("; ") || "Pending additional approved evidence"}
${LEGAL_DISCLAIMER}
${humanNotice}

## 2. Project Understanding
${e?.scope ?? "Scope as defined in the uploaded conditions booklet."}

| Item | Value |
| --- | --- |
| Technical evaluation weight | ${c.evaluationWeights.technical}% |
| Financial evaluation weight | ${c.evaluationWeights.financial}% |
| SLA penalty (tender clause) | ${e?.sla.perWeek ?? "—"}% / week (max ${e?.sla.maxPercent ?? "—"}%) |

## 3. Evaluation Alignment
${opts.technical.evaluationAlignment}

Documentation strategy (no pricing):
${c.winStrategyNotes.map((n) => `- ${n}`).join("\n")}

## 4. Requirement Coverage Matrix
${coverageTable(c, "en")}

### Evidence completion tasks
${gaps || "- No extraction-time gaps recorded"}

## 5. Execution Methodology
${opts.technical.methodology.map((m) => `### ${m.id}. ${m.name} (${m.nameAr})\n${m.rationale}`).join("\n\n")}

## 6. Solution Architecture & Delivery Model
${opts.technical.solutionApproach}

**Delivery model:** ${opts.technical.deliveryModel}

## 7. Governance & Quality
**Governance:** ${opts.technical.governance}

**Quality:** ${opts.technical.qualityPlan}

## 8. Risk Management
${opts.technical.riskPlan}

## 9. Security & Privacy Response
${opts.technical.securityPrivacy}

## 10. SLA & Service Management
${opts.technical.serviceManagement}

## 11. Team & Qualifications
Staff qualifications are drawn only from approved active staff evidence in the tenant knowledge base. Shortfalls are listed as completion tasks.

## 12. Relevant Experience
${experienceBlock}

Experience classes: **exact** = direct approved evidence match; **analogous** = related approved evidence; **proposed** = approach without claiming prior delivery.

## 13. Compliance Commitments
COMPLIANT controls: ${compliant}/${opts.complianceRows.length}

| Control | Title | Status | Source category | Evidence |
| --- | --- | --- | --- | --- |
${complianceBlock}

${LEGAL_DISCLAIMER}

## 14. Training, Transition & Continuity
**Training & transition:** ${opts.technical.trainingTransition}

**Continuity:** ${opts.technical.continuity}

## 15. Financial Forms Structure
- QLR: ${qlrLabel}
- Local content preference: ${lcLabel}
- BoQ lines (structure only): ${opts.financial.boqItems.length}

${opts.financial.notes.map((n) => `- ${n}`).join("\n")}

| Item | Unit | Qty | Unit Price | Total |
| --- | --- | --- | --- | --- |
${opts.financial.boqItems
      .slice(0, 20)
      .map((b) => `| ${b.item} | ${b.unit} | ${b.qty} | — | — |`)
      .join("\n")}

## 16. Assumptions, Exclusions & Clarifications
- Commercial prices are entered solely by the client's authorized commercial team.
- Any GAP / NEEDS_USER_INPUT requirement requires approved evidence before final submission.
- Regulatory content is not legal advice.
${clarificationsMd}
## 17. Vision 2030 Alignment
${opts.technical.vision2030Notes}
Brand note: ${opts.vision2030}

## 18. Closing
This draft is ready for internal human review and authorization prior to any official submission.
${humanNotice}

---
*ArabClue — precision assisted drafting · user is final author of record*
`;
}
