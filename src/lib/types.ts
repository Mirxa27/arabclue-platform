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

export interface FinancialExtract {
  cashEquivalents: number | null;
  accountsReceivable: number | null;
  currentLiabilities: number | null;
  quickLiquidityRatio: number | null;
  qlrPasses: boolean | null;
  saudizationPercent: number | null;
  boqItems: {
    item: string;
    unit: string;
    qty: number;
    unitPrice: number;
    total: number;
  }[];
  localContentPreferenceApplied: number;
  notes: string[];
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
