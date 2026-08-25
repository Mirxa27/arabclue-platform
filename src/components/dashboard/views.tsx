"use client";

import { motion, AnimatePresence } from "framer-motion";
import dynamic from "next/dynamic";
import { useEffect, useState, startTransition, type ComponentType } from "react";
import { useSession } from "next-auth/react";
import {
  useLocale,
  useUI,
  ADMIN_VIEWS,
  type DashboardView,
  type RouteNoticeCode,
} from "@/lib/store";
import { useViewRouter } from "@/hooks/use-view-router";
import { ViewNavigationProvider } from "@/components/dashboard/view-navigation";
import { getCompletionErrorContract, tr } from "@/lib/i18n";
import { PageHeader, PageSection } from "@/components/patterns";
import { StatCards } from "./stat-cards";
import { FileIngestion } from "./file-ingestion";
import { ComplianceMonitor } from "./compliance-monitor";
import { AgentWorkflow } from "./agent-workflow";
import { DocumentMatrix } from "./document-matrix";
import { VersionHistory } from "./version-history";
import { RequirementsMatrix } from "./requirements-matrix";
import { ReviewsQueue } from "./reviews-queue";
import { ProposalsList } from "./proposals-list";
import { ContractsPanel } from "./contracts-panel";
import { ProjectsList } from "./projects-list";
import { TenderFlowBoard } from "./tender-flow-board";
import { Loader2, ShieldCheck, FileText } from "lucide-react";
import { ONBOARDING_STEPS } from "@/lib/onboarding-steps";
import { Button } from "@/components/ui/button";
import { useEnsureActiveProject } from "@/hooks/use-ensure-active-project";
import { shouldShowOverviewWorkPanels } from "@/lib/overview-next-step";

function PanelLoading() {
  return (
    <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
      <Loader2 className="size-4 animate-spin" />
    </div>
  );
}

const AccountOnboarding = dynamic(
  () =>
    import("./account-onboarding").then((m) => ({ default: m.AccountOnboarding })),
  { loading: PanelLoading }
);
const SettingsPanel = dynamic(
  () => import("./settings-panel").then((m) => ({ default: m.SettingsPanel })),
  { loading: PanelLoading }
);
const BillingPanel = dynamic(
  () =>
    import("./billing-panel").then((m) => ({ default: m.BillingPanel })),
  { loading: PanelLoading }
);
const AdminOverview = dynamic(
  () =>
    import("@/components/admin/overview").then((m) => ({
      default: m.AdminOverview,
    })),
  { loading: PanelLoading }
);
const AdminAIProviders = dynamic(
  () =>
    import("@/components/admin/ai-providers").then((m) => ({
      default: m.AdminAIProviders,
    })),
  { loading: PanelLoading }
);
const AdminEnvSettings = dynamic(
  () =>
    import("@/components/admin/env-settings").then((m) => ({
      default: m.AdminEnvSettings,
    })),
  { loading: PanelLoading }
);
const AdminBilling = dynamic(
  () =>
    import("@/components/admin/billing").then((m) => ({
      default: m.AdminBilling,
    })),
  { loading: PanelLoading }
);
const AdminMyFatoorah = dynamic(
  () =>
    import("@/components/admin/myfatoorah").then((m) => ({
      default: m.AdminMyFatoorah,
    })),
  { loading: PanelLoading }
);
const AdminSecurity = dynamic(
  () =>
    import("@/components/admin/security").then((m) => ({
      default: m.AdminSecurity,
    })),
  { loading: PanelLoading }
);
const AdminAudit = dynamic(
  () =>
    import("@/components/admin/audit").then((m) => ({ default: m.AdminAudit })),
  { loading: PanelLoading }
);
const PlatformAgentConsole = dynamic(
  () =>
    import("./platform-agent-console").then((m) => ({
      default: m.PlatformAgentConsole,
    })),
  { loading: PanelLoading }
);
const BusinessProfileView = dynamic(
  () =>
    import("./business-profile-view").then((m) => ({
      default: m.BusinessProfileView,
    })),
  { loading: PanelLoading }
);
// Phase 4: Enhanced Proposal System
const ProposalBuilderView = dynamic(
  () =>
    import("./proposal-builder").then((m) => ({ default: m.ProposalBuilder })),
  { loading: PanelLoading }
);
const MarketplaceView = dynamic(
  () =>
    import("./template-marketplace").then((m) => ({ default: m.TemplateMarketplace })),
  { loading: PanelLoading }
);
const AnalyticsView = dynamic(
  () =>
    import("./analytics-dashboard").then((m) => ({ default: m.AnalyticsDashboard })),
  { loading: PanelLoading }
);
const ClauseLibraryView = dynamic(
  () =>
    import("./clause-browser").then((m) => ({ default: m.ClauseBrowser })),
  { loading: PanelLoading }
);
const TemplateEditorView = dynamic(
  () =>
    import("./workspace-template-editor").then((m) => ({
      default: m.WorkspaceTemplateEditor,
    })),
  { loading: PanelLoading }
);
const KnowledgeApprovalQueueView = dynamic(
  () =>
    import("./knowledge-approval-queue").then((m) => ({ default: m.KnowledgeApprovalQueue })),
  { loading: PanelLoading }
);
const SetupWizardView = dynamic(
  () =>
    import("./onboarding-wizard").then((m) => ({ default: m.OnboardingWizard })),
  { loading: PanelLoading }
);

