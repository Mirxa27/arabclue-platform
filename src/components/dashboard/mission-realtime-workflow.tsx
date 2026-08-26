"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  Loader2,
  XCircle,
  Clock3,
  FileText,
  Shield,
  FolderKanban,
  Navigation,
  Search,
  Bot,
  Zap,
  Workflow,
  Sparkles,
  Eye,
  ChevronDown,
} from "lucide-react";
import {
  extractDocumentPreview,
  extractRegulatoryPreview,
  humanActionLabel,
  isToolDone,
  isToolFailed,
  isToolRunning,
  summarizeToolInput,
  summarizeToolOutput,
  toolDisplayName,
  toolKind,
  type TheaterToolEvent,
} from "@/lib/agents/platform/mission-tool-parts";

function KindIcon({ kind, className }: { kind: string; className?: string }) {
  const c = cn("size-3.5", className);
  switch (kind) {
    case "navigate":
      return <Navigation className={c} />;
    case "project":
      return <FolderKanban className={c} />;
    case "document":
    case "proposal":
      return <FileText className={c} />;
    case "pipeline":
      return <Workflow className={c} />;
    case "compliance":
      return <Shield className={c} />;
    case "search":
      return <Search className={c} />;
    case "mission":
      return <Zap className={c} />;
    default:
      return <Bot className={c} />;
  }
}

type StepStatus = "queued" | "active" | "done" | "error";

function statusFromTool(t: TheaterToolEvent): StepStatus {
  if (isToolFailed(t.state)) return "error";
  if (isToolDone(t.state) && !t.preliminary) return "done";
  if (isToolRunning(t.state) || t.preliminary) return "active";
  if (t.state === "input-streaming" || t.state === "input-available") return "active";
  return "queued";
}

function StatusOrb({ status }: { status: StepStatus }) {
  return (
    <span
      className={cn(
        "relative flex size-[22px] items-center justify-center rounded-full border transition-all duration-300",
        status === "active"
          ? "border-teal-500/40 bg-teal-500/15 shadow-[0_0_16px_-4px_rgba(20,184,166,0.6)]"
          : status === "done"
            ? "border-emerald-500/30 bg-emerald-500/12"
            : status === "error"
              ? "border-red-500/30 bg-red-500/10"
              : "border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.06]"
      )}
    >
      {status === "active" ? (
        <>
          <span className="absolute size-full rounded-full bg-teal-500/20 animate-ping" />
          <Loader2 className="size-3 animate-spin text-teal-600 dark:text-teal-300" />
        </>
      ) : status === "done" ? (
        <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
      ) : status === "error" ? (
        <XCircle className="size-3.5 text-red-600 dark:text-red-400" />
      ) : (
        <Clock3 className="size-3 text-zinc-400 dark:text-zinc-500" />
      )}
    </span>
  );
}

