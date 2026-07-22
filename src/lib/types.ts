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
  sla: { perWeek: number; maxPercent: number; capped?: boolean };
  milestones: { name: string; weeks: number }[];
  evidence: string[];
  requirements?: TenderRequirementExtract[];
  rawTextExcerpt?: string;
}

export interface ComplianceMatrixRow {
  frameworkId: string;
  controlId: string;
  title: string;
  status: "COMPLIANT" | "NON_COMPLIANT" | "PARTIAL" | "PENDING";
  evidence: string;
  remediation?: string | null;
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
  qlrPasses: boolean | null;
  saudizationPercent: number | null;
  /** Structure-only BoQ — prices always null from agents */
  boqItems: BoqLineItem[];
  localContentPreferenceApplied: number;
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