/**
 * Thin view router (App Router SPA equivalent of a PageController).
 * Specialized panels live in their own modules — do not embed business logic here.
 */
const VIEW_REGISTRY: Record<DashboardView, ComponentType> = {
  overview: OverviewView,
  copilot: CopilotView,
  projects: ProjectsView,
  documents: DocumentsView,
  proposals: ProposalsView,
  contracts: ContractsView,
  compliance: ComplianceView,
  "clause-library": ClauseLibraryRouteView,
  "template-editor": TemplateEditorRouteView,
  agents: AgentsView,
  history: HistoryView,
  brand: AccountView,
  account: AccountView,
  "business-profile": BusinessProfileView,
  reviews: ReviewsView,
  "knowledge-approval": KnowledgeApprovalView,
  settings: SettingsView,
  billing: BillingView,
  // Phase 4: Enhanced Proposal System
  "proposal-builder": ProposalBuilderView,
  marketplace: MarketplaceView,
  analytics: AnalyticsView,
  setup: SetupWizardView,
  admin_overview: AdminOverviewView,
  admin_ai: AdminAIView,
  admin_env: AdminEnvView,
  admin_billing: AdminBillingView,
  admin_myfatoorah: AdminMyFatoorahView,
  admin_security: AdminSecurityView,
  admin_audit: AdminAuditView,
};

export function DashboardViews({
  initialView = "overview",
  initialProjectId = null,
  canonicalPath = "/app",
  initialNotice = null,
  projectContextMissing = false,
}: {
  initialView?: DashboardView;
  initialProjectId?: string | null;
  canonicalPath?: string;
  initialNotice?: RouteNoticeCode | null;
  projectContextMissing?: boolean;
}) {
  const { view, routeNotice } = useUI();
  const { data: session } = useSession();
  const isAdmin =
    session?.user?.role === "SUPER_ADMIN" || session?.user?.role === "ADMIN";

  // The URL is authoritative; this reconciles it with the view state.
  const { dismissNotice, navigateToView } = useViewRouter({
    initialView,
    initialProjectId,
    canonicalPath,
    initialNotice,
    projectContextMissing,
  });

  // An administrator view is never mounted for a non-administrator session, so
  // no administrator data request is issued (Requirement 14.5).
  const safeView = ADMIN_VIEWS.has(view) && !isAdmin ? "overview" : view;
  const Content = VIEW_REGISTRY[safeView] ?? OverviewView;

  return (
    <ViewNavigationProvider navigateToView={navigateToView}>
      <RouteNotice code={routeNotice} onDismiss={dismissNotice} />
      <AnimatePresence mode="wait">
        <motion.div
          key={safeView}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
        >
          <Content />
        </motion.div>
      </AnimatePresence>
    </ViewNavigationProvider>
  );
}

/**
 * Bilingual notice for a URL the router could not honour
 * (Requirements 14.4, 14.5, 14.8, 14.9). Every string comes from the
 * Localization_Registry and the Arabic presentation is right-to-left.
 */