function PreviewBlock({ tool, ar, status }: { tool: TheaterToolEvent; ar: boolean; status: StepStatus }) {
  const docPreview = useMemo(() => (tool.output ? extractDocumentPreview(tool.output) : null), [tool.output]);
  const regPreview = useMemo(() => (tool.output ? extractRegulatoryPreview(tool.output) : null), [tool.output]);
  const [expanded, setExpanded] = useState(status === "active");

  useEffect(() => {
    if (status === "active") setExpanded(true);
  }, [status]);

  const inputSummary = summarizeToolInput(tool.input, ar);
  const outputSummary = summarizeToolOutput(tool.output, ar);

  // Active tool with no structured preview yet: show only what the tool
  // actually gave us. No fabricated phrase-cycler (was 180ms setInterval
  // through "Analyzing → Aligning → Building" strings that had no relation
  // to the real work being done — the classic agent-theater anti-pattern).
  if (status === "active" && !docPreview && !regPreview) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-teal-500/15 bg-teal-500/[0.04] px-2.5 py-2">
        <Loader2 className="size-3 animate-spin text-teal-600 dark:text-teal-300 shrink-0" />
        <span className="text-[11px] font-mono text-teal-800/80 dark:text-teal-200/80 truncate">
          {inputSummary || (ar ? "قيد التنفيذ…" : "Running…")}
        </span>
      </div>
    );
  }

  if (docPreview) {
    // Only render the progress bar when the tool actually reports progress,
    // or when it's finished. Faking a 40% bar for every active document tool
    // is exactly the same agent-theater lie as the phrase cycler — the tool
    // did not tell us it was 40% done.
    const reportedProgress =
      typeof docPreview.progress === "number"
        ? docPreview.progress
        : status === "done"
          ? 1
          : null;
    return (
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[12px] font-medium leading-snug truncate">{docPreview.title}</p>
          {reportedProgress !== null ? (
            <span className="font-mono text-[10px] text-zinc-500">{Math.round(reportedProgress * 100)}%</span>
          ) : null}
        </div>
        {reportedProgress !== null ? (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-white/10">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-teal-500 via-cyan-400 to-emerald-400"
              initial={{ width: 0 }}
              animate={{ width: `${Math.round(reportedProgress * 100)}%` }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
        ) : null}
        {(docPreview.sections?.length ?? 0) > 0 ? (
          <div className="rounded-xl border border-white/40 dark:border-white/10 bg-white/50 dark:bg-black/20 px-2.5 py-2 space-y-1">
            {docPreview.sections.slice(0, expanded ? 8 : 3).map((s, i) => (
              <div key={`${s}-${i}`} className="flex gap-1.5 text-[11px] leading-snug text-zinc-700 dark:text-zinc-300">
                <span className="mt-0.5 size-1 rounded-full bg-teal-500/60 shrink-0" />
                <span className="line-clamp-1">{s}</span>
              </div>
            ))}
          </div>
        ) : null}
        {docPreview.body ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 text-[11px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
          >
            <Eye className="size-3" />
            {expanded ? (ar ? "إخفاء التفاصيل" : "Hide details") : ar ? "عرض المحتوى" : "Show preview"}
            <ChevronDown className={cn("size-3 transition-transform", expanded && "rotate-180")} />
          </button>
        ) : null}
        <AnimatePresence>
          {expanded && docPreview.body ? (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="rounded-xl border border-zinc-200/70 dark:border-white/10 bg-white/80 dark:bg-zinc-900/60 p-2.5 text-[11px] leading-relaxed text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap max-h-[180px] overflow-y-auto">
                {docPreview.body.slice(0, 900)}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    );
  }

  if (regPreview) {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1">
          {regPreview.frameworks.slice(0, 4).map((fw) => (
            <Badge key={fw} variant="secondary" className="text-[9px] bg-emerald-500/10">
              {fw}
            </Badge>
          ))}
        </div>
        {regPreview.findings.slice(0, expanded ? 6 : 2).map((f, i) => (
          <div key={`${f.topic}-${i}`} className="rounded-lg border border-emerald-500/15 bg-white/60 dark:bg-black/20 px-2.5 py-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium">{f.topic}</span>
              <span className="rounded-full border px-1.5 py-0.5 text-[8px] font-mono">{f.certainty}</span>
            </div>
            {f.statement ? <p className="mt-1 text-[11px] leading-snug text-zinc-600 dark:text-zinc-400 line-clamp-2">{f.statement}</p> : null}
          </div>
        ))}
        {regPreview.findings.length > 2 ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-[11px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
          >
            {expanded ? (ar ? "إخفاء" : "Show less") : ar ? `عرض الكل (${regPreview.findings.length})` : `Show all (${regPreview.findings.length})`}
          </button>
        ) : null}
      </div>
    );
  }

  if (outputSummary || inputSummary) {
    return (
      <div className="text-[11px] leading-relaxed">
        {status === "done" && outputSummary ? (
          <p className="text-zinc-700 dark:text-zinc-300 line-clamp-3">{outputSummary}</p>
        ) : inputSummary ? (
          <p className="text-zinc-500 dark:text-zinc-400 line-clamp-2">{inputSummary}</p>
        ) : (
          <p className="text-zinc-400 dark:text-zinc-500">{ar ? "مكتمل" : "Completed"}</p>
        )}
      </div>
    );
  }

  return null;
}

export function MissionRealtimeWorkflow({
  locale,
  tools,
  className,
}: {
  locale: "ar" | "en";
  tools: TheaterToolEvent[];
  className?: string;
}) {
  const ar = locale === "ar";
  const sorted = useMemo(() => [...tools].sort((a, b) => (a.at ?? 0) - (b.at ?? 0)), [tools]);
  const recent = useMemo(() => [...sorted].reverse().slice(0, 24), [sorted]);

  const runningCount = useMemo(() => tools.filter((t) => statusFromTool(t) === "active").length, [tools]);
  const doneCount = useMemo(() => tools.filter((t) => statusFromTool(t) === "done").length, [tools]);

  if (!tools.length) {
    return (
      <div
        className={cn(
          "rounded-[16px] border border-dashed border-zinc-200 dark:border-white/10 bg-white/40 dark:bg-black/10 px-4 py-8 text-center",
          className
        )}
      >
        <div className="mx-auto flex size-8 items-center justify-center rounded-full border border-zinc-200 dark:border-white/10 bg-white/60 dark:bg-white/[0.04]">
          <Sparkles className="size-4 text-zinc-400" />
        </div>
        <p className="mx-auto mt-3 max-w-[28ch] text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400">
          {ar ? "خطوات المعالجة الحية تظهر هنا لحظياً عند تشغيل الوكيل." : "Live processing steps will appear here instantly when the copilot runs."}
        </p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2.5", className)} role="list" aria-live="polite" aria-label={ar ? "معاينات المعالجة الحية" : "Live processing previews"}>
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium tracking-wide text-zinc-700 dark:text-zinc-300 uppercase">
            {ar ? "مسار التنفيذ الحي" : "Live execution path"}
          </span>
          {runningCount > 0 ? <span className="size-1.5 rounded-full bg-teal-500 animate-pulse shadow-[0_0_8px_rgba(20,184,166,0.8)]" /> : null}
        </div>
        <span className="font-mono text-[10px] text-zinc-500">
          {ar ? `${doneCount} مكتمل · ${runningCount} يعمل` : `${doneCount} done · ${runningCount} active`} · {tools.length}
        </span>
      </div>

      <div className="relative space-y-2 sm:space-y-2.5">
        <div className="pointer-events-none absolute start-[11px] top-3 bottom-3 w-px bg-gradient-to-b from-teal-500/20 via-zinc-300/40 dark:via-white/10 to-transparent hidden sm:block" />

        <AnimatePresence initial={false}>
          {recent.map((tool, idx) => {
            const status = statusFromTool(tool);
            const kind = toolKind(tool.name);
            const isActive = status === "active";
            return (
              <motion.div
                key={tool.id}
                role="listitem"
                layout
                initial={{ opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1], delay: Math.min(idx * 0.03, 0.18) }}
                className={cn(
                  "group/card relative rounded-[14px] border px-2.5 py-2.5 sm:px-3 sm:py-3 transition-all duration-300 will-change-transform transform-gpu",
                  "bg-white/[0.72] dark:bg-zinc-900/50 backdrop-blur-[12px] shadow-[0_1px_0_0_rgba(255,255,255,0.6)_inset,0_1px_2px_rgba(0,0,0,0.04)]",
                  "border-zinc-200/70 dark:border-white/[0.08]",
                  isActive && "border-teal-500/30 bg-teal-500/[0.06] dark:bg-teal-500/[0.08] shadow-[0_0_0_1px_rgba(20,184,166,0.12),0_0_20px_-8px_rgba(20,184,166,0.32),0_1px_0_0_rgba(255,255,255,0.5)_inset] dark:shadow-[0_0_0_1px_rgba(20,184,166,0.16),0_0_28px_-10px_rgba(20,184,166,0.5)]",
                  status === "done" && "border-emerald-500/20 bg-emerald-50/[0.5] dark:bg-emerald-950/10",
                  status === "error" && "border-red-500/20 bg-red-50/60 dark:bg-red-950/20"
                )}
                style={{ zIndex: recent.length - idx }}
              >
                {isActive ? (
                  <motion.div
                    className="pointer-events-none absolute inset-0 rounded-[inherit] overflow-hidden"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.4 }}
                  >
                    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-teal-400/50 to-transparent" />
                    <motion.div
                      className="absolute inset-0 bg-gradient-to-r from-transparent via-teal-500/10 to-transparent"
                      animate={{ x: ["-100%", "100%"] }}
                      transition={{ duration: 1.8, repeat: Infinity, ease: "linear" }}
                    />
                  </motion.div>
                ) : null}

                <div className="relative flex items-start gap-2.5 sm:gap-3">
                  <div className="shrink-0 mt-0.5 sm:mt-0">
                    <StatusOrb status={status} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span
                          className={cn(
                            "flex size-5 items-center justify-center rounded-full border text-[10px]",
                            isActive
                              ? "border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-300"
                              : "border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.04] text-zinc-500"
                          )}
                        >
                          <KindIcon kind={kind} className="size-3" />
                        </span>
                        <span className="truncate text-[12px] sm:text-[13px] font-[550] tracking-tight text-zinc-900 dark:text-zinc-50">
                          {toolDisplayName(tool.name, ar)}
                        </span>
                        <span
                          className={cn(
                            "inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-medium leading-none tracking-wide",
                            status === "active"
                              ? "bg-teal-500/15 text-teal-800 dark:text-teal-200 animate-pulse"
                              : status === "done"
                                ? "bg-emerald-500/12 text-emerald-800 dark:text-emerald-200"
                                : status === "error"
                                  ? "bg-red-500/12 text-red-800 dark:text-red-200"
                                  : "bg-zinc-100 dark:bg-white/10 text-zinc-600 dark:text-zinc-400"
                          )}
                        >
                          {status === "active" ? (ar ? "نشط" : "active") : status === "done" ? (ar ? "تم" : "done") : status === "error" ? (ar ? "خطأ" : "error") : ar ? "انتظار" : "queued"}
                        </span>
                      </div>

                      <span className="shrink-0 text-[10px] font-mono text-zinc-400 dark:text-zinc-500">
                        {humanActionLabel(tool.name, ar)}
                      </span>
                    </div>

                    <div className="mt-2">
                      <PreviewBlock tool={tool} ar={ar} status={status} />
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
