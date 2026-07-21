"use client";

import { useLocale, useUI } from "@/lib/store";
import { tr } from "@/lib/i18n";
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
import { Sparkles } from "lucide-react";

export function DashboardViews() {
  const { view } = useUI();

  switch (view) {
    case "overview":
      return <OverviewView />;
    case "projects":
      return <ProjectsView />;
    case "documents":
      return <DocumentsView />;
    case "proposals":
      return <ProposalsView />;
    case "compliance":
      return <ComplianceView />;
    case "agents":
      return <AgentsView />;
    case "history":
      return <HistoryView />;
    case "brand":
      return <BrandView />;
    default:
      return <OverviewView />;
  }
}

function ViewHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <div>
        <h1 className="text-lg lg:text-xl font-bold tracking-tight">{title}</h1>
        <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
      </div>
      <div className="hidden sm:flex items-center gap-1.5 text-[10px] font-medium text-emerald-600 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
        <Sparkles className="size-2.5" />
        C1 Compliance
      </div>
    </div>
  );
}

function OverviewView() {
  const { locale } = useLocale();
  return (
    <div className="space-y-4">
      <ViewHeader
        title={tr("nav_dashboard", locale)}
        subtitle={locale === "ar" ? "نظرة شاملة على منصة العطاءات" : "Comprehensive tender platform overview"}
      />
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
    </div>
  );
}

function ProjectsView() {
  const { locale } = useLocale();
  return (
    <div className="space-y-4">
      <ViewHeader
        title={tr("nav_projects", locale)}
        subtitle={locale === "ar" ? "إدارة مشاريع المناقصات" : "Manage tender projects"}
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ProjectsList />
        <div className="space-y-4">
          <FileIngestion />
          <AgentWorkflow />
        </div>
      </div>
    </div>
  );
}

function DocumentsView() {
  const { locale } = useLocale();
  return (
    <div className="space-y-4">
      <ViewHeader
        title={tr("nav_documents", locale)}
        subtitle={locale === "ar" ? "مصفوفة المستندات وإدارة الإصدارات" : "Document matrix & versioning"}
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
    </div>
  );
}

function ProposalsView() {
  const { locale } = useLocale();
  return (
    <div className="space-y-4">
      <ViewHeader
        title={tr("nav_proposals", locale)}
        subtitle={locale === "ar" ? "العطاءات الفنية والمالية المُنشأة" : "Generated technical & financial proposals"}
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ProposalsList />
        <div className="space-y-4">
          <AgentWorkflow />
          <ComplianceMonitor />
        </div>
      </div>
    </div>
  );
}

function ComplianceView() {
  const { locale } = useLocale();
  return (
    <div className="space-y-4">
      <ViewHeader
        title={tr("nav_compliance", locale)}
        subtitle={locale === "ar" ? "مراقبة NCA وPDPL والبنية المؤسسية" : "NCA, PDPL & EA compliance monitoring"}
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
    </div>
  );
}

function AgentsView() {
  const { locale } = useLocale();
  return (
    <div className="space-y-4">
      <ViewHeader
        title={tr("nav_agents", locale)}
        subtitle={locale === "ar" ? "سير عمل الوكلاء متعددين" : "Multi-agent workflow orchestration"}
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AgentWorkflow />
        <div className="space-y-4">
          <ComplianceMonitor />
          <ProposalsList />
        </div>
      </div>
    </div>
  );
}

function HistoryView() {
  const { locale } = useLocale();
  return (
    <div className="space-y-4">
      <ViewHeader
        title={tr("nav_history", locale)}
        subtitle={locale === "ar" ? "سجل إصدارات المستندات والعطاءات" : "Document & proposal version history"}
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <VersionHistory />
        <DocumentMatrix />
      </div>
    </div>
  );
}

function BrandView() {
  const { locale } = useLocale();
  return (
    <div className="space-y-4">
      <ViewHeader
        title={tr("nav_brand", locale)}
        subtitle={locale === "ar" ? "إعداد هوية الشركة والمشاريع السابقة" : "Company identity & past project corpus"}
      />
      <BrandSetup />
    </div>
  );
}