function RouteNotice({
  code,
  onDismiss,
}: {
  code: RouteNoticeCode | null;
  onDismiss: () => void;
}) {
  const { locale, dir } = useLocale();
  if (!code) return null;

  const contract = getCompletionErrorContract(code);

  return (
    <div
      role="status"
      aria-live="polite"
      dir={dir}
      lang={locale}
      className="mb-4 flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
    >
      <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p className="flex-1 text-start">{contract.message[locale]}</p>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onDismiss}
        className="h-auto shrink-0 px-2 py-1 text-xs"
      >
        {tr("dismiss", locale)}
      </Button>
    </div>
  );
}

function OverviewView() {
  const { locale } = useLocale();
  const { projects, isSuccess } = useEnsureActiveProject();
  const showWork = isSuccess && shouldShowOverviewWorkPanels(projects.length);
  return (
    <PageSection>
      <PageHeader
        title={tr("nav_dashboard", locale)}
        subtitle={tr("overview_subtitle", locale)}
        locale={locale}
      />
      <OnboardingBanner />
      <div className="space-y-4">
        <TenderFlowBoard />
      </div>
      {showWork ? (
        <>
          <StatCards />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <FileIngestion />
            <AgentWorkflow />
          </div>
        </>
      ) : null}
    </PageSection>
  );
}

function CopilotView() {
  return (
    <PageSection>
      <PlatformAgentConsole />
    </PageSection>
  );
}

function ProjectsView() {
  const { locale } = useLocale();
  return (
    <PageSection>
      <PageHeader
        title={tr("nav_projects", locale)}
        subtitle={
          locale === "ar" ? "إدارة مشاريع المناقصات" : "Manage tender projects"
        }
        locale={locale}
      />
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        <div className="xl:col-span-3">
          <ProjectsList />
        </div>
        <div className="xl:col-span-2">
          <FileIngestion />
        </div>
      </div>
    </PageSection>
  );
}

function DocumentsView() {
  const { locale } = useLocale();
  return (
    <PageSection>
      <PageHeader
        title={tr("nav_documents", locale)}
        subtitle={
          locale === "ar"
            ? "مصفوفة المستندات وإدارة الإصدارات"
            : "Document matrix & versioning"
        }
        locale={locale}
      />
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 space-y-4">
          <FileIngestion />
          <DocumentMatrix />
          <RequirementsMatrix />
        </div>
        <div className="space-y-4">
          <VersionHistory />
          <ComplianceMonitor />
        </div>
      </div>
    </PageSection>
  );
}

function ProposalsView() {
  const { locale } = useLocale();
  return (
    <PageSection>
      <PageHeader
        title={tr("nav_proposals", locale)}
        subtitle={
          locale === "ar"
            ? "العطاءات الفنية والمالية المُنشأة"
            : "Generated technical & financial proposals"
        }
        locale={locale}
      />
      <ProposalsList />
    </PageSection>
  );
}

function ContractsView() {
  const { locale } = useLocale();
  return (
    <PageSection>
      <PageHeader
        title={tr("nav_contracts", locale)}
        subtitle={
          locale === "ar"
            ? "مسودات عقود ثنائية اللغة بعد بحث الأطر السعودية — للمراجعة القانونية"
            : "Bilingual contract drafts after Saudi framework research — for legal review"
        }
        locale={locale}
      />
      <ContractsPanel />
    </PageSection>
  );
}

function ClauseLibraryRouteView() {
  const { locale } = useLocale();
  return (
    <PageSection>
      <PageHeader
        title={tr("clause_library_title", locale)}
        subtitle={tr("clause_library_subtitle", locale)}
        locale={locale}
      />
      <ClauseLibraryView />
    </PageSection>
  );
}

function TemplateEditorRouteView() {
  const { locale } = useLocale();
  return (
    <PageSection>
      <PageHeader
        title={tr("template_editor_title", locale)}
        subtitle={
          locale === "ar"
            ? "إنشاء وتحديث وإحالة قوالب عقود مساحة العمل مع سجل إصدارات"
            : "Create, update, and retire workspace contract templates with version history"
        }
        locale={locale}
      />
      <TemplateEditorView />
    </PageSection>
  );
}

