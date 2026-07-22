// Domain types shared between frontend & backend

export type Role = "SUPER_ADMIN" | "ADMIN" | "BIDDER" | "REVIEWER" | "FINANCE";
export type Locale = "ar" | "en";

export type DocCategory =
  | "RFP"
  | "TECHNICAL_SPECS"
  | "IT_CONTRACT"
  | "EA_COMPLIANCE"
  | "QUALIFICATION"
  | "FINANCIAL"
  | "BRAND_ASSET"
  | "OTHER";

export type ProjectStatus =
  | "DRAFT"
  | "PARSING"
  | "DRAFTING"
  | "REVIEW"
  | "SUBMITTED"
  | "ARCHIVED";

export type AgentRunStatus =
  | "QUEUED"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type AgentId =
  | "INGESTION"
  | "COMPLIANCE_REGULATORY"
  | "TECHNICAL_ARCHITECT"
  | "FINANCIAL_QUALIFICATION"
  | "PROPOSAL_DRAFTING";

/** Structured extract produced by the Ingestion agent */
export interface IngestionEntities {
  scope: string;
  evaluation: { technical: number; financial: number };
  /** Tender-stated penalty values only — never rewritten to statutory defaults */
  sla: {
    perWeek: number;
    maxPercent: number;
    /** True only when tender text itself states a cap */
    capped?: boolean;
    originalWording?: string | null;
    statutoryCandidateMaxPercent?: number | null;
    statutoryCandidateSource?: string | null;
  };
  milestones: { name: string; weeks: number }[];
  evidence: string[];
  requirements?: TenderRequirementExtract[];
  rawTextExcerpt?: string;
  localContentPreferencePercent?: number | null;
  localContentOriginalWording?: string | null;
  noraPrinciplesFromTender?: { id: string; name: string; snippet: string }[];
}

export type ComplianceRowStatus =
  | "COMPLIANT"
  | "PARTIAL"
  | "NON_COMPLIANT"
  | "NOT_APPLICABLE"
  | "EVIDENCE_MISSING"
  | "CLARIFICATION_REQUIRED"
  | "LEGAL_REVIEW_REQUIRED"
  | "EXPIRED_EVIDENCE"
  | "PENDING";

export type ComplianceSourceCategory =
  | "EXPLICIT_TENDER"
  | "REGULATORY_CANDIDATE"
  | "INFERRED_APPLICABILITY"
  | "INTERNAL_RECOMMENDATION";

export interface ComplianceMatrixRow {
  frameworkId: string;
  controlId: string;
  title: string;
  status: ComplianceRowStatus;
  evidence: string;
  remediation?: string | null;
  /** How this row was derived — never merge categories in a misleading way */
  sourceCategory?: ComplianceSourceCategory;
  legalReviewStatus?:
    | "NOT_REQUIRED"
    | "REQUIRED"
    | "PENDING"
    | "APPROVED"
    | "NOT_LEGAL_ADVICE";
  policyVersionId?: string | null;
}

export interface BoqLineItem {
  item: string;
  unit: string;
  qty: number;
  /** Always null from AI agents — human-entered only */
  unitPrice: number | null;
  /** Always null from AI agents — human-entered only */
  total: number | null;
}

export interface FinancialFormsData {
  boqItems: BoqLineItem[];
  currency?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface FinancialExtract {
  cashEquivalents: number | null;
  accountsReceivable: number | null;
  currentLiabilities: number | null;
  quickLiquidityRatio: number | null;
  /** Null unless tender (or approved rule) states an explicit QLR threshold */
  qlrPasses: boolean | null;
  qlrThreshold: number | null;
  qlrFormula: string | null;
  saudizationPercent: number | null;
  /** Structure-only BoQ — prices always null from agents */
  boqItems: BoqLineItem[];
  /** Null unless tender states a preference mechanism percentage */
  localContentPreferenceApplied: number | null;
  notes: string[];
}

export type OnboardingStepKey =
  | "brand"
  | "legal"
  | "trackRecord"
  | "humanCapital"
  | "methodologies"
  | "contentLibrary"
  | "partnerships"
  | "sectors"
  | "approvalChain"
  | "restrictions";

export type RequirementStatus = "COVERED" | "IN_PROGRESS" | "MISSING";
export type LinkedResourceType =
  | "CERTIFICATE"
  | "STAFF"
  | "PAST_PROJECT"
  | "LIBRARY"
  | "METHODOLOGY";

export interface TenderRequirementExtract {
  text: string;
  sectionRef?: string | null;
  pageRef?: string | null;
}

export interface TechnicalArchitectOutput {
  methodology: { id: number; name: string; nameAr: string; rationale: string }[];
  matchedProjects: { id: string; title: string; score: number; why: string }[];
  solutionApproach: string;
  vision2030Notes: string;
}

export interface AgentState {
  id: AgentId;
  name: string;
  nameAr: string;
  status: "pending" | "running" | "completed" | "failed";
  progress: number; // 0-100
  startedAt?: string;
  completedAt?: string;
  output?: string;
  findings?: string[];
}

export interface ComplianceFramework {
  id: string;
  name: string;
  nameAr: string;
  controls: ComplianceControl[];
}

export interface ComplianceControl {
  controlId: string;
  title: string;
  titleAr: string;
  requirement: string;
  level: "C1" | "C2" | "C3";
}

export interface TenderProjectSummary {
  id: string;
  etimadRef: string | null;
  title: string;
  status: ProjectStatus;
  complianceScore: number;
  documentCount: number;
  agentRunStatus: AgentRunStatus | null;
  budget: number | null;
  currency: string;
  submissionDeadline: string | null;
  createdAt: string;
}
