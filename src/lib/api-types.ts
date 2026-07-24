/** Shared API DTO types for dashboard clients — no `any`. */

export type ApiProject = {
  id: string;
  title: string;
  titleAr?: string | null;
  etimadRef: string;
  category?: string | null;
  status: string;
  budget?: number | null;
  currency?: string;
  submissionDeadline?: string | null;
  complianceScore: number;
  _count?: {
    documents: number;
    agentRuns: number;
    complianceChecks: number;
    proposals: number;
  };
  latestAgentRun?: {
    id: string;
    status: string;
    overallProgress: number;
  } | null;
};

export type ApiDocument = {
  id: string;
  originalName: string;
  docCategory: string;
  parseStatus: string;
  sizeBytes: number;
  mimeType: string;
  storagePath?: string;
  projectId?: string | null;
  parsedSummary?: string | null;
  createdAt: string;
  updatedAt?: string;
  currentVersion?: number;
  uploadedBy?: { name: string } | null;
  versions?: ApiDocumentVersion[];
  _count?: { versions: number };
};

export type ApiDocumentVersion = {
  id: string;
  version: number;
  changeLog?: string | null;
  sizeBytes: number;
  createdAt: string;
  createdBy?: string | null;
  parsedSummary?: string | null;
};

export type ApiProposalArtifact = {
  type: string;
  filename: string;
  downloadPath?: string;
};

export type ApiProposalVersion = {
  id: string;
  proposalId?: string;
  version: number;
  contentMd?: string;
  changeLog?: string | null;
  locale?: string | null;
  createdAt: string;
  createdBy?: string | null;
};

export type ApiProposal = {
  id: string;
  title: string;
  titleAr?: string | null;
  type?: string | null;
  status: string;
  contentMd?: string | null;
  complianceScore?: number | null;
  locale?: string | null;
  version?: number;
  createdAt: string;
  generatedAt?: string | null;
  artifacts?: ApiProposalArtifact[];
  artifactsJson?: string | null;
  versions?: ApiProposalVersion[];
  project?: {
    id: string;
    title: string;
    titleAr?: string | null;
    etimadRef: string;
  } | null;
};

export type ApiComplianceCheck = {
  id: string;
  framework: string;
  controlId: string;
  title: string;
  status: string;
  evidence?: string | null;
  remediation?: string | null;
};

export type ApiAuditLog = {
  id: string;
  action: string;
  resource?: string | null;
  createdAt: string;
  success?: boolean;
};

export type ChartSlice = {
  status?: string;
  category?: string;
  count: number;
};

export type StatsResponse = {
  workspace: { id: string; name: string; nameAr?: string | null; plan: string };
  kpis: {
    activeProjects: number;
    totalProjects: number;
    proposalsGenerated: number;
    avgCompliance: number;
    documentsProcessed: number;
    pastProjects: number;
    runningAgents: number;
    completedAgents: number;
  };
  charts: {
    statusBreakdown: ChartSlice[];
    docCategoryBreakdown: ChartSlice[];
  };
  trends: {
    projects: number | null;
    documents: number | null;
    proposals: number | null;
    compliance: number | null;
  };
};

export type ApiPastProject = {
  id: string;
  title: string;
  titleAr?: string | null;
  clientName?: string | null;
  clientNameAr?: string | null;
  sector?: string | null;
  contractValue?: number | null;
  currency?: string | null;
  outcome?: string | null;
  summary?: string | null;
  summaryAr?: string | null;
  tags?: string | null;
};