function ComplianceView() {
  const { locale } = useLocale();
  return (
    <PageSection>
      <PageHeader
        title={tr("nav_compliance", locale)}
        subtitle={
          locale === "ar"
            ? "مراقبة NCA وPDPL والبنية المؤسسية"
            : "NCA, PDPL & EA compliance monitoring"
        }
        locale={locale}
      />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <RequirementsMatrix />
        <ComplianceMonitor />
      </div>
    </PageSection>
  );
}

function AgentsView() {
  const { locale } = useLocale();
  const { setView } = useUI();
  const ar = locale === "ar";
  return (
    <PageSection>
      <PageHeader
        title={tr("nav_agents", locale)}
        subtitle={
          ar
            ? "خط أنابيب من 6 وكلاء — راقب التقدم الحي ثم افتح العطاء والامتثال"
            : "6-agent pipeline — watch live progress, then open proposals & compliance"
        }
        locale={locale}
      />
      <AgentWorkflow />
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => startTransition(() => setView("compliance"))}
        >
          <ShieldCheck className="size-3.5" />
          {ar ? "الامتثال" : "Compliance"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => startTransition(() => setView("proposals"))}
        >
          <FileText className="size-3.5" />
          {ar ? "العطاءات" : "Proposals"}
        </Button>
      </div>
    </PageSection>
  );
}

function HistoryView() {
  const { locale } = useLocale();
  return (
    <PageSection>
      <PageHeader
        title={tr("nav_history", locale)}
        subtitle={
          locale === "ar"
            ? "سجل إصدارات المستندات والعطاءات"
            : "Document & proposal version history"
        }
        locale={locale}
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <VersionHistory />
        <DocumentMatrix />
      </div>
    </PageSection>
  );
}

function AccountView() {
  const { locale } = useLocale();
  return (
    <PageSection>
      <PageHeader
        title={tr("nav_account", locale)}
        subtitle={
          locale === "ar"
            ? "قاعدة معرفة الحساب — 10 أقسام قبل توليد العروض"
            : "Account knowledge base — 10 sections before proposal generation"
        }
        locale={locale}
      />
      <AccountOnboarding />
    </PageSection>
  );
}

function ReviewsView() {
  const { locale } = useLocale();
  return (
    <PageSection>
      <PageHeader
        title={tr("nav_reviews", locale)}
        subtitle={
          locale === "ar"
            ? "اعتماد العروض الفنية قبل التصدير"
            : "Approve technical proposals before export"
        }
        locale={locale}
      />
      <ReviewsQueue />
    </PageSection>
  );
}

function KnowledgeApprovalView() {
  const { locale } = useLocale();
  return (
    <PageSection>
      <PageHeader
        title={tr("nav_knowledge_approval", locale)}
        subtitle={tr("knowledge_approval_subtitle", locale)}
        locale={locale}
      />
      <KnowledgeApprovalQueueView />
    </PageSection>
  );
}

function SettingsView() {
  const { locale } = useLocale();
  return (
    <PageSection>
      <PageHeader
        title={tr("nav_settings", locale)}
        subtitle={
          locale === "ar"
            ? "تحديث الاسم والبريد والصورة وكلمة المرور وMFA"
            : "Update name, email, avatar, password & MFA"
        }
        locale={locale}
      />
      <SettingsPanel />
    </PageSection>
  );
}

function BillingView() {
  const { locale } = useLocale();
  return (
    <PageSection>
      <PageHeader
        title={tr("nav_billing", locale)}
        subtitle={
          locale === "ar"
            ? "الباقات والدفع عبر مي فاتورة"
            : "Plans and MyFatoorah checkout"
        }
        locale={locale}
        badge="none"
      />
      <BillingPanel />
    </PageSection>
  );
}

function AdminOverviewView() {
  const { locale } = useLocale();
  return (
    <PageSection>
      <PageHeader
        badge="admin"
        title={tr("nav_admin", locale)}
        subtitle={
          locale === "ar" ? "نظرة عامة على النظام" : "System-wide overview"
        }
        locale={locale}
      />
      <AdminOverview />
    </PageSection>
  );
}

