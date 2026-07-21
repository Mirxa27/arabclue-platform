// Domain types shared between frontend & backend

export type Role = "ADMIN" | "BIDDER" | "REVIEWER" | "FINANCE";
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
  | "EA_COMPLIANCE"
  | "LEGAL_REGULATORY"
  | "FINANCIAL_QUALIFICATION"
  | "PROPOSAL_DRAFTING";

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