export type ApiAIProvider = {
  id: string;
  name: string;
  provider: string;
  model: string;
  modelId?: string;
  engine?: string;
  /** Engines/services this connection serves (multi-select). */
  engines?: string[];
  isActive: boolean;
  isDefault?: boolean;
  priority?: number;
  temperature?: number | null;
  maxTokens?: number | null;
  topP?: number | null;
  apiKeySet?: boolean;
  apiKeyEnvKey?: string | null;
  baseUrl?: string | null;
  apiBase?: string | null;
  contextWindow?: number;
  supportsVision?: boolean;
  supportsJsonMode?: boolean;
  supportsTools?: boolean;
  confidenceThreshold?: number | null;
  toxicityFilter?: boolean;
  piiFilter?: boolean;
  hallucinationGuard?: boolean;
  inputCostPer1k?: number;
  outputCostPer1k?: number;
  maxRetries?: number;
  timeoutMs?: number;
  modelsCache?: Array<{
    id: string;
    contextWindow: number;
    maxTokens: number;
    supportsVision: boolean;
    supportsJsonMode: boolean;
    supportsTools: boolean;
    inputCostPer1k?: number;
    outputCostPer1k?: number;
  }>;
  modelsFetchedAt?: string | null;
};

export type ProviderPatch = Partial<{
  name: string;
  model: string;
  modelId: string;
  provider: string;
  engine: string;
  engines: string[];
  temperature: number;
  maxTokens: number;
  topP: number;
  isActive: boolean;
  isDefault: boolean;
  priority: number;
  baseUrl: string | null;
  apiBase: string | null;
  apiKeyEnvKey: string | null;
  apiKey: string;
  contextWindow: number;
  supportsVision: boolean;
  supportsJsonMode: boolean;
  supportsTools: boolean;
  confidenceThreshold: number;
  toxicityFilter: boolean;
  piiFilter: boolean;
  hallucinationGuard: boolean;
  inputCostPer1k: number;
  outputCostPer1k: number;
  maxRetries: number;
  timeoutMs: number;
}>;

export type RoleCount = { role: string; count: number };
export type ActionCount = { action: string; count: number };

export type AdminOverviewResponse = {
  kpis?: {
    totalUsers?: number;
    activeUsers?: number;
    totalWorkspaces?: number;
    totalProjects?: number;
    totalProposals?: number;
    activeProviders?: number;
    totalAgentRuns?: number;
    activeSubscriptions?: number;
    totalAuditLogs?: number;
    recentAudit24h?: number;
  };
  charts?: {
    usersByRole?: RoleCount[];
    auditByAction?: ActionCount[];
  };
};

export type ApiCertificate = {
  id: string;
  certType: string;
  name: string;
  number?: string | null;
  issuer?: string | null;
  issuedAt?: string | null;
  expiresAt?: string | null;
  alertDays: number;
  notes?: string | null;
};

export type ApiStaffMember = {
  id: string;
  name: string;
  nameAr?: string | null;
  roleTitle: string;
  roleTitleAr?: string | null;
  certifications?: string | null;
  cvSummary?: string | null;
  requirementTags?: string[];
  active: boolean;
};

export type ApiTenderRequirement = {
  id: string;
  text: string;
  sectionRef?: string | null;
  pageRef?: string | null;
  status: string;
  linkedResourceType?: string | null;
  linkedResourceId?: string | null;
  sortOrder: number;
};

export type ApiProposalReview = {
  id: string;
  proposalId: string;
  stepIndex: number;
  reviewerId: string;
  stepRole: string;
  status: string;
  comment?: string | null;
  decidedAt?: string | null;
  reviewer?: { id: string; name: string; email: string };
  proposal?: {
    id: string;
    title: string;
    titleAr?: string | null;
    type?: string | null;
    status: string;
    project?: { id: string; title: string } | null;
  };
};

export type ApiNotification = {
  id: string;
  type: "CERT_EXPIRY" | "PENDING_REVIEW" | "ONBOARDING" | "INFO";
  severity: "INFO" | "WARN" | "CRITICAL";
  title: string;
  titleAr: string;
  body: string;
  bodyAr: string;
  href?: string;
  createdAt: string;
};

export type OnboardingStatusResponse = {
  readyForProposals: boolean;
  restrictionsReviewed: boolean;
  steps: Record<string, boolean>;
  missing: string[];
};