function AdminAIView() {
  const { locale } = useLocale();
  return (
    <PageSection>
      <PageHeader
        badge="admin"
        title={tr("admin_ai_providers", locale)}
        subtitle={
          locale === "ar"
            ? "تكوين نماذج اللغة والحواجز الأمنية"
            : "Configure LLM models & safety guardrails"
        }
        locale={locale}
      />
      <AdminAIProviders />
    </PageSection>
  );
}

function AdminEnvView() {
  const { locale } = useLocale();
  return (
    <PageSection>
      <PageHeader
        badge="admin"
        title={tr("admin_env", locale)}
        subtitle={
          locale === "ar"
            ? "إدارة مشفرة لمتغيرات البيئة"
            : "Encrypted environment variable management"
        }
        locale={locale}
      />
      <AdminEnvSettings />
    </PageSection>
  );
}

function AdminBillingView() {
  const { locale } = useLocale();
  return (
    <PageSection>
      <PageHeader
        badge="admin"
        title={tr("admin_billing", locale)}
        subtitle={
          locale === "ar" ? "الباقات والاستخدام والإيرادات" : "Plans, usage & revenue"
        }
        locale={locale}
      />
      <AdminBilling />
    </PageSection>
  );
}

function AdminMyFatoorahView() {
  const { locale } = useLocale();
  return (
    <PageSection>
      <PageHeader
        badge="admin"
        title={tr("admin_myfatoorah", locale)}
        subtitle={
          locale === "ar"
            ? "بوابة الدفع السعودية — أسرار مشفرة وWebhook V2"
            : "Saudi payment gateway — encrypted secrets & Webhook V2"
        }
        locale={locale}
      />
      <AdminMyFatoorah />
    </PageSection>
  );
}

function AdminSecurityView() {
  const { locale } = useLocale();
  return (
    <PageSection>
      <PageHeader
        badge="admin"
        title={tr("admin_security", locale)}
        subtitle={
          locale === "ar"
            ? "RBAC والمستخدمون والصلاحيات"
            : "RBAC, users & access control"
        }
        locale={locale}
      />
      <AdminSecurity />
    </PageSection>
  );
}

function AdminAuditView() {
  const { locale } = useLocale();
  return (
    <PageSection>
      <PageHeader
        badge="admin"
        title={tr("admin_audit", locale)}
        subtitle={
          locale === "ar"
            ? "سجل تدقيق غير قابل للتغيير"
            : "Immutable audit trail"
        }
        locale={locale}
      />
      <AdminAudit />
    </PageSection>
  );
}

function OnboardingBanner() {
  const { locale } = useLocale();
  const { setView } = useUI();
  const [ready, setReady] = useState<boolean | null>(null);
  const [missing, setMissing] = useState<string[]>([]);


  useEffect(() => {
    let cancelled = false;
    fetch("/api/onboarding")
      .then(async (r) => {
        if (!r.ok) throw new Error(`onboarding ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (cancelled) return;
        setReady(d.readyForProposals === true);
        setMissing(d.missing ?? []);
      })
      .catch(() => {
        if (cancelled) return;
        // Fail closed: treat unknown state as not ready so banner still prompts setup
        setReady(false);
        setMissing(["status_unavailable"]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (ready !== false) return null;

  const labels = missing.map((key) => {
    if (key === "status_unavailable") {
      return locale === "ar" ? "تعذر التحقق من الحالة" : "Could not verify setup status";
    }
    const step = ONBOARDING_STEPS.find((s) => s.key === key);
    if (!step) return key;
    return locale === "ar" ? step.labelAr : step.labelEn;
  });

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm flex flex-wrap items-center justify-between gap-3">
      <span>
        {locale === "ar"
          ? `أكمل إعداد الحساب قبل توليد العروض. مطلوب: ${labels.join(" · ")}`
          : `Complete account setup before generating proposals. Needed: ${labels.join(" · ")}`}
      </span>
      <button
        type="button"
        className="underline font-medium"
        onClick={() => startTransition(() => setView("setup"))}
      >
        {locale === "ar" ? "فتح الإعداد الموجّه" : "Open guided setup"}
      </button>
    </div>
  );
}
