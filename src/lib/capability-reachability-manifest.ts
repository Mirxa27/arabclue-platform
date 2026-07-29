/**
 * Machine-readable reachability graph for platform-completion capabilities
 * (task 12.3 / Property 35). Every introduced or materially extended route or
 * library entry must have a valid inbound UI, scheduler, or external-callback
 * edge whose target exists in source.
 */

export type CapabilityReachabilityKind =
  | "ui"
  | "scheduler"
  | "external-callback"
  | "library";

export type CapabilityManifestEntry = Readonly<{
  id: string;
  kind: CapabilityReachabilityKind;
  /** Source path of the capability (route handler, library, or cron). */
  target: string;
  /** Source path of the inbound edge that reaches the target. */
  inbound: string;
  /** Short description of why the edge is valid. */
  via: string;
}>;

/**
 * Completion capabilities introduced or extended by the platform-completion
 * specification. Paths are repo-relative from the project root.
 */
export const CAPABILITY_REACHABILITY_MANIFEST = [
  {
    id: "analytics.proposals",
    kind: "ui",
    target: "src/app/api/analytics/proposals/route.ts",
    inbound: "src/components/dashboard/analytics-dashboard.tsx",
    via: "AnalyticsDashboard fetches GET /api/analytics/proposals",
  },
  {
    id: "clauses.list",
    kind: "ui",
    target: "src/app/api/clauses/route.ts",
    inbound: "src/components/dashboard/clause-browser.tsx",
    via: "ClauseBrowser lists and creates clauses",
  },
  {
    id: "clauses.select",
    kind: "ui",
    target: "src/app/api/clauses/select/route.ts",
    inbound: "src/components/dashboard/clause-browser.tsx",
    via: "Clause selection inserts into contract draft",
  },
  {
    id: "templates.workspace",
    kind: "ui",
    target: "src/app/api/contracts/workspace-templates/route.ts",
    inbound: "src/components/dashboard/workspace-template-editor.tsx",
    via: "Workspace template editor CRUD",
  },
  {
    id: "templates.workspace.preview",
    kind: "ui",
    target: "src/app/api/contracts/workspace-templates/[id]/preview/route.ts",
    inbound: "src/components/dashboard/workspace-template-editor.tsx",
    via: "Workspace template preview",
  },
  {
    id: "contracts.drafts",
    kind: "ui",
    target: "src/app/api/contracts/drafts/route.ts",
    inbound: "src/components/dashboard/contract-template-catalog.tsx",
    via: "Contract catalog creates drafts",
  },
  {
    id: "contracts.revisions",
    kind: "ui",
    target: "src/app/api/contracts/instances/[id]/versions/route.ts",
    inbound: "src/components/dashboard/contract-revision-history.tsx",
    via: "Contract revision history UI",
  },
  {
    id: "billing.reconcile",
    kind: "ui",
    target: "src/app/api/admin/billing/reconcile/route.ts",
    inbound: "src/components/admin/billing-reconciliation.tsx",
    via: "Admin reconciliation panel",
  },
  {
    id: "billing.reconcile.cron",
    kind: "scheduler",
    target: "src/app/api/cron/billing-reconcile/route.ts",
    inbound: "vercel.json",
    via: "Vercel cron schedule",
  },
  {
    id: "notifications.dispatch",
    kind: "scheduler",
    target: "src/app/api/cron/notification-dispatch/route.ts",
    inbound: "vercel.json",
    via: "Vercel cron schedule",
  },
  {
    id: "notifications.inbox",
    kind: "ui",
    target: "src/app/api/notifications/route.ts",
    inbound: "src/components/dashboard/topbar.tsx",
    via: "Topbar notification inbox fetch",
  },
  {
    id: "marketplace",
    kind: "ui",
    target: "src/app/api/templates/marketplace/route.ts",
    inbound: "src/components/dashboard/template-marketplace.tsx",
    via: "Marketplace list/publish UI",
  },
  {
    id: "knowledge.queue",
    kind: "ui",
    target: "src/app/api/knowledge/pending-approval/route.ts",
    inbound: "src/components/dashboard/knowledge-approval-queue.tsx",
    via: "Knowledge approval queue",
  },
  {
    id: "proposals.versions",
    kind: "ui",
    target: "src/app/api/proposals/[id]/versions/route.ts",
    inbound: "src/components/dashboard/version-history.tsx",
    via: "Proposal version history",
  },
  {
    id: "documents.versions",
    kind: "ui",
    target: "src/app/api/documents/[id]/versions/route.ts",
    inbound: "src/components/dashboard/version-history.tsx",
    via: "Document version history",
  },
  {
    id: "auth.return-to",
    kind: "ui",
    target: "src/app/api/auth/return-to/route.ts",
    inbound: "src/app/login/page.tsx",
    via: "Post-login deep-link restore",
  },
  {
    id: "recurring.webhook",
    kind: "external-callback",
    target: "src/app/api/billing/webhook/route.ts",
    inbound: "src/lib/recurring-billing.ts",
    via: "MyFatoorah provider callback",
  },
  {
    id: "xlsx.export",
    kind: "ui",
    target: "src/lib/proposal-workbook-xlsx.ts",
    inbound: "src/app/api/proposals/[id]/download/route.ts",
    via: "Proposal download format=xlsx",
  },
  {
    id: "locale.preference",
    kind: "library",
    target: "src/lib/store.ts",
    inbound: "src/app/layout.tsx",
    via: "Server-first lang/dir from locale cookie",
  },
  {
    id: "capability.manifest",
    kind: "library",
    target: "src/lib/capability-reachability-manifest.ts",
    inbound: "src/lib/production-integrity-scanner.ts",
    via: "Integrity scanner validates manifest edges",
  },
  {
    id: "ai.proposal-optimize",
    kind: "ui",
    target: "src/app/api/ai/proposal-optimize/route.ts",
    inbound: "src/components/dashboard/proposal-editor.tsx",
    via: "ProposalOptimizeAction posts to /api/ai/proposal-optimize",
  },
  {
    id: "ai.compliance-analyze",
    kind: "ui",
    target: "src/app/api/ai/compliance-analyze/route.ts",
    inbound: "src/components/dashboard/compliance-monitor.tsx",
    via: "ComplianceAnalyzeAction posts to /api/ai/compliance-analyze",
  },
  {
    id: "ai.contract-draft",
    kind: "ui",
    target: "src/app/api/ai/contract-draft/route.ts",
    inbound: "src/components/dashboard/contract-template-catalog.tsx",
    via: "ContractAiDraftAction posts to /api/ai/contract-draft",
  },
  {
    id: "ai.vendor-match",
    kind: "ui",
    target: "src/app/api/ai/vendor-match/route.ts",
    inbound: "src/components/dashboard/agent-workflow.tsx",
    via: "VendorMatchAction posts to /api/ai/vendor-match",
  },
] as const satisfies readonly CapabilityManifestEntry[];

export type CapabilityManifestId =
  (typeof CAPABILITY_REACHABILITY_MANIFEST)[number]["id"];
