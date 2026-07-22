"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState, type ComponentType } from "react";
import { useLocale, useUI, type DashboardView } from "@/lib/store";
import { tr } from "@/lib/i18n";
import { PageHeader, PageSection } from "@/components/patterns";
import { StatCards } from "./stat-cards";
import { FileIngestion } from "./file-ingestion";
import { ComplianceMonitor } from "./compliance-monitor";
import { AgentWorkflow } from "./agent-workflow";
import { DocumentMatrix } from "./document-matrix";
import { VersionHistory } from "./version-history";
import { AccountOnboarding } from "./account-onboarding";
import { RequirementsMatrix } from "./requirements-matrix";
import { ReviewsQueue } from "./reviews-queue";
import { SettingsPanel } from "./settings-panel";
import { ProposalsList } from "./proposals-list";
import { ProjectsList } from "./projects-list";
import { ChartsPanel } from "./charts-panel";
import { TenderTypeSelector } from "./tender-type-selector";
import { AdminOverview } from "@/components/admin/overview";
import { AdminAIProviders } from "@/components/admin/ai-providers";
import { AdminEnvSettings } from "@/components/admin/env-settings";
import { AdminBilling } from "@/components/admin/billing";
import { AdminSecurity } from "@/components/admin/security";
import { AdminAudit } from "@/components/admin/audit";
import { BillingPanel } from "@/components/dashboard/billing-panel";

/**
 * Thin view router (App Router SPA equivalent of a PageController).
 * Specialized panels live in their own modules — do not embed business logic here.
 */
const VIEW_REGISTRY: Record<DashboardView, ComponentType> = {
  overview: OverviewView,
  projects: ProjectsView,
  documents: DocumentsView,
  proposals: ProposalsView,
  compliance: ComplianceView,
  agents: AgentsView,
  history: HistoryView,
  brand: AccountView,
  account: AccountView,
  reviews: ReviewsView,
  settings: SettingsView,
  billing: BillingView,
  admin_overview: AdminOverviewView,
  admin_ai: AdminAIView,
  admin_env: AdminEnvView,
  admin_billing: AdminBillingView,
  admin_security: AdminSecurityView,
  admin_audit: AdminAuditView,
};

export function DashboardViews() {
  const { view, setView } = useUI();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("view") as DashboardView | null;
    if (q && q in VIEW_REGISTRY) setView(q);
  }, [setView]);

  const Content = VIEW_REGISTRY[view] ?? OverviewView;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={view}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
      >
        <Content />
      </motion.div>
    </AnimatePresence>
  );
}

function OverviewView() {
  const { locale } = useLocale();
  return (
    <PageSection>
      <PageHeader
        title={tr("nav_dashboard", locale)}
        subtitle={
          locale === "ar"
            ? "نظرة شاملة على منصة العطاءات"
            : "Comprehensive tender platform overview"
        }
        locale={locale}
      />
      <TenderTypeSelector />
      <OnboardingBanner />
      <StatCards />
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 space-y-4">
          <FileIngestion />
          <ChartsPanel />
          <DocumentMatrix />
        </div>
        <div className="space-y-4">
          <AgentWorkflow />
          <ComplianceMonitor />
          <VersionHistory />
        </div>
      </div>
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ProjectsList />
        <div className="space-y-4">
          <FileIngestion />
          <AgentWorkflow />
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ProposalsList />
        <div className="space-y-4">
          <AgentWorkflow />
          <ComplianceMonitor />
        </div>
      </div>
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
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 space-y-4">
          <RequirementsMatrix />
          <ComplianceMonitor />
        </div>
        <div className="space-y-4">
          <AgentWorkflow />
          <VersionHistory />
        </div>
      </div>
    </PageSection>
  );
}

function AgentsView() {
  const { locale } = useLocale();
  return (
    <PageSection>
      <PageHeader
        title={tr("nav_agents", locale)}
        subtitle={
          locale === "ar"
            ? "سير عمل الوكلاء متعددين"
            : "Multi-agent workflow orchestration"
        }
        locale={locale}
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AgentWorkflow />
        <div className="space-y-4">
          <ComplianceMonitor />
          <ProposalsList />
        </div>
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

function SettingsView() {
  const { locale } = useLocale();
  return (
    <PageSection>
      <PageHeader
        title={tr("nav_settings", locale)}
        subtitle={
          locale === "ar" ? "الملف الشخصي والأمان" : "Profile & security"
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
    fetch("/api/onboarding")
      .then((r) => r.json())
      .then((d) => {
        setReady(d.readyForProposals === true);
        setMissing(d.missing ?? []);
      })
      .catch(() => setReady(true));
  }, []);

  if (ready !== false) return null;

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm flex flex-wrap items-center justify-between gap-3">
      <span>
        {locale === "ar"
          ? `أكمل إعداد الحساب قبل توليد العروض. ناقص: ${missing.join(", ")}`
          : `Complete account setup before generating proposals. Missing: ${missing.join(", ")}`}
      </span>
      <button
        type="button"
        className="underline font-medium"
        onClick={() => setView("account")}
      >
        {locale === "ar" ? "فتح الإعداد" : "Open setup"}
      </button>
    </div>
  );
}
