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
  /**
   * A literal that must appear in `inbound` — the fetch path, import specifier,
   * or component name through which the edge is actually made.
   *
   * `via` is prose and a reader can be convinced by it; this is the part the
   * validator can check. Without it the guard only confirmed that two files
   * exist, which is how two capabilities came to name an inbound file that
   * never referenced them and still pass.
   */
  evidence: string;
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
    evidence: "/api/analytics/proposals",
  },
  {
    id: "clauses.list",
    kind: "ui",
    target: "src/app/api/clauses/route.ts",
    inbound: "src/components/dashboard/clause-browser.tsx",
    via: "ClauseBrowser lists and creates clauses",
    evidence: "/api/clauses",
  },
  {
    id: "clauses.select",
    kind: "ui",
    target: "src/app/api/clauses/select/route.ts",
    inbound: "src/components/dashboard/clause-browser.tsx",
    via: "Clause selection inserts into contract draft",
    evidence: "/api/clauses/select",
  },
  {
    id: "templates.workspace",
    kind: "ui",
    target: "src/app/api/contracts/workspace-templates/route.ts",
    inbound: "src/components/dashboard/workspace-template-editor.tsx",
    via: "Workspace template editor CRUD",
    evidence: "/api/contracts/workspace-templates",
  },
  {
    id: "contracts.drafts",
    kind: "ui",
    target: "src/app/api/contracts/drafts/route.ts",
    inbound: "src/components/dashboard/contract-template-catalog.tsx",
    via: "Contract catalog creates drafts",
    evidence: "/api/contracts/drafts",
  },
  {
    id: "contracts.revisions",
    kind: "ui",
    target: "src/app/api/contracts/instances/[id]/versions/route.ts",
    inbound: "src/components/dashboard/contract-revision-history.tsx",
    via: "Contract revision history UI",
    evidence: "/api/contracts/instances/",
  },
  {
    id: "billing.reconcile",
    kind: "ui",
    target: "src/app/api/admin/billing/reconcile/route.ts",
    inbound: "src/components/admin/billing-reconciliation.tsx",
    via: "Admin reconciliation panel",
    evidence: "/api/admin/billing/reconcile",
  },
  {
    id: "billing.reconcile.cron",
    kind: "scheduler",
    target: "src/app/api/cron/billing-reconcile/route.ts",
    inbound: "vercel.json",
    via: "Vercel cron schedule",
    evidence: "/api/cron/billing-reconcile",
  },
  {
    id: "notifications.dispatch",
    kind: "scheduler",
    target: "src/app/api/cron/notification-dispatch/route.ts",
    inbound: "vercel.json",
    via: "Vercel cron schedule",
    evidence: "/api/cron/notification-dispatch",
  },
  {
    id: "notifications.inbox",
    kind: "ui",
    target: "src/app/api/notifications/route.ts",
    inbound: "src/components/dashboard/topbar.tsx",
    via: "Topbar notification inbox fetch",
    evidence: "/api/notifications",
  },
  {
    id: "marketplace",
    kind: "ui",
    target: "src/app/api/templates/marketplace/route.ts",
    inbound: "src/components/dashboard/template-marketplace.tsx",
    via: "Marketplace list/publish UI",
    evidence: "/api/templates/marketplace",
  },
  {
    id: "knowledge.queue",
    kind: "ui",
    target: "src/app/api/knowledge/pending-approval/route.ts",
    inbound: "src/components/dashboard/knowledge-approval-queue.tsx",
    via: "Knowledge approval queue",
    evidence: "/api/knowledge/pending-approval",
  },
  {
    id: "proposals.versions",
    kind: "ui",
    target: "src/app/api/proposals/[id]/versions/route.ts",
    inbound: "src/components/dashboard/version-history.tsx",
    via: "Proposal version history",
    evidence: "api/proposals/",
  },
  {
    id: "documents.versions",
    kind: "ui",
    target: "src/app/api/documents/[id]/versions/route.ts",
    inbound: "src/components/dashboard/version-history.tsx",
    via: "Document version history",
    evidence: "api/documents/",
  },
  {
    id: "auth.return-to",
    kind: "ui",
    target: "src/app/api/auth/return-to/route.ts",
    inbound: "src/app/login/page.tsx",
    via: "Post-login deep-link restore",
    evidence: "/api/auth/return-to",
  },
  {
    id: "recurring.webhook",
    kind: "external-callback",
    target: "src/app/api/billing/webhook/route.ts",
    // The caller is MyFatoorah, so the in-source edge is wherever we hand them
    // the URL. This used to name recurring-billing.ts, which has the arrow the
    // wrong way round — the webhook route imports that library, not vice versa,
    // and the library only mentions webhooks in comments.
    inbound: "src/app/api/billing/checkout/route.ts",
    via: "Checkout registers this URL with MyFatoorah as the payment webhook",
    evidence: "/api/billing/webhook",
  },
  {
    id: "xlsx.export",
    kind: "ui",
    target: "src/lib/proposal-workbook-xlsx.ts",
    // Reached from the download route two hops out, via the layout engine that
    // owns every export channel; the route itself never names the workbook.
    inbound: "src/lib/proposal-layout-export.ts",
    via: "Proposal download format=xlsx renders through the layout engine",
    evidence: "./proposal-workbook-xlsx",
  },
  {
    id: "locale.preference",
    kind: "library",
    target: "src/lib/store.ts",
    inbound: "src/app/layout.tsx",
    via: "Server-first lang/dir from locale cookie",
    evidence: "@/lib/store",
  },
  {
    id: "capability.manifest",
    kind: "library",
    target: "src/lib/capability-reachability-manifest.ts",
    inbound: "src/lib/production-integrity-scanner.ts",
    via: "Integrity scanner validates manifest edges",
    evidence: "CAPABILITY_REACHABILITY_MANIFEST",
  },
  {
    id: "ai.proposal-optimize",
    kind: "ui",
    target: "src/app/api/ai/proposal-optimize/route.ts",
    inbound: "src/components/dashboard/proposal-editor.tsx",
    via: "ProposalOptimizeAction posts to /api/ai/proposal-optimize",
    evidence: "ProposalOptimizeAction",
  },
  {
    id: "ai.compliance-analyze",
    kind: "ui",
    target: "src/app/api/ai/compliance-analyze/route.ts",
    inbound: "src/components/dashboard/compliance-monitor.tsx",
    via: "ComplianceAnalyzeAction posts to /api/ai/compliance-analyze",
    evidence: "ComplianceAnalyzeAction",
  },
  {
    id: "ai.contract-draft",
    kind: "ui",
    target: "src/app/api/ai/contract-draft/route.ts",
    inbound: "src/components/dashboard/contract-template-catalog.tsx",
    via: "ContractAiDraftAction posts to /api/ai/contract-draft",
    evidence: "ContractAiDraftAction",
  },
] as const satisfies readonly CapabilityManifestEntry[];

