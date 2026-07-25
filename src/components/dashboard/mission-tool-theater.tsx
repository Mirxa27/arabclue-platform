"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Bot,
  CheckCircle2,
  FileText,
  FolderKanban,
  Loader2,
  Navigation,
  Radio,
  Search,
  Shield,
  Sparkles,
  Workflow,
  XCircle,
  Zap,
} from "lucide-react";
import {
  extractDelegationPlan,
  extractDocumentPreview,
  extractRegulatoryPreview,
  humanActionLabel,
  isComplianceishTool,
  isDocumentishTool,
  isToolDone,
  isToolFailed,
  isToolRunning,
  summarizeToolInput,
  summarizeToolOutput,
  toolDisplayName,
  toolKind,
  type TheaterToolEvent,
} from "@/lib/agents/platform/mission-tool-parts";
import { MissionRealtimeWorkflow } from "./mission-realtime-workflow";

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

function DocumentForge({ locale, tools, voiceLive }: { locale: "ar" | "en"; tools: TheaterToolEvent[]; voiceLive?: boolean }) {
  const ar = locale === "ar";
  const docTools = tools.filter((t) => isDocumentishTool(t.name));
  const failed =
    [...docTools].reverse().find((t) => isToolFailed(t.state)) ?? null;
  const active =
    [...docTools].reverse().find((t) => isToolRunning(t.state) || t.preliminary) ||
    [...docTools].reverse().find((t) => isToolDone(t.state) && t.output != null);

  const preview = active?.output ? extractDocumentPreview(active.output) : null;
  const running = active ? isToolRunning(active.state) || !!active.preliminary : false;

  const statusLines = (() => {
    if (preview?.sections?.length) return preview.sections;
    if (!active && !failed) return [];
    if (failed && !active) {
      return [
        ar ? "فشل توليد المستند — راجع رسالة الخطأ أدناه." : "Document generation failed — see error below.",
      ];
    }
    return [ar ? "جارٍ تشغيل أداة المستند…" : "Document tool running…", ar ? "بانتظار معاينة حقيقية من الأداة…" : "Waiting for real tool preview…"];
  })();

  if (!active && !failed) {
    return (
      <div className="relative overflow-hidden rounded-[16px] border border-zinc-200/70 dark:border-white/[0.08] bg-white/60 dark:bg-zinc-900/40 backdrop-blur-md px-3.5 py-4">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_80%_at_20%_0%,rgba(6,182,212,0.08),transparent)]" />
        <p className="relative text-[12px] leading-relaxed text-zinc-600 dark:text-zinc-400">
          {voiceLive
            ? ar
              ? "مصنع المستندات في وضع الاستعداد أثناء الجلسة الصوتية — يظهر التقدم عند تشغيل أداة مستند حقيقية."
              : "Document forge on standby during voice — progress appears when a real document tool runs."
            : ar
              ? "مصنع المستندات ينتظر — عند توليد عرض أو تشغيل الوكلاء يظهر النص هنا حياً."
              : "Document forge idle — proposals materialize here live as generation proceeds."}
        </p>
      </div>
    );
  }

  const progress =
    typeof preview?.progress === "number"
      ? Math.min(1, Math.max(0, preview.progress))
      : active && isToolDone(active.state)
        ? 1
        : null;
  const progressLabel =
    progress !== null
      ? `${Math.round(progress * 100)}%`
      : running
        ? ar
          ? "جارٍ…"
          : "in progress…"
        : failed
          ? ar
            ? "فشل"
            : "failed"
          : ar
            ? "جاهز"
            : "ready";

  return (
    <motion.div
      layout
      className={cn(
        "relative overflow-hidden rounded-[18px] border backdrop-blur-xl",
        "border-cyan-500/20 dark:border-cyan-400/15 bg-[radial-gradient(120%_80%_at_20%_0%,rgba(16,185,129,0.11),transparent_52%),radial-gradient(90%_70%_at_90%_10%,rgba(6,182,212,0.12),transparent_55%),linear-gradient(180deg,rgba(255,255,255,0.82),rgba(255,255,255,0.68))] dark:bg-[radial-gradient(120%_80%_at_20%_0%,rgba(16,185,129,0.11),transparent_52%),linear-gradient(180deg,rgba(12,20,20,0.92),rgba(8,12,14,0.86))]",
        "shadow-[0_1px_0_0_rgba(255,255,255,0.7)_inset,0_8px_24px_rgba(6,182,212,0.08)]",
        running && "shadow-[0_0_0_1px_rgba(6,182,212,0.12),0_0_36px_-12px_rgba(6,182,212,0.42),0_1px_0_0_rgba(255,255,255,0.7)_inset]"
      )}
    >
      <div className="pointer-events-none absolute inset-0 opacity-[0.06] dark:opacity-[0.08] bg-[linear-gradient(to_right,rgba(0,0,0,0.6)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.6)_1px,transparent_1px)] dark:bg-[linear-gradient(to_right,rgba(255,255,255,0.6)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.6)_1px,transparent_1px)] bg-[size:20px_20px]" />
      <div className="relative p-3.5 sm:p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className={cn("flex size-6 items-center justify-center rounded-full border border-cyan-500/20 bg-white/80 dark:bg-white/[0.06] backdrop-blur", running && "border-cyan-500/30 bg-cyan-500/10")}>
              <FileText className={cn("size-3.5 text-cyan-700 dark:text-cyan-300", running && "animate-pulse")} />
            </span>
            <span className="text-[11px] font-semibold tracking-wide uppercase text-cyan-900 dark:text-cyan-200">{ar ? "مصنع المستندات" : "Document forge"}</span>
            {running ? <span className="size-1.5 rounded-full bg-cyan-500 animate-pulse shadow-[0_0_8px_rgba(6,182,212,0.8)]" /> : null}
          </div>
          <Badge variant="outline" className={cn(
            "rounded-full text-[10px] px-2 py-0.5 border-cyan-500/20 bg-white/60 dark:bg-white/[0.05]",
            running && "animate-pulse border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
            failed && !running && "border-destructive/40 bg-destructive/10 text-destructive"
          )}>
            {running ? (ar ? "يولد…" : "generating…") : failed && !active ? (ar ? "فشل" : "failed") : ar ? "جاهز" : "ready"}
          </Badge>
        </div>

        <div>
          <p className="text-[13px] font-[550] leading-snug tracking-tight text-zinc-900 dark:text-zinc-50 truncate">
            {preview?.title ||
              toolDisplayName(active?.name || failed?.name || "getProposal", ar)}
          </p>
          <div className="mt-2 h-1.5 rounded-full bg-zinc-200 dark:bg-white/10 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress !== null ? Math.round(progress * 100) : undefined} aria-valuetext={progressLabel} aria-busy={running || undefined}>
            <motion.div
              className={cn(
                "h-full rounded-full",
                failed && !running
                  ? "bg-destructive/70"
                  : "bg-gradient-to-r from-teal-500 via-cyan-400 to-emerald-400",
                progress === null && running && "w-1/3 animate-pulse"
              )}
              initial={{ width: 0 }}
              animate={{
                width:
                  progress !== null
                    ? `${Math.round(progress * 100)}%`
                    : running
                      ? "33%"
                      : failed
                        ? "100%"
                        : "0%",
              }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
          <p className="mt-1 font-mono text-[10px] text-zinc-500" aria-live="polite">
            {progressLabel}
            {running ? ` · ${ar ? "مباشر" : "live"}` : ""}
          </p>
        </div>

        <div className="space-y-1.5 font-mono text-[11px] leading-relaxed">
          {statusLines.map((line, i) => (
            <div key={`${line}-${i}`} className={cn("flex gap-2", running && i === statusLines.length - 1 ? "text-cyan-800 dark:text-cyan-200" : "text-zinc-700 dark:text-zinc-300")}>
              <span className="text-cyan-600/60 shrink-0" aria-hidden="true">›</span>
              <span className="truncate">{line}</span>
              {running && i === statusLines.length - 1 ? <span className="inline-block h-3 w-1.5 bg-cyan-500 animate-pulse" aria-hidden="true" /> : null}
            </div>
          ))}
        </div>

        {failed && !active ? (
          <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-2.5 text-[11px] leading-relaxed text-destructive" role="alert">
            {typeof failed.errorText === "string" && failed.errorText.trim()
              ? failed.errorText.slice(0, 400)
              : ar
                ? "فشلت أداة المستند بدون تفاصيل إضافية."
                : "Document tool failed without additional detail."}
          </p>
        ) : null}

        {preview?.body ? (
          <div className="rounded-xl border border-white/60 dark:border-white/10 bg-white/80 dark:bg-black/30 backdrop-blur p-2.5 max-h-[160px] overflow-y-auto text-[11px] leading-relaxed whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">
            {preview.body.slice(0, 900)}
            {preview.body.length > 900 ? "…" : ""}
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}

function DelegationTeam({ locale, tools }: { locale: "ar" | "en"; tools: TheaterToolEvent[] }) {
  const ar = locale === "ar";
  const plan = extractDelegationPlan(tools);
  if (!plan) return null;
  return (
    <motion.div layout className="relative overflow-hidden rounded-[16px] border border-violet-500/15 dark:border-violet-400/15 bg-white/70 dark:bg-zinc-900/50 backdrop-blur-xl p-3.5 shadow-[0_1px_0_0_rgba(255,255,255,0.6)_inset]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_70%_at_15%_0%,rgba(139,92,246,0.10),transparent_60%)]" />
      <div className="relative">
        <div className="mb-2.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-violet-800 dark:text-violet-200">
          <Workflow className="size-3.5" />
          {ar ? "الوكيل يقود الفريق" : "Copilot commanding team"}
        </div>
        <ol className="space-y-1.5">
          {plan.map((step) => (
            <li key={step.id} className="flex items-start gap-2.5">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-violet-500/20 bg-violet-500/10 text-[10px] font-mono text-violet-700 dark:text-violet-200">{step.order}</span>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-medium leading-snug">{step.label}</p>
                {step.command ? <p className="text-[11px] leading-snug text-zinc-500 line-clamp-2">{step.command}</p> : null}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </motion.div>
  );
}

function RegulatoryForge({ locale, tools, voiceLive }: { locale: "ar" | "en"; tools: TheaterToolEvent[]; voiceLive?: boolean }) {
  const ar = locale === "ar";
  const regTools = tools.filter((t) => isComplianceishTool(t.name));
  const active = [...regTools].reverse().find((t) => isToolRunning(t.state) || t.preliminary) || [...regTools].reverse().find((t) => isToolDone(t.state) && t.output != null);
  const preview = active?.output ? extractRegulatoryPreview(active.output) : null;
  const running = active ? isToolRunning(active.state) || !!active.preliminary : false;
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 140);
    return () => window.clearInterval(id);
  }, [running]);

  if (!active && !voiceLive) {
    return (
      <div className="relative overflow-hidden rounded-[16px] border border-zinc-200/70 dark:border-white/10 bg-white/60 dark:bg-zinc-900/40 backdrop-blur-md px-3.5 py-4">
        <p className="text-[12px] leading-relaxed text-zinc-600 dark:text-zinc-400">{ar ? "مصهر الامتثال ينتظر — اسأل عن PDPL أو NCA أو NORA ليُركّب البحث التنظيمي حياً." : "Regulatory forge idle — ask about PDPL, NCA, or NORA to synthesize live."}</p>
      </div>
    );
  }

  const visibleFindings = preview?.findings.slice(0, running ? Math.min(preview.findings.length, 1 + (tick % 5)) : preview?.findings.length) ?? [];

  return (
    <motion.div layout className={cn("relative overflow-hidden rounded-[18px] border backdrop-blur-xl", "border-emerald-500/15 dark:border-emerald-400/15 bg-white/70 dark:bg-zinc-900/50", running && "shadow-[0_0_0_1px_rgba(16,185,129,0.12),0_0_28px_-10px_rgba(16,185,129,0.35)]")}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(100%_80%_at_10%_0%,rgba(16,185,129,0.12),transparent_50%)]" />
      <div className="relative p-3.5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[11px] font-semibold tracking-wide uppercase text-emerald-900 dark:text-emerald-200">
            <span className="flex size-6 items-center justify-center rounded-full border border-emerald-500/20 bg-white/80 dark:bg-white/[0.06]"><Shield className={cn("size-3.5", running && "animate-pulse")} /></span>
            {ar ? "مصهر الامتثال التنظيمي" : "Regulatory forge"}
          </div>
          <Badge variant="outline" className={cn("rounded-full text-[10px] border-emerald-500/20 bg-white/60 dark:bg-white/[0.05]", running && "animate-pulse")}>{running ? (ar ? "يركّب…" : "synthesizing…") : ar ? "مُركّب" : "synthesized"}</Badge>
        </div>
        <p className="text-[13px] font-medium leading-snug">{preview?.title || toolDisplayName(active?.name || "researchSaudiLaw", ar)}</p>
        {preview?.frameworks?.length ? (
          <div className="flex flex-wrap gap-1">
            {preview.frameworks.map((fw) => (
              <Badge key={fw} variant="secondary" className="rounded-full text-[10px] font-mono bg-emerald-500/10">{fw}</Badge>
            ))}
          </div>
        ) : null}
        {visibleFindings.length ? (
          <div className="space-y-2">
            {visibleFindings.map((f, i) => (
              <div key={`${f.topic}-${i}`} className="rounded-xl border border-white/60 dark:border-white/10 bg-white/80 dark:bg-black/20 backdrop-blur px-2.5 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-semibold">{f.topic}</span>
                  <Badge variant="outline" className="rounded-full text-[8px] h-4">{f.certainty}</Badge>
                </div>
                {f.statement ? <p className="mt-1 text-[11px] leading-snug text-zinc-600 dark:text-zinc-400 line-clamp-3">{f.statement}</p> : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}

export function MissionToolTheater({
  locale,
  tools,
  voiceLive,
  isCapturing,
  isSpeaking,
  className,
}: {
  locale: "ar" | "en";
  tools: TheaterToolEvent[];
  voiceLive?: boolean;
  isCapturing?: boolean;
  isSpeaking?: boolean;
  className?: string;
}) {
  const ar = locale === "ar";
  const runningCount = tools.filter((t) => isToolRunning(t.state) || t.preliminary).length;
  const doneCount = tools.filter((t) => isToolDone(t.state) && !t.preliminary).length;
  const active = runningCount > 0 || !!isCapturing || !!isSpeaking;
  const kindCounts = useMemo(() => {
    const map = new Map<string, number>();
    tools.forEach((t) => {
      const k = toolKind(t.name);
      map.set(k, (map.get(k) ?? 0) + 1);
    });
    return Array.from(map.entries());
  }, [tools]);

  return (
    <aside
      className={cn(
        "group/theater flex min-h-0 w-full min-w-0 max-w-full flex-col gap-3 rounded-[18px] sm:rounded-[20px] border bg-white/[0.66] dark:bg-zinc-900/50 backdrop-blur-[18px] p-2.5 sm:p-3 shadow-[0_1px_0_0_rgba(255,255,255,0.6)_inset,0_8px_24px_rgba(0,0,0,0.06)] transition-all duration-300",
        "border-zinc-200/70 dark:border-white/[0.08]",
        active && "border-teal-500/20 dark:border-teal-400/20 shadow-[0_0_0_1px_rgba(20,184,166,0.12),0_0_32px_-12px_rgba(20,184,166,0.35),0_1px_0_0_rgba(255,255,255,0.6)_inset]",
        className
      )}
      aria-label={ar ? "نشاط الأدوات" : "Tool activity"}
    >
      <div className="flex items-center justify-between gap-2 border-b border-zinc-200/60 dark:border-white/10 pb-2.5 sm:pb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={cn("flex size-7 sm:size-8 items-center justify-center rounded-full border transition-all duration-300 shrink-0", active ? "border-teal-500/30 bg-teal-500/14 text-teal-700 dark:text-teal-200 shadow-[0_0_16px_-6px_rgba(20,184,166,0.6)]" : "border-zinc-200 dark:border-white/10 bg-white dark:bg-white/[0.04] text-zinc-500")}>
            <Sparkles className={cn("size-3.5", active && "animate-pulse")} />
          </div>
          <div className="min-w-0">
            <p className="text-[13px] sm:text-[13.5px] font-[600] tracking-tight leading-none truncate">{ar ? "المعاينات الحية والمعالجة" : "Live previews & processing"}</p>
            <p className="mt-1 hidden sm:block text-[11px] leading-none text-zinc-500 dark:text-zinc-500 truncate">{voiceLive ? (ar ? "جلسة صوت مباشرة" : "Live voice session") : ar ? "يتتبع كل خطوة لحظياً" : "Tracks every step instantly"}</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1 sm:gap-1.5">
          {voiceLive ? <Badge variant="secondary" className="rounded-full gap-1 text-[10px] px-2 py-0.5"><Radio className="size-3" />{ar ? "صوت" : "voice"}</Badge> : null}
          <div className="flex items-center gap-1 rounded-full border border-zinc-200/70 dark:border-white/10 bg-white/70 dark:bg-white/[0.05] px-2 py-1">
            {runningCount > 0 ? <span className="size-1.5 rounded-full bg-teal-500 animate-pulse shadow-[0_0_8px_rgba(20,184,166,0.8)]" /> : <span className="size-1.5 rounded-full bg-zinc-300 dark:bg-white/30" />}
            <span className="font-mono text-[10px] tabular-nums text-zinc-700 dark:text-zinc-300">{runningCount > 0 ? (ar ? `${runningCount} نشط` : `${runningCount} live`) : ar ? "خامل" : "idle"} · {doneCount}</span>
          </div>
        </div>
      </div>

      {kindCounts.length > 1 ? (
        <div className="flex flex-wrap gap-1">
          {kindCounts.map(([k, count]) => (
            <span key={k} className="inline-flex items-center gap-1 rounded-full border border-zinc-200/60 dark:border-white/10 bg-white/60 dark:bg-white/[0.04] px-2 py-0.5 text-[10px] text-zinc-600 dark:text-zinc-400">
              <KindIcon kind={k} className="size-3" />
              {k} {count}
            </span>
          ))}
        </div>
      ) : null}

      <div className="space-y-3">
        <DelegationTeam locale={locale} tools={tools} />
        <DocumentForge locale={locale} tools={tools} voiceLive={voiceLive} />
        <RegulatoryForge locale={locale} tools={tools} voiceLive={voiceLive} />
        <MissionRealtimeWorkflow locale={locale} tools={tools} />
      </div>
    </aside>
  );
}
