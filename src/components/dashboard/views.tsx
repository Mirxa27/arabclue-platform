"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, type ComponentType } from "react";
import { useLocale, useUI, type DashboardView } from "@/lib/store";
import { tr } from "@/lib/i18n";
import { PageHeader, PageSection } from "@/components/patterns";
import { StatCards } from "./stat-cards";
import { FileIngestion } from "./file-ingestion";
import { ComplianceMonitor } from "./compliance-monitor";
import { AgentWorkflow } from "./agent-workflow";
import { DocumentMatrix } from "./document-matrix";
import { VersionHistory } from "./version-history";
import { BrandSetup } from "./brand-setup";
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
  brand: BrandView,
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
        <div className="xl:col-span-2">
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

function BrandView() {
  const { locale } = useLocale();
  return (
    <PageSection>
      <PageHeader
        title={tr("nav_brand", locale)}
        subtitle={
          locale === "ar"
            ? "إعداد هوية الشركة والمشاريع السابقة"
            : "Company identity & past project corpus"
        }
        locale={locale}
      />
      <BrandSetup />
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