export type CapabilityManifestId =
  (typeof CAPABILITY_REACHABILITY_MANIFEST)[number]["id"];

/**
 * Capabilities that exist in source and no user can currently reach.
 *
 * Both of these sat in the manifest above claiming an inbound edge that was
 * never there. Recording them here instead of deleting them keeps the fact
 * visible: shipped code with no way in is either unfinished product or dead
 * weight, and which one it is is a product call, not a scanner's.
 *
 * `wouldBeReachableVia` names the files where an edge would most plausibly be
 * added. The test asserts the evidence is still absent from all of them, so if
 * someone wires one up, this list fails and the entry moves to the manifest.
 */
export type UnreachableCapability = Readonly<{
  id: string;
  target: string;
  /** The literal that would appear once an edge exists. */
  evidence: string;
  wouldBeReachableVia: readonly string[];
  reason: string;
}>;

export const UNREACHABLE_CAPABILITIES = [
  {
    id: "ai.vendor-match",
    target: "src/app/api/ai/vendor-match/route.ts",
    evidence: "VendorMatchAction",
    wouldBeReachableVia: [
      "src/components/dashboard/agent-workflow.tsx",
      "src/components/dashboard/views.tsx",
    ],
    reason:
      "VendorMatchAction is defined in ai-assist-actions.tsx and rendered nowhere. " +
      "Mounting it needs vendor data the schema has no model for, so the whole " +
      "vertical — engine, route, action — is reachable only from its own tests.",
  },
  {
    id: "templates.workspace.preview",
    target: "src/app/api/contracts/workspace-templates/[id]/preview/route.ts",
    evidence: "/preview",
    wouldBeReachableVia: ["src/components/dashboard/workspace-template-editor.tsx"],
    reason:
      "The editor calls list, versions, create, update and delete but never preview. " +
      "The catalog's preview button hits contracts/templates/[key]/preview, which is " +
      "a different route — the resemblance is what hid this.",
  },
] as const satisfies readonly UnreachableCapability[];
