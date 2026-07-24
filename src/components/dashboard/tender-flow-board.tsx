"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useUI } from "@/lib/store";
import { apiJson } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { TenderSetupWizard } from "./tender-setup-wizard";
import {
  EtimadWorkflowCockpit,
  useProjectEtimadMeta,
} from "./etimad-workflow-cockpit";
import {
  Bot,
  CheckCircle2,
  Circle,
  FileUp,
  FolderKanban,
  Scale,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

type ProjectRow = {
  id: string;
  title: string;
  status: string;
  _count?: { documents: number; agentRuns: number; proposals: number };
};

/**
 * Linear-style guided tender flow for the overview — replaces the dumped stack.
 */
export function TenderFlowBoard() {
  const { locale } = useLocale();
  const { activeProjectId, setView, setActiveProjectId } = useUI();
  const ar = locale === "ar";
  const [wizardOpen, setWizardOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ["projects"],
    queryFn: () => apiJson<{ projects: ProjectRow[] }>("/api/projects"),
  });

  const projects = data?.projects ?? [];
  const active =
    projects.find((p) => p.id === activeProjectId) ?? projects[0] ?? null;
  const projectId = active?.id ?? null;
  const { data: projectMeta } = useProjectEtimadMeta(projectId);
  const steps = useMemo(() => {
    const docs = active?._count?.documents ?? 0;
    const runs = active?._count?.agentRuns ?? 0;
    const proposals = active?._count?.proposals ?? 0;
    return [
      {
        id: "create",
        title: ar ? "إعداد المناقصة" : "Set up tender",
        body: ar
          ? "الهوية · النوع · الأهداف · الميزانية"
          : "Identity · type · targets · budget",
        done: projects.length > 0,
        action: () => setWizardOpen(true),
        actionLabel: ar ? "مناقصة جديدة" : "New tender",
        icon: FolderKanban,
      },
      {
        id: "upload",
        title: ar ? "رفع كراسة الشروط" : "Upload RFP pack",
        body: ar
          ? "PDF / DOCX / ZIP للمستندات"
          : "PDF / DOCX / ZIP into Documents",
        done: docs > 0,
        action: () => {
          if (active) setActiveProjectId(active.id);
          setView("documents");
        },
        actionLabel: ar ? "المستندات" : "Documents",
        icon: FileUp,
      },
      {
        id: "agents",
        title: ar ? "تشغيل الوكلاء" : "Run agents",
        body: ar
          ? "امتثال · فني · مالي · عرض · عقد"
          : "Compliance · tech · finance · proposal · contract",
        done: runs > 0,
        action: () => {
          if (active) setActiveProjectId(active.id);
          setView("agents");
        },
        actionLabel: ar ? "الوكلاء" : "Agents",
        icon: Bot,
      },
      {
        id: "export",
        title: ar ? "معاينة وتصدير PDF" : "Preview & export PDF",
        body: ar
          ? "عرض · عقد · حزمة ZIP"
          : "Proposal · contract · ZIP package",
        done: proposals > 0,
        action: () => {
          if (active) setActiveProjectId(active.id);
          setView(proposals > 0 ? "proposals" : "contracts");
        },
        actionLabel: ar ? "المخرجات" : "Outputs",
        icon: Scale,
      },
    ];
  }, [active, ar, projects.length, setActiveProjectId, setView]);

  const next = steps.find((s) => !s.done) ?? steps[steps.length - 1];

  return (
    <>
      <Card className="overflow-hidden border-border/60">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/50 bg-muted/15 px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-teal-600" />
              <h2 className="text-sm font-semibold">
                {ar ? "مسار المناقصة" : "Tender flow"}
              </h2>
            </div>
            <p className="text-xs text-muted-foreground mt-1 max-w-xl">
              {active
                ? ar
                  ? `المشروع النشط: ${active.title}`
                  : `Active project: ${active.title}`
                : ar
                  ? "ابدأ بإعداد مناقصة — ثم ارفع الكراسة وشغّل الوكلاء وصدّر PDF."
                  : "Start by setting up a tender — then upload the RFP, run agents, and export PDF."}
            </p>
          </div>
          <Button size="sm" onClick={next.action} className="gap-1.5">
            {next.actionLabel}
          </Button>
        </div>

        <ol className="grid gap-0 sm:grid-cols-2 xl:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border/40">
          {steps.map((step, i) => {
            const Icon = step.icon;
            const isNext = step.id === next.id;
            return (
              <li key={step.id} className="p-4">
                <button
                  type="button"
                  onClick={step.action}
                  className={cn(
                    "w-full text-start rounded-xl border p-3 transition-colors",
                    step.done && "border-emerald-500/30 bg-emerald-500/5",
                    isNext && !step.done && "border-teal-500/40 bg-teal-500/5",
                    !step.done && !isNext && "border-border/60 hover:bg-muted/30"
                  )}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {ar ? "خطوة" : "Step"} {i + 1}
                    </span>
                    {step.done ? (
                      <CheckCircle2 className="size-4 text-emerald-600" />
                    ) : (
                      <Circle
                        className={cn(
                          "size-4",
                          isNext ? "text-teal-600" : "text-muted-foreground"
                        )}
                      />
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Icon className="size-4 text-muted-foreground" />
                    <p className="text-sm font-semibold">{step.title}</p>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                    {step.body}
                  </p>
                  {isNext && !step.done ? (
                    <Badge className="mt-2 text-[10px]" variant="secondary">
                      {ar ? "التالي" : "Next"}
                    </Badge>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ol>
      </Card>

      {projectId ? (
        <EtimadWorkflowCockpit
          projectId={projectId}
          locale={locale}
          deadline={projectMeta?.project?.submissionDeadline}
          etimadRef={projectMeta?.project?.etimadRef}
        />
      ) : null}

      <TenderSetupWizard open={wizardOpen} onOpenChange={setWizardOpen} />
    </>
  );
}
