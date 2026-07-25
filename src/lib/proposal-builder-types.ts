/**
 * Shared types for proposal builder, template marketplace, analytics, and collaboration.
 */

export type LocaleCode = "ar" | "en";

export type LocalizedString = {
  readonly ar: string;
  readonly en: string;
};

export type SectionType =
  | "cover"
  | "executive-summary"
  | "technical-approach"
  | "pricing"
  | "team"
  | "qualifications"
  | "timeline"
  | "compliance"
  | "appendix";

export type ProposalSection = {
  id?: string;
  sectionKey: string;
  sectionType: SectionType;
  title: LocalizedString;
  content: LocalizedString;
  sortOrder: number;
  isVisible: boolean;
  isRequired?: boolean;
  metadata?: Record<string, unknown>;
};

export type ProposalMetadata = {
  proposalId?: string;
  title: LocalizedString;
  projectId: string;
  workspaceId: string;
  locale: LocaleCode;
  version: number;
  status?: string;
  updatedAt?: string;
};

export type ValidationIssue = {
  code: string;
  severity: "error" | "warning";
  sectionKey?: string;
  message: LocalizedString;
};

export type ValidationSummary = {
  ok: boolean;
  blocking: boolean;
  issues: ValidationIssue[];
  criticalErrors: ValidationIssue[];
  completenessPercent: number;
  overallScore: number;
};

export type TemplateCategory =
  | "construction"
  | "it"
  | "consulting"
  | "government"
  | "healthcare"
  | "general";

export type MarketplaceFilters = {
  category?: TemplateCategory;
  sortBy?: "newest" | "rating" | "downloads" | "name";
  isFeatured?: boolean;
  search?: string;
};

export type TemplateMarketplaceItem = {
  id: string;
  templateKey: string;
  name: LocalizedString;
  description: LocalizedString;
  category: TemplateCategory;
  industry: string | null;
  sectionTypes: SectionType[];
  previewData?: Record<string, unknown> | null;
  rating: number;
  ratingCount: number;
  downloadCount: number;
  usageCount: number;
  isPublic: boolean;
  isFeatured: boolean;
  version: number;
  tags: string[];
  createdBy?: string | null;
  createdAt: string;
  source?: "system" | "workspace" | "public";
};

export type DateRange = {
  start: string;
  end: string;
};

export type AnalyticsMetric = {
  key: string;
  label: LocalizedString;
  value: number;
  previousValue?: number;
  trend: "up" | "down" | "stable";
  unit?: string;
};

export type TimeSeriesPoint = {
  date: string;
  value: number;
};

export type CategoryCount = {
  category: string;
  count: number;
  label?: LocalizedString;
};

export type AnalyticsCharts = {
  proposalsOverTime: TimeSeriesPoint[];
  exportsByType: CategoryCount[];
  templateUsage: CategoryCount[];
  sectionCompletion: CategoryCount[];
};

export type AnalyticsSummary = {
  metrics: AnalyticsMetric[];
  charts: AnalyticsCharts;
  range: DateRange;
};

export type CollaborationComment = {
  id: string;
  proposalId: string;
  sectionKey: string | null;
  content: string;
  mentions: string[];
  isResolved: boolean;
  parentId: string | null;
  createdBy: string;
  creatorName: string;
  creatorAvatar?: string | null;
  createdAt: string;
  updatedAt: string;
  creator?: { id: string; name: string; avatarUrl?: string | null };
};

export type CommentThread = {
  root: CollaborationComment;
  replies: CollaborationComment[];
};

export type CollaborationPresence = {
  userId: string;
  name: string;
  avatarUrl?: string | null;
  sectionKey?: string | null;
  lastSeenAt: string;
};