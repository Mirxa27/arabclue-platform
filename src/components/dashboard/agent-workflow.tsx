"use client";

import { apiErrorText } from "@/lib/api-failure-message";

import { startTransition } from "react";

import { useState, useEffect, useRef, useMemo } from "react";
import { useLocale, useUI } from "@/lib/store";
import { tr } from "@/lib/i18n";
import { runFailureCopyKey } from "@/lib/agents/run-failure";
import { LiveDraftPanel } from "./live-draft-panel";
import { RUN_STARTED_EVENT } from "@/lib/agents/autopilot";
import { motion, useReducedMotion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { UpgradeToastAction } from "@/components/ui/upgrade-toast-action";
import { isPlanLimitCode } from "@/lib/plan-limit-failure";
import {
  Bot,
  Play,
  Loader2,
  Clock,
  FileSearch,
  ShieldCheck,
  Network,
  Calculator,
  PenLine,
  Scale,
  Sparkles,
  Square,
  FolderKanban,
  AlertCircle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { RadialGauge } from "./radial-gauge";
import { ErrorState } from "@/components/patterns";
import { cn } from "@/lib/utils";
import { AGENTS } from "@/lib/constants";
import {
  durationBetween,
  formatElapsed,
  liveDraftOutcomeFor,
  missionReportFromArtifact,
  runHeadlineBadge,
  runStartedAt,
  statusPollDisposition,
  type MissionReport,
} from "@/lib/agents/run-presentation";
import { AgentRunHistory } from "./agent-run-history";
import { MissionReportCard } from "./mission-report";
import { AgentTimelineDetail, STATUS_KEY, StatusGlyph, agentTimeLabel } from "./agent-timeline-detail";
import { useRunClock } from "./use-run-clock";
import type { AgentRunHistoryItem } from "./agent-run-history";
import type { AgentState, AgentId } from "@/lib/types";
import type { ApiDocument } from "@/lib/api-types";
import { NO_DOCUMENTS_PREFLIGHT } from "@/lib/agents/run-preflight";
import { useEnsureActiveProject } from "@/hooks/use-ensure-active-project";

const AGENT_META: Record<
  AgentId,
  { icon: typeof Bot; color: string; bg: string; ring: string }
> = {
  INGESTION: {
    icon: FileSearch,
    color: "text-sky-600",
    bg: "bg-sky-500/15",
    ring: "text-sky-500",
  },
  COMPLIANCE_REGULATORY: {
    icon: ShieldCheck,
    color: "text-indigo-600",
    bg: "bg-indigo-500/15",
    ring: "text-indigo-500",
  },
  TECHNICAL_ARCHITECT: {
    icon: Network,
    color: "text-violet-600",
    bg: "bg-violet-500/15",
    ring: "text-violet-500",
  },
  FINANCIAL_QUALIFICATION: {
    icon: Calculator,
    color: "text-emerald-600",
    bg: "bg-emerald-500/15",
    ring: "text-emerald-500",
  },
  PROPOSAL_DRAFTING: {
    icon: PenLine,
    color: "text-amber-600",
    bg: "bg-amber-500/15",
    ring: "text-amber-500",
  },
  LAW_CONTRACT: {
    icon: Scale,
    color: "text-teal-700 dark:text-teal-300",
    bg: "bg-teal-500/15",
    ring: "text-teal-600",
  },
};

function idleStates(): AgentState[] {
  return AGENTS.map((a) => ({
    id: a.id,
    name: a.id,
    nameAr: a.id,
    status: "pending" as const,
    progress: 0,
    findings: [],
  }));
}

function normalizeStatus(s: string | undefined): AgentState["status"] {
  const v = (s || "pending").toLowerCase();
  if (v === "running" || v === "completed" || v === "failed" || v === "pending") {
    return v;
  }
  if (v === "done") return "completed";
  if (v === "error") return "failed";
  return "pending";
}

export function AgentWorkflow() {
  const { locale } = useLocale();
  const { activeProjectId, setActiveProjectId, setView, autopilot } = useUI();
  const reduceMotion = useReducedMotion();
  const autopilotOpenRef = useRef<number | null>(null);
  // Shares the `["projects"]` query `app-shell` already runs, so this costs no
  // request. It is only here to tell two states apart that the page used to
  // report as one: no project selected, and no project to select.
  const { projects, isSuccess: projectsLoaded } = useEnsureActiveProject();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [runId, setRunId] = useState<string | null>(null);
  const [agentStates, setAgentStates] = useState<AgentState[]>(idleStates);
  const [overall, setOverall] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [runStatus, setRunStatus] = useState<string | null>(null);
  const [llmFallback, setLlmFallback] = useState(false);
  const [llmProvider, setLlmProvider] = useState<string | null>(null);
  const [llmFailureKind, setLlmFailureKind] = useState<string | null>(null);
  const [llmTruncated, setLlmTruncated] = useState(false);
  const [proposalId, setProposalId] = useState<string | null>(null);
  const [contractId, setContractId] = useState<string | null>(null);
  const [coveragePercent, setCoveragePercent] = useState<number | null>(null);
  // The completed run's final artifact, normalised: AI review, live research
  // sources, template-filled sections, uncovered requirement ids.
  const [report, setReport] = useState<MissionReport | null>(null);
  // The agent whose findings the detail card shows. Null follows the run: the
  // running agent, else the failed one, else the last to finish.
  const [pinnedAgent, setPinnedAgent] = useState<AgentId | null>(null);
  const [exportReady, setExportReady] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [runFailureKind, setRunFailureKind] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: projectMeta, isError: projectMetaIsError, error: projectMetaError, refetch: refetchProjectMeta, isLoading: projectMetaLoading } = useQuery({
    queryKey: ["project-brief", activeProjectId],
    enabled: !!activeProjectId,
    queryFn: async () => {
      const res = await fetch(`/api/projects/${activeProjectId}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        // apiErrorText reads a bilingual `error` as well as a legacy string,
        // so the Arabic sentence survives once this route is mapped. The
        // typeof guard it replaces silently discarded the bilingual shape.
        throw new Error(
          apiErrorText(
            err,
            locale,
            locale === "ar" ? "تعذر تحميل المشروع" : "Failed to load project"
          )
        );
      }
      return res.json() as Promise<{
        project?: { title?: string; titleAr?: string; etimadRef?: string | null };
      }>;
    },
  });

  const {
    data: docsData,
    isLoading: docsLoading,
    isError: docsIsError,
    error: docsError,
    refetch: refetchDocs,
  } = useQuery({
    queryKey: ["documents", activeProjectId],
    enabled: !!activeProjectId,
    queryFn: async () => {
      const res = await fetch(
        `/api/documents?projectId=${encodeURIComponent(activeProjectId!)}`
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          apiErrorText(
            err,
            locale,
            locale === "ar" ? "تعذر تحميل المستندات" : "Failed to load documents"
          )
        );
      }
      return res.json() as Promise<{ documents: ApiDocument[] }>;
    },
  });

  const documentCount = docsData?.documents?.length ?? 0;
  const hasDocuments = documentCount > 0;

  const {
    data: runHistoryData,
    isLoading: runHistoryLoading,
    isError: runHistoryIsError,
    error: runHistoryError,
    refetch: refetchRunHistory,
  } = useQuery({
    queryKey: ["agent-runs"],
    queryFn: async () => {
      const res = await fetch("/api/agents/runs?limit=50");
      if (!res.ok) {
        throw new Error(
          locale === "ar"
            ? "تعذر تحميل سجل التشغيل"
            : "Could not load run history"
        );
      }
      return res.json() as Promise<{ runs: AgentRunHistoryItem[] }>;
    },
  });

  function applyStatusPayload(
    data: {
      runId?: string;
      status?: string;
      overallProgress?: number;
      agentStates?: AgentState[];
      finalArtifact?: {
        fallback?: boolean;
        provider?: string | null;
        failureKind?: string | null;
        truncated?: boolean;
        proposalId?: string;
        contractId?: string;
        coverage?: { coveragePercent?: number };
        exportReady?: boolean;
      } | null;
      proposalId?: string | null;
      contractId?: string | null;
      coveragePercent?: number | null;
      exportReady?: boolean | null;
      errorMessage?: string | null;
      failureKind?: string | null;
    }
  ) {
    if (data.runId) setRunId(data.runId);
    if (Array.isArray(data.agentStates) && data.agentStates.length) {
      const byId = new Map(
        data.agentStates.map((a) => [
          a.id,
          { ...a, status: normalizeStatus(a.status) },
        ])
      );
      setAgentStates(
        AGENTS.map((def) => {
          const live = byId.get(def.id);
          return (
            live ?? {
              id: def.id,
              name: def.id,
              nameAr: def.id,
              status: "pending" as const,
              progress: 0,
              findings: [],
            }
          );
        })
      );
    }
    setOverall(data.overallProgress ?? 0);
    setRunStatus(data.status ?? null);
    setErrorMessage(data.errorMessage ?? null);
    setRunFailureKind(data.failureKind ?? null);

    const fa = data.finalArtifact;
    if (fa) {
      setLlmFallback(!!fa.fallback);
      setLlmProvider(fa.provider ?? null);
      setLlmFailureKind(fa.failureKind ?? null);
      setLlmTruncated(!!fa.truncated);
      setProposalId(data.proposalId ?? fa.proposalId ?? null);
      setContractId(data.contractId ?? fa.contractId ?? null);
      setCoveragePercent(
        data.coveragePercent ?? fa.coverage?.coveragePercent ?? null
      );
      setExportReady(data.exportReady ?? fa.exportReady ?? null);
      setReport(missionReportFromArtifact(fa));
    } else {
      setReport(null);
    }

    const status = data.status;
    if (status === "COMPLETED" || status === "FAILED" || status === "CANCELLED") {
      setCompleted(true);
    } else if (status === "RUNNING" || status === "QUEUED") {
      // Resuming a live run and hydrating one on mount both mean "not done",
      // so this does not depend on how we got here.
      setCompleted(false);
    }
  }

  useEffect(() => {
    return () => {
      if (autopilotOpenRef.current) window.clearTimeout(autopilotOpenRef.current);
    };
  }, []);

  async function selectHistoryRun(run: AgentRunHistoryItem) {
    if (pollRef.current) clearTimeout(pollRef.current);
    setActiveProjectId(run.projectId);
    setRunId(run.id);
    setCompleted(false);
    setRunStatus(run.status);
    setOverall(run.progress);
    setErrorMessage(run.status === "FAILED" ? run.errorMessage : null);
    setRunFailureKind(run.status === "FAILED" ? run.failureKind : null);
    setLlmFallback(false);
    setLlmProvider(null);
    setLlmFailureKind(null);
    setLlmTruncated(false);
    setProposalId(null);
    setContractId(null);
    setCoveragePercent(null);
    setExportReady(null);
    setReport(null);
    setPinnedAgent(null);

    try {
      const res = await fetch(
        `/api/agents/status?runId=${encodeURIComponent(run.id)}`
      );
      if (!res.ok) throw new Error("status failed");
      applyStatusPayload(await res.json());
    } catch (err) {
      toast({
        title:
          locale === "ar"
            ? "تعذر تحميل التشغيل"
            : "Could not load run",
        description: err instanceof Error ? err.message : "error",
        variant: "destructive",
      });
    }
  }

  // Hydrate last run for the active project so the pipeline isn't blank.
  useEffect(() => {
    if (!activeProjectId || runId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/agents/status?projectId=${encodeURIComponent(activeProjectId)}`
        );
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!data.runId || cancelled) return;
        applyStatusPayload(data);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeProjectId, runId]);

  const runMutation = useMutation({
    mutationFn: async () => {
      if (!activeProjectId) {
        // Same reason as the context strip: this is only reachable with zero
        // projects, so there is nothing to select.
        throw new Error(
          locale === "ar"
            ? "أنشئ مشروع مناقصة أولاً"
            : "Create a project first"
        );
      }
      const res = await fetch("/api/agents/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // No `tenderType`: the run route used to overwrite project.category
        // with this store-held value (the wizard's last pick, "IT" by default),
        // so running the agents silently re-categorised the project.
        body: JSON.stringify({ projectId: activeProjectId, locale }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as {
          error?: string;
          code?: string;
          runId?: string;
          missing?: string[];
        };
        if (err.code === NO_DOCUMENTS_PREFLIGHT.code) {
          throw Object.assign(
            new Error(
              locale === "ar"
                ? "ارفع مستندات المناقصة قبل تشغيل الوكلاء"
                : NO_DOCUMENTS_PREFLIGHT.error
            ),
            { code: err.code }
          );
        }
        if (err.code === "ONBOARDING_INCOMPLETE") {
          const missing = Array.isArray(err.missing)
            ? err.missing.join(", ")
            : "";
          throw Object.assign(
            new Error(
              locale === "ar"
                ? `أكمل إعداد الحساب أولاً${missing ? `: ${missing}` : ""}`
                : `Complete account onboarding first${missing ? `: ${missing}` : ""}`
            ),
            { code: err.code, missing: err.missing }
          );
        }
        if (res.status === 409 && err.runId) {
          throw Object.assign(
            new Error(
              locale === "ar"
                ? "يوجد تشغيل نشط — أوقفه أو انتظر اكتماله"
                : "An agent run is already in progress"
            ),
            { code: err.code ?? "AGENT_RUN_IN_PROGRESS", runId: err.runId }
          );
        }
        throw Object.assign(new Error(apiErrorText(err, locale)), {
          code: err.code,
        });
      }
      return res.json();
    },
    onSuccess: (data) => {
      setRunId(data.runId);
      // The dock's pulse listens for this on every page.
      window.dispatchEvent(
        new CustomEvent(RUN_STARTED_EVENT, { detail: { runId: data.runId } })
      );
      setCompleted(false);
      setOverall(0);
      setRunStatus("RUNNING");
      setErrorMessage(null);
      setLlmFallback(false);
      setLlmProvider(null);
      setLlmFailureKind(null);
      setLlmTruncated(false);
      setProposalId(null);
      setContractId(null);
      setCoveragePercent(null);
      setExportReady(null);
      setReport(null);
      setPinnedAgent(null);
      if (Array.isArray(data.agentStates) && data.agentStates.length) {
        setAgentStates(
          data.agentStates.map((a) => ({
            ...a,
            status: normalizeStatus(a.status),
          }))
        );
      } else {
        setAgentStates(idleStates());
      }
      toast({
        title: locale === "ar" ? "بدأ سير عمل الوكلاء" : "Agent workflow started",
        description:
          locale === "ar"
            ? `${AGENTS.length} وكلاء يعملون بالتتابع — راقب التقدم أدناه`
            : `${AGENTS.length} agents running in sequence — watch live progress below`,
      });
      qc.invalidateQueries({ queryKey: ["stats"] });
      qc.invalidateQueries({ queryKey: ["agent-runs"] });
    },
    onError: (err: Error & { code?: string; runId?: string }) => {
      if (err.code === "ONBOARDING_INCOMPLETE") {
        startTransition(() => setView("account"));
      } else if (err.message.includes("project") || err.message.includes("مشروع")) {
        startTransition(() => setView("projects"));
      } else if (
        err.message.includes("document") ||
        err.message.includes("مستند") ||
        err.message.includes("ارفع")
      ) {
        startTransition(() => setView("documents"));
      }
      if (err.code === "AGENT_RUN_IN_PROGRESS" && err.runId) {
        setRunId(err.runId);
      }
      const planLimit = isPlanLimitCode(err.code);
      toast({
        title: planLimit
          ? locale === "ar"
            ? "بلغت حد باقتك"
            : "Plan limit reached"
          : locale === "ar"
            ? "تعذر التشغيل"
            : "Could not start",
        description: err.message,
        variant: planLimit ? "default" : "destructive",
        ...(planLimit ? { action: <UpgradeToastAction locale={locale} /> } : {}),
      });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      if (!runId) throw new Error("no run");
      const res = await fetch("/api/agents/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(apiErrorText(err, locale));
      }
      return res.json();
    },
    onSuccess: () => {
      setCompleted(true);
      setRunStatus("CANCELLED");
      qc.invalidateQueries({ queryKey: ["agent-runs"] });
      toast({
        title: locale === "ar" ? "تم الإلغاء" : "Run cancelled",
      });
    },
    onError: (err: Error) => {
      toast({
        title: locale === "ar" ? "تعذر إيقاف التشغيل" : "Could not stop the run",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (!runId || completed) return;
    const poll = async () => {
      try {
        const res = await fetch(`/api/agents/status?runId=${runId}`);
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          // A 4xx here is permanent: the run was deleted, the workspace does
          // not own it, or the session expired. The catch below reschedules
          // every 2.5s, so this used to repaint a destructive "Retrying
          // automatically…" toast forever against a request that could never
          // succeed. Say the server's own reason once, then stop.
          if (statusPollDisposition(res.status) === "stop") {
            toast({
              title:
                locale === "ar"
                  ? "تعذر متابعة هذا التشغيل"
                  : "Cannot track this run",
              description: apiErrorText(data, locale, `status ${res.status}`),
              variant: "destructive",
            });
            return;
          }
          throw new Error(`status ${res.status}`);
        }
        // A 200 whose body will not parse is a transient proxy failure, not a
        // payload — let the catch retry it rather than reading null below.
        if (!data) throw new Error("unreadable status body");
        applyStatusPayload(data);
        if (data.status === "COMPLETED") {
          const failureKind = data.finalArtifact?.failureKind;
          toast({
            title:
              locale === "ar"
                ? "اكتمل إنشاء العطاء والعقد"
                : "Proposal & contract complete",
            description: data.finalArtifact?.fallback
              ? locale === "ar"
                ? `تم الإنشاء بوضع احتياطي${failureKind ? ` (${failureKind})` : ""}`
                : `Generated via ${data.finalArtifact?.provider ?? "deterministic"} fallback${failureKind ? ` (${failureKind})` : ""}`
              : locale === "ar"
                ? "العطاء + مسودة العقد الثنائية جاهزان للمراجعة"
                : "Proposal + bilingual contract draft ready for review",
          });
          qc.invalidateQueries({ queryKey: ["stats"] });
          qc.invalidateQueries({ queryKey: ["proposals"] });
          qc.invalidateQueries({ queryKey: ["compliance"] });
          qc.invalidateQueries({ queryKey: ["agent-runs"] });
          // Autopilot: the bidder sat back and watched; hand them the result.
          // A beat first, so the six completed gauges register before the
          // screen changes.
          const producedProposal = data.proposalId ?? data.finalArtifact?.proposalId;
          if (autopilot && producedProposal) {
            autopilotOpenRef.current = window.setTimeout(() => {
              startTransition(() => setView("proposals"));
            }, 2500);
          }
          return;
        }
        if (data.status === "FAILED" || data.status === "CANCELLED") {
          toast({
            title:
              data.status === "CANCELLED"
                ? locale === "ar"
                  ? "تم إلغاء التشغيل"
                  : "Run cancelled"
                : locale === "ar"
                  ? "فشل سير العمل"
                  : "Agent workflow failed",
            description:
              data.status === "CANCELLED"
                ? tr("agent_run_failure_cancelled", locale)
                : tr(runFailureCopyKey(data.failureKind), locale),
            variant: data.status === "CANCELLED" ? "default" : "destructive",
          });
          qc.invalidateQueries({ queryKey: ["agent-runs"] });
          return;
        }
        pollRef.current = setTimeout(poll, 900);
      } catch (e) {
        console.error("poll error", e);
        toast({
          title:
            locale === "ar"
              ? "تعذر تحديث حالة التشغيل"
              : "Could not refresh run status",
          description:
            locale === "ar"
              ? "ستتم إعادة المحاولة تلقائياً…"
              : "Retrying automatically…",
          variant: "destructive",
        });
        // Keep polling after transient failures — never hang "Live" forever.
        pollRef.current = setTimeout(poll, 2_500);
      }
    };
    poll();
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
     
  }, [runId, completed, locale, toast, qc]);

  // A run just started has no status yet; treat that as live rather than idle.
  const running =
    !!runId &&
    !completed &&
    (!runStatus || runStatus === "RUNNING" || runStatus === "QUEUED");
  const doneCount = agentStates.filter((a) => a.status === "completed").length;
  const activeAgent = agentStates.find((a) => a.status === "running");
  const runHistory = runHistoryData?.runs ?? [];
  // The live draft appears the moment the drafting agent starts and stays
  // after the run ends: the document that was just written, with its sources,
  // is the payoff — it should not vanish the instant `done` arrives. Ended
  // runs replay the recorded stream; the panel says so.
  const draftingState = agentStates.find((a) => a.id === "PROPOSAL_DRAFTING");
  const lawState = agentStates.find((a) => a.id === "LAW_CONTRACT");
  const showLiveDraft =
    !!runId && draftingState != null && normalizeStatus(draftingState.status) !== "pending";
  const showLiveContract =
    !!runId && lawState != null && normalizeStatus(lawState.status) !== "pending";
  const draftOutcome = liveDraftOutcomeFor(runStatus, running);

  // The run clock: real stamps the orchestrator wrote on the agents, read
  // against a once-a-second `now` that only ticks while the run is live.
  const now = useRunClock(running);
  const runStart = runStartedAt(agentStates);
  const runElapsedLabel =
    running && runStart ? formatElapsed(now - Date.parse(runStart)) : null;
  const runEndedAt = agentStates.reduce<string | null>(
    (latest, a) => (a.completedAt && (!latest || a.completedAt > latest) ? a.completedAt : latest),
    null
  );
  const runDurationMs = !running ? durationBetween(runStart, runEndedAt) : null;
  const runDurationLabel = runDurationMs == null ? null : formatElapsed(runDurationMs);

  const focusAgentId =
    pinnedAgent ??
    activeAgent?.id ??
    agentStates.find((a) => a.status === "failed")?.id ??
    [...agentStates].reverse().find((a) => a.status === "completed")?.id ??
    null;
  const focusAgent = agentStates.find((a) => a.id === focusAgentId) ?? null;

  const projectTitle = useMemo(() => {
    const p = projectMeta?.project;
    if (!p) return null;
    return locale === "ar" ? p.titleAr || p.title : p.title;
  }, [projectMeta, locale]);

  function handleRunClick() {
    if (!activeProjectId) {
      toast({
        title: locale === "ar" ? "لا يوجد مشروع نشط" : "No active project",
        description:
          locale === "ar"
            ? "أنشئ أو اختر مشروعاً أولاً"
            : "Create or select a project first",
        variant: "destructive",
      });
      startTransition(() => setView("projects"));
      return;
    }
    if (!hasDocuments) {
      toast({
        title:
          locale === "ar"
            ? "لا توجد مستندات للمشروع"
            : "No project documents",
        description:
          locale === "ar"
            ? "ارفع مستندات المناقصة قبل تشغيل الوكلاء"
            : "Upload tender documents before running agents",
        variant: "destructive",
      });
      startTransition(() => setView("documents"));
      return;
    }
    runMutation.mutate();
  }

  const runBlocked = !!activeProjectId && !docsLoading && !hasDocuments;
  // Six radial gauges reading 0%, six dashed circles, six "00" step numbers:
  // that was the page's dominant content before anything had happened. There is
  // nothing to gauge until a run exists.
  const hasRun = !!runId || running || completed;

  return (
    <Card className="p-0 overflow-hidden border-border/70 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-border/60 bg-gradient-to-br from-violet-500/8 via-background to-sky-500/8">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={cn(
              "size-10 rounded-xl flex items-center justify-center bg-violet-500/15 ring-1 ring-violet-500/20",
              running && "agent-pulse"
            )}
          >
            <Bot className="size-5 text-violet-600" />
          </div>
          {/* No title here: `AgentsView`'s PageHeader already names the page,
              and it sat directly above a second copy of the same words. */}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {(() => {
                const badge = runHeadlineBadge(
                  { running, completed, status: runStatus },
                  locale
                );
                return (
                  <Badge
                    variant={
                      badge.tone === "danger"
                        ? "destructive"
                        : badge.tone === "muted"
                          ? "outline"
                          : "default"
                    }
                    className={cn(
                      "text-[10px]",
                      badge.tone === "live" &&
                        "bg-violet-600 hover:bg-violet-600",
                      badge.tone === "success" &&
                        "bg-emerald-600 hover:bg-emerald-600"
                    )}
                  >
                    {badge.label}
                  </Badge>
                );
              })()}
            </div>
            {/* Only the live step. Idle, this line described the pipeline to
                itself — "ingest → compliance → technical → finance → draft →
                contract" — which is the vocabulary of whoever built it. */}
            {running && activeAgent ? (
              <p className="text-[11px] text-foreground/70 mt-0.5 flex flex-wrap items-center gap-x-2">
                <span>
                  {locale === "ar"
                    ? `يعمل الآن: ${tr(`agent_${activeAgent.id}_name`, locale)} · ${doneCount}/${AGENTS.length}`
                    : `Now running: ${tr(`agent_${activeAgent.id}_name`, locale)} · ${doneCount}/${AGENTS.length}`}
                </span>
                {runElapsedLabel ? (
                  <span className="inline-flex items-center gap-1 font-mono text-[10.5px] tabular-nums text-muted-foreground" dir="ltr">
                    <Clock className="size-3" aria-hidden />
                    {runElapsedLabel}
                  </span>
                ) : null}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {running && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
              className="gap-1.5"
            >
              <Square className="size-3.5" />
              {locale === "ar" ? "إيقاف" : "Stop"}
            </Button>
          )}
          <Button
            size="sm"
            onClick={handleRunClick}
            disabled={running || runMutation.isPending || runBlocked}
            className="gap-1.5"
          >
            {running || runMutation.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Play className="size-3.5" />
            )}
            {running
              ? tr("status_RUNNING", locale)
              : completed
                ? locale === "ar"
                  ? "إعادة التشغيل"
                  : "Run again"
                : tr("action_run_agents", locale)}
          </Button>
        </div>
      </div>

      {/* Project context */}
      <div className="px-5 py-2.5 border-b border-border/50 bg-muted/40 flex flex-wrap items-center gap-2 text-[11px]">
        <FolderKanban className="size-3.5 text-muted-foreground" />
        {activeProjectId && projectMetaIsError ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-destructive font-medium">
              {projectMetaError instanceof Error
                ? projectMetaError.message
                : locale === "ar"
                  ? "تعذر تحميل المشروع"
                  : "Failed to load project"}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-6 text-[10px]"
              onClick={() => refetchProjectMeta()}
            >
              {locale === "ar" ? "إعادة المحاولة" : "Retry"}
            </Button>
          </div>
        ) : activeProjectId && projectMetaLoading ? (
          <span className="text-muted-foreground">
            {locale === "ar" ? "جاري تحميل المشروع…" : "Loading project…"}
          </span>
        ) : activeProjectId && projectTitle ? (
          <>
            <span className="font-medium text-foreground truncate max-w-[280px]">
              {projectTitle}
            </span>
            {projectMeta?.project?.etimadRef ? (
              <Badge variant="secondary" className="font-mono text-[10px]">
                {projectMeta.project.etimadRef}
              </Badge>
            ) : null}
          </>
        ) : projectsLoaded && projects.length === 0 ? (
          // `app-shell` mounts `useEnsureActiveProject`, which selects the first
          // project whenever the workspace has one. So reaching here with the
          // list loaded means there is nothing to select — the old copy asked
          // for a choice that could not be made.
          <button
            type="button"
            onClick={() => startTransition(() => setView("projects"))}
            className="inline-flex items-center gap-1.5 text-amber-700 dark:text-amber-400 font-medium hover:underline"
          >
            <AlertCircle className="size-3.5" />
            {locale === "ar"
              ? "أنشئ مشروع مناقصة أولاً"
              : "Create a project first"}
          </button>
        ) : (
          <span className="text-muted-foreground">
            {locale === "ar" ? "جاري تحميل المشروع…" : "Loading project…"}
          </span>
        )}
        {documentCount > 0 ? (
          <span className="text-muted-foreground">
            {locale === "ar"
              ? `${documentCount} مستند`
              : `${documentCount} document${documentCount === 1 ? "" : "s"}`}
          </span>
        ) : null}
      </div>

      {activeProjectId && !docsLoading && !docsIsError && !hasDocuments ? (
        <div className="mx-5 mt-3 rounded-lg border border-amber-500/35 bg-amber-500/8 px-3 py-2.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-start gap-2 min-w-0">
            <AlertCircle className="size-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-900 dark:text-amber-200 font-medium">
              {locale === "ar"
                ? "ارفع مستندات المناقصة قبل تشغيل الوكلاء"
                : "Upload tender documents before running agents"}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-[10px] shrink-0"
            onClick={() => startTransition(() => setView("documents"))}
          >
            {locale === "ar" ? "فتح المستندات" : "Go to Documents"}
          </Button>
        </div>
      ) : null}

      {activeProjectId && docsIsError ? (
        <div className="mx-5 mt-3">
          <ErrorState
            message={
              docsError instanceof Error
                ? docsError.message
                : locale === "ar"
                  ? "تعذر تحميل المستندات"
                  : "Failed to load documents"
            }
            onRetry={() => refetchDocs()}
            retryLabel={locale === "ar" ? "إعادة المحاولة" : "Retry"}
            className="py-4"
          />
        </div>
      ) : null}

      {/* Overall progress — always show when we have a run */}
      {(running || (completed && overall > 0)) && (
        <div className="relative px-5 py-3 border-b border-border/50 space-y-2 overflow-hidden">
          {running ? (
            // A light travelling the top hairline while the run is live; it
            // says "working", not "how far". The bar below carries the number.
            <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px text-violet-500/80 ops-shimmer motion-reduce:hidden" />
          ) : null}
          <div className="flex items-center justify-between text-xs">
            <span className="text-foreground/70 flex items-center gap-1.5 font-medium">
              <Sparkles className="size-3.5 text-amber-500" />
              {locale === "ar" ? "التقدم الإجمالي" : "Overall progress"}
            </span>
            <span className="text-muted-foreground tabular-nums">
              {doneCount}/{AGENTS.length} {locale === "ar" ? "وكلاء" : "agents"}
            </span>
          </div>
          {/* The six-bar strip that used to sit here said the same thing as the
              six gauges below it, one screenful apart, with less detail. */}
          <Progress value={overall} className="h-2 bg-slate-200 dark:bg-slate-700 [&_[data-slot=progress-indicator]]:bg-gradient-to-r [&_[data-slot=progress-indicator]]:from-violet-500 [&_[data-slot=progress-indicator]]:to-sky-500" />
        </div>
      )}

      {errorMessage && runStatus === "FAILED" && (
        <div className="mx-3 mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0 flex-1 space-y-1">
            {/* The sentence is for the bidder, keyed on the stable failure
                kind. The raw message is the operator's breadcrumb — provider,
                step, guardrail reason — and stays available, not on top. */}
            <p className="text-xs text-destructive">
              {tr(runFailureCopyKey(runFailureKind), locale)}
            </p>
            <details className="text-[11px] text-destructive/70">
              <summary className="cursor-pointer select-none">
                {tr("agent_run_failure_details", locale)}
              </summary>
              <p className="mt-1 font-mono break-words" dir="ltr">
                {errorMessage}
              </p>
            </details>
          </div>
          {/* The completion banner beside this one offers two ways forward.
              This one offered none: the way to retry was the Run button back up
              in the header, which a bidder has just scrolled past. */}
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px] gap-1.5 shrink-0"
            onClick={handleRunClick}
            disabled={running || runMutation.isPending || runBlocked}
          >
            <Play className="size-3" />
            {locale === "ar" ? "إعادة المحاولة" : "Try again"}
          </Button>
        </div>
      )}

      {/* The mission report: one block for everything the run produced — the
          measured numbers, the caveats, the AI review — with the payoff
          actions in its header. */}
      {completed && runStatus === "COMPLETED" && (
        <MissionReportCard
          locale={locale}
          report={report}
          coveragePercent={coveragePercent}
          exportReady={exportReady}
          provider={llmProvider}
          fallback={llmFallback}
          failureKind={llmFailureKind}
          truncated={llmTruncated}
          runDurationLabel={runDurationLabel}
          hasContract={!!contractId}
          actions={
            <>
              <Button
                size="sm"
                className="h-8 text-[11px]"
                onClick={() => startTransition(() => setView("proposals"))}
                // A completed run does not guarantee a proposal row — a run that
                // failed at drafting still reaches COMPLETED with no artifact.
                disabled={!proposalId}
              >
                {locale === "ar" ? "فتح العطاء" : "Open proposal"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-[11px] gap-1"
                onClick={() => startTransition(() => setView("contracts"))}
                disabled={!contractId}
              >
                <Scale className="size-3" />
                {locale === "ar" ? "العقد" : "Contract"}
              </Button>
            </>
          }
        />
      )}

      {/* Agent cards — the six steps as one connected timeline, once there is
          a run to show. A node lights as its step starts, ticks with its
          duration when it finishes, and shows the recorded reason when it
          fails; the connector before it fills once the step has begun. The
          selected node's findings open in the detail card below. On a phone
          the rail scrolls sideways. */}
      {hasRun ? (
        <>
        <div className="px-3 pt-3 sm:px-4 sm:pt-4">
          <ol
            aria-label={tr("agent_timeline_label", locale)}
            className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-2 scrollbar-thin lg:grid lg:grid-cols-6 lg:overflow-visible lg:pb-0"
          >
          {agentStates.map((a, idx) => {
            const meta = AGENT_META[a.id] ?? {
              icon: Bot,
              color: "text-muted-foreground",
              bg: "bg-muted",
              ring: "text-muted-foreground",
            };
            const Icon = meta.icon;
            const status = normalizeStatus(a.status);
            const isRunning = status === "running";
            const isDone = status === "completed";
            const isFailed = status === "failed";
            const isPending = status === "pending";
            // The orchestrator's own milestone for the step; zero means it has
            // reported none yet, and the gauge orbits instead of showing 0%.
            const measured = Math.round(a.progress || 0);
            const pct = isDone ? 100 : measured;
            const selected = focusAgent?.id === a.id;
            const name = tr(`agent_${a.id}_name`, locale);
            const time = agentTimeLabel({ ...a, status }, now);

            return (
              <li key={a.id} className="relative flex min-w-[10.5rem] flex-1 snap-start lg:min-w-0">
                {idx > 0 ? (
                  <span
                    aria-hidden
                    className={cn(
                      "absolute -start-2 top-[34px] h-px w-2 transition-colors duration-500",
                      isPending ? "bg-border" : "bg-emerald-500/70"
                    )}
                  />
                ) : null}
                <motion.button
                  type="button"
                  onClick={() => setPinnedAgent(a.id)}
                  aria-pressed={selected}
                  aria-label={tr("agent_timeline_show_details", locale, { name })}
                  // Driven by the real state: the running node breathes, a
                  // finished node settles, nothing moves on a timer alone.
                  animate={
                    isRunning && !reduceMotion
                      ? { scale: [1, 1.015, 1], opacity: 1 }
                      : { scale: 1, opacity: isPending ? 0.72 : 1 }
                  }
                  transition={
                    isRunning && !reduceMotion
                      ? { duration: 2.2, repeat: Infinity, ease: "easeInOut" }
                      : { duration: 0.35, ease: "easeOut" }
                  }
                  className={cn(
                    "relative flex w-full flex-col items-center gap-1.5 overflow-hidden rounded-xl border px-2 py-2.5 text-center transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                    isRunning &&
                      "border-violet-500/50 bg-violet-500/[0.07] shadow-[0_0_0_1px_rgba(139,92,246,0.12),0_0_32px_-12px_rgba(139,92,246,0.55)]",
                    isDone && "border-emerald-500/35 bg-emerald-500/[0.05]",
                    isFailed && "border-destructive/40 bg-destructive/5",
                    isPending && "border-border/80 bg-card",
                    selected && "ring-2 ring-ring/40 ring-offset-1 ring-offset-background"
                  )}
                >
                  <RadialGauge
                    value={pct}
                    size={48}
                    strokeWidth={4}
                    indeterminate={isRunning && measured <= 0}
                    trackClassName={
                      isFailed
                        ? "text-destructive/25"
                        : isRunning
                          ? "text-violet-200 dark:text-violet-900"
                          : "text-slate-300 dark:text-slate-600"
                    }
                    className={cn(
                      isFailed
                        ? "text-destructive"
                        : isDone
                          ? "text-emerald-500"
                          : isRunning
                            ? "text-violet-500"
                            : meta.ring + "/40"
                    )}
                    ariaLabel={`${name} · ${tr(STATUS_KEY[status], locale)}${
                      isDone ? " · 100%" : isRunning && measured > 0 ? ` · ${measured}%` : ""
                    }`}
                  >
                    <span
                      className={cn(
                        "relative flex size-8 items-center justify-center rounded-full",
                        meta.bg,
                        isRunning && !reduceMotion && "ops-ring text-violet-500/60"
                      )}
                    >
                      <Icon className={cn("size-3.5", meta.color)} />
                    </span>
                  </RadialGauge>
                  <span className="w-full min-w-0">
                    <span className="block font-mono text-[9.5px] font-semibold tabular-nums text-muted-foreground">
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                    <span className="block truncate text-[11px] font-semibold leading-tight">{name}</span>
                  </span>
                  <span
                    className={cn(
                      "inline-flex max-w-full items-center gap-1 text-[10px] font-medium",
                      isDone && "text-emerald-700 dark:text-emerald-300",
                      isRunning && "text-violet-700 dark:text-violet-200",
                      isFailed && "text-destructive",
                      isPending && "text-muted-foreground"
                    )}
                  >
                    <StatusGlyph status={status} className="size-3" />
                    <span className="truncate">{tr(STATUS_KEY[status], locale)}</span>
                    {time ? (
                      <span className="font-mono tabular-nums" dir="ltr">
                        · {time}
                      </span>
                    ) : null}
                  </span>
                  {isRunning ? (
                    // Indeterminate: a light passing along the foot of the node.
                    <span aria-hidden className="absolute inset-x-3 bottom-1 h-px text-violet-500/80 ops-shimmer motion-reduce:hidden" />
                  ) : null}
                </motion.button>
              </li>
            );
          })}
          </ol>

          {focusAgent ? (
            <div className="mt-2.5">
              <AgentTimelineDetail
                key={focusAgent.id}
                locale={locale}
                agent={{ ...focusAgent, status: normalizeStatus(focusAgent.status) }}
                index={agentStates.findIndex((a) => a.id === focusAgent.id)}
                total={AGENTS.length}
                now={now}
                reduceMotion={!!reduceMotion}
              />
            </div>
          ) : null}
        </div>
        {runId && (showLiveDraft || showLiveContract) ? (
          <div className="mx-3 my-3 grid grid-cols-1 gap-3 sm:mx-4 sm:my-4 2xl:grid-cols-2">
            {showLiveDraft ? (
              <LiveDraftPanel
                runId={runId}
                locale={locale}
                channel="draft"
                runOutcome={draftOutcome}
                // The sources drawer opens once the artifact is in; before that
                // the panel has nothing to list and shows no drawer.
                sources={report?.liveResearch ? report.liveResearch.sources : undefined}
                sourcesUnavailableReason={report?.liveResearch?.unavailableReason ?? null}
              />
            ) : null}
            {showLiveContract ? (
              <LiveDraftPanel runId={runId} locale={locale} channel="contract" runOutcome={draftOutcome} />
            ) : null}
          </div>
        ) : null}
        </>
      ) : (
        <div className="p-4 sm:p-5">
          <h4 className="text-xs font-semibold text-foreground/80">
            {locale === "ar"
              ? "ما يحدث عند التشغيل"
              : "What happens when you run"}
          </h4>
          {/* The same six steps the timeline will show, as a quiet list: no
              gauges, no numbers — there is nothing to measure yet. */}
          <ol className="relative mt-3 space-y-0">
            <span aria-hidden className="absolute start-[11px] top-3 bottom-3 w-px bg-border" />
            {AGENTS.map((a, i) => {
              const meta = AGENT_META[a.id];
              const Icon = meta?.icon ?? Bot;
              return (
                <li key={a.id} className="relative flex items-start gap-3 py-1.5 text-[11px]">
                  <span className={cn("relative z-[1] flex size-6 shrink-0 items-center justify-center rounded-full ring-4 ring-card", meta?.bg ?? "bg-muted")}>
                    <Icon className={cn("size-3", meta?.color ?? "text-muted-foreground")} aria-hidden />
                  </span>
                  <span className="min-w-0 pt-0.5">
                    <span className="flex items-baseline gap-1.5">
                      <span className="font-mono text-[10px] font-semibold text-muted-foreground">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="font-medium">{tr(`agent_${a.id}_name`, locale)}</span>
                    </span>
                    <span className="block text-foreground/60 leading-snug">{tr(`agent_${a.id}_desc`, locale)}</span>
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      <AgentRunHistory
        runs={runHistory}
        activeRunId={runId}
        locale={locale}
        isLoading={runHistoryLoading}
        isError={runHistoryIsError}
        errorMessage={
          runHistoryError instanceof Error
            ? runHistoryError.message
            : locale === "ar"
              ? "تعذر تحميل سجل التشغيل"
              : "Failed to load run history"
        }
        onRetry={() => refetchRunHistory()}
        onSelect={selectHistoryRun}
        onStartRun={handleRunClick}
        onUploadDocuments={() => startTransition(() => setView("documents"))}
      />
    </Card>
  );
}
