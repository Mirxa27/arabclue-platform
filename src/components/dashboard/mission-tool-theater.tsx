"use client";

import { useEffect, useMemo, useState } from "react";
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

function DocumentForge({
  locale,
  tools,
  voiceLive,
}: {
  locale: "ar" | "en";
  tools: TheaterToolEvent[];
  voiceLive?: boolean;
}) {
  const ar = locale === "ar";
  const docTools = tools.filter((t) => isDocumentishTool(t.name));
  const active =
    [...docTools].reverse().find((t) => isToolRunning(t.state) || t.preliminary) ||
    [...docTools].reverse().find((t) => isToolDone(t.state) && t.output != null);

  const preview = active?.output ? extractDocumentPreview(active.output) : null;
  const running = active ? isToolRunning(active.state) || !!active.preliminary : false;

  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setPulse((p) => p + 1), 120);
    return () => window.clearInterval(id);
  }, [running]);

  const syntheticLines = useMemo(() => {
    if (preview?.sections?.length) return preview.sections;
    if (!active) return [];
    const base = [
      ar ? "تحليل المتطلبات…" : "Parsing requirements…",
      ar ? "محاذاة معايير التقييم…" : "Aligning evaluation criteria…",
      ar ? "بناء مصفوفة التغطية…" : "Building coverage matrix…",
      ar ? "صياغة الأقسام الثنائية…" : "Drafting bilingual sections…",
      ar ? "بوابة التحقق الدستورية…" : "Constitution validation gate…",
    ];
    const n = running ? Math.min(base.length, 2 + (pulse % 4)) : base.length;
    return base.slice(0, n);
  }, [active, ar, preview?.sections, pulse, running]);

  if (!active && !voiceLive) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-cyan-500/20 bg-[radial-gradient(ellipse_at_top,_rgba(6,182,212,0.08),_transparent_55%),linear-gradient(180deg,rgba(15,23,42,0.03),transparent)] px-4 py-5">
        <p className="text-xs text-muted-foreground">
          {ar
            ? "مصنع المستندات ينتظر — عند توليد عرض أو تشغيل الوكلاء يظهر النص هنا حيّاً."
            : "Document forge idle — proposal generation and agent runs materialize here live."}
        </p>
      </div>
    );
  }

  const progress =
    preview?.progress ??
    (running ? Math.min(0.92, 0.18 + (pulse % 20) * 0.03) : active && isToolDone(active.state) ? 1 : 0.35);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-cyan-500/25",
        "bg-[radial-gradient(circle_at_20%_0%,_rgba(16,185,129,0.12),_transparent_40%),radial-gradient(circle_at_90%_20%,_rgba(6,182,212,0.14),_transparent_45%),linear-gradient(165deg,rgba(15,23,42,0.04),rgba(8,47,73,0.06))]",
        running && "mission-tool-live"
      )}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.12]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(6,182,212,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(6,182,212,0.25) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 h-16 bg-gradient-to-b from-cyan-400/20 to-transparent",
          running && "animate-[mission-scan_2.4s_ease-in-out_infinite]"
        )}
        style={{ top: `${(pulse % 12) * 8}%` }}
      />

      <div className="relative p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-wide uppercase text-cyan-800 dark:text-cyan-200">
            <FileText className={cn("size-3.5", running && "animate-pulse")} />
            {ar ? "مصنع المستندات" : "Document forge"}
          </div>
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] border-cyan-500/40",
              running && "animate-pulse border-emerald-500/50 text-emerald-700"
            )}
          >
            {running
              ? ar
                ? "يُولَّد…"
                : "generating…"
              : ar
                ? "جاهز"
                : "ready"}
          </Badge>
        </div>

        <div>
          <p className="text-sm font-medium">
            {preview?.title ||
              toolDisplayName(active?.name || "getProposal", ar)}
          </p>
          <div className="mt-2 h-1.5 rounded-full bg-cyan-950/10 overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full bg-gradient-to-r from-teal-500 via-cyan-400 to-emerald-400 transition-[width] duration-300",
                running && "mission-progress-shimmer"
              )}
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground font-mono">
            {Math.round(progress * 100)}%
          </p>
        </div>

        <div className="space-y-1.5 font-mono text-[11px] leading-relaxed">
          {syntheticLines.map((line, i) => (
            <div
              key={`${line}-${i}`}
              className={cn(
                "flex gap-2 text-foreground/80",
                running && i === syntheticLines.length - 1 && "text-cyan-700 dark:text-cyan-300"
              )}
            >
              <span className="text-cyan-600/70 shrink-0">›</span>
              <span className="truncate">{line}</span>
              {running && i === syntheticLines.length - 1 ? (
                <span className="inline-block w-1.5 h-3 bg-cyan-500 animate-pulse" />
              ) : null}
            </div>
          ))}
        </div>

        {preview?.body ? (
          <div className="rounded-xl border border-white/40 bg-background/70 backdrop-blur-sm p-3 max-h-36 overflow-y-auto text-xs whitespace-pre-wrap text-muted-foreground">
            {preview.body.slice(0, 900)}
            {preview.body.length > 900 ? "…" : ""}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DelegationTeam({
  locale,
  tools,
}: {
  locale: "ar" | "en";
  tools: TheaterToolEvent[];
}) {
  const ar = locale === "ar";
  const plan = extractDelegationPlan(tools);
  if (!plan) return null;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-violet-500/25 bg-[radial-gradient(circle_at_15%_0%,_rgba(139,92,246,0.12),_transparent_45%),linear-gradient(165deg,rgba(76,29,149,0.05),transparent)] p-4">
      <div className="mb-2.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-200">
        <Workflow className="size-3.5" />
        {ar ? "الوكيل يقود الفريق" : "Copilot is commanding the team"}
      </div>
      <ol className="space-y-1.5">
        {plan.map((step) => (
          <li key={step.id} className="flex items-start gap-2.5">
            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-violet-400/40 bg-violet-500/10 text-[10px] font-mono text-violet-700 dark:text-violet-200">
              {step.order}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium">{step.label}</p>
              {step.command ? (
                <p className="text-[11px] leading-snug text-muted-foreground line-clamp-2">
                  {step.command}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function certaintyTone(certainty: string): string {
  if (certainty === "TENDER_EXPLICIT") return "border-emerald-500/40 text-emerald-800 dark:text-emerald-200";
  if (certainty === "REGISTRY_BACKED") return "border-cyan-500/40 text-cyan-800 dark:text-cyan-200";
  return "border-amber-500/40 text-amber-800 dark:text-amber-200";
}

function RegulatoryForge({
  locale,
  tools,
  voiceLive,
}: {
  locale: "ar" | "en";
  tools: TheaterToolEvent[];
  voiceLive?: boolean;
}) {
  const ar = locale === "ar";
  const regTools = tools.filter((t) => isComplianceishTool(t.name));
  const active =
    [...regTools].reverse().find((t) => isToolRunning(t.state) || t.preliminary) ||
    [...regTools].reverse().find((t) => isToolDone(t.state) && t.output != null);

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
      <div className="relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-[radial-gradient(ellipse_at_top,_rgba(16,185,129,0.08),_transparent_55%)] px-4 py-5">
        <p className="text-xs text-muted-foreground">
          {ar
            ? "مصهر الامتثال ينتظر — اسأل عن PDPL أو NCA أو NORA ليُركَّب البحث التنظيمي حيّاً."
            : "Regulatory forge idle — ask about PDPL, NCA, or NORA to synthesize live."}
        </p>
      </div>
    );
  }

  const visibleFindings = preview?.findings.slice(
    0,
    running ? Math.min(preview.findings.length, 1 + (tick % 5)) : preview?.findings.length
  ) ?? [];

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-emerald-500/25",
        "bg-[radial-gradient(circle_at_10%_0%,_rgba(16,185,129,0.14),_transparent_42%),radial-gradient(circle_at_90%_10%,_rgba(20,184,166,0.1),_transparent_45%),linear-gradient(165deg,rgba(6,78,59,0.04),transparent)]",
        running && "mission-tool-live"
      )}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.1]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(-12deg, rgba(16,185,129,0.35) 0 1px, transparent 1px 14px)",
        }}
      />
      <div className="relative p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-wide uppercase text-emerald-800 dark:text-emerald-200">
            <Shield className={cn("size-3.5", running && "animate-pulse")} />
            {ar ? "مصهر الامتثال التنظيمي" : "Regulatory forge"}
          </div>
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] border-emerald-500/40",
              running && "animate-pulse"
            )}
          >
            {running
              ? ar
                ? "يُركَّب…"
                : "synthesizing…"
              : ar
                ? "مُركَّب"
                : "synthesized"}
          </Badge>
        </div>

        <p className="text-sm font-medium">
          {preview?.title ||
            toolDisplayName(active?.name || "researchSaudiLaw", ar)}
        </p>

        {preview?.frameworks?.length ? (
          <div className="flex flex-wrap gap-1.5">
            {preview.frameworks.map((fw) => (
              <Badge
                key={fw}
                variant="secondary"
                className="text-[10px] font-mono bg-emerald-500/10"
              >
                {fw}
              </Badge>
            ))}
          </div>
        ) : null}

        {visibleFindings.length ? (
          <div className="space-y-2">
            {visibleFindings.map((f, i) => (
              <div
                key={`${f.topic}-${i}`}
                className="rounded-xl border border-white/40 bg-background/70 backdrop-blur-sm px-3 py-2"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold">{f.topic}</span>
                  <Badge
                    variant="outline"
                    className={cn("text-[9px] h-5", certaintyTone(f.certainty))}
                  >
                    {f.certainty}
                  </Badge>
                </div>
                {f.statement ? (
                  <p className="mt-1 text-[11px] text-muted-foreground line-clamp-3">
                    {f.statement}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        {preview?.gaps?.length ? (
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {ar ? "فجوات المصفوفة" : "Matrix gaps"}
            </p>
            {preview.gaps.slice(0, 5).map((g) => (
              <div
                key={`${g.framework}-${g.controlId}`}
                className="flex flex-wrap items-center gap-2 text-[11px] font-mono"
              >
                <span className="text-emerald-700 dark:text-emerald-300">
                  {g.framework}
                </span>
                <span>{g.controlId}</span>
                <Badge variant="outline" className="h-5 text-[9px]">
                  {g.status}
                </Badge>
                <span className="text-muted-foreground truncate max-w-[12rem]">
                  {g.title}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        <p className="text-[10px] text-muted-foreground border-t border-emerald-500/15 pt-2 leading-relaxed">
          {preview?.disclaimer ||
            (ar
              ? "ليست استشارة قانونية — يلزم مراجعة مستشار معتمد."
              : "Not legal advice — authorized counsel review required.")}
        </p>
      </div>
    </div>
  );
}

function ToolTimeline({
  locale,
  tools,
}: {
  locale: "ar" | "en";
  tools: TheaterToolEvent[];
}) {
  const ar = locale === "ar";
  const recent = [...tools].reverse().slice(0, 18);
  const activeId =
    recent.find((t) => isToolRunning(t.state) || t.preliminary)?.id ?? null;

  if (!recent.length) {
    return (
      <p className="px-1 text-xs text-muted-foreground">
        {ar
          ? "خطوات الأدوات تظهر هنا لحظة بلحظة أثناء عمل الوكيل."
          : "Tool steps appear here live while the agent works."}
      </p>
    );
  }

  return (
    <div className="relative max-h-[min(56vh,460px)] space-y-2 overflow-y-auto pr-1">
      {recent.map((tool, idx) => {
        const running = isToolRunning(tool.state) || !!tool.preliminary;
        const done = isToolDone(tool.state) && !tool.preliminary;
        const failed = isToolFailed(tool.state);
        const kind = toolKind(tool.name);
        const summary = summarizeToolOutput(
          failed ? { error: tool.errorText } : tool.output,
          ar
        );
        const isActive = tool.id === activeId;
        return (
          <div
            key={tool.id}
            data-tool-id={tool.id}
            className={cn(
              "relative rounded-xl border px-3 py-2.5 text-xs transition-colors mission-tool-card",
              "bg-background/90",
              running && "border-amber-500/40 bg-amber-500/[0.06]",
              done && "border-emerald-500/35",
              failed && "border-destructive/40",
              !running && !done && !failed && "border-border/70",
              isActive && "ring-1 ring-teal-600/25"
            )}
            style={{ animationDelay: `${Math.min(idx, 6) * 40}ms` }}
          >
            <div className="flex items-start gap-2.5">
              <div
                className={cn(
                  "mt-0.5 flex size-7 items-center justify-center rounded-lg border",
                  running && "border-amber-500/40 bg-amber-500/10",
                  done && "border-emerald-500/40 bg-emerald-500/10",
                  failed && "border-destructive/40 bg-destructive/10",
                  !running && !done && !failed && "border-border bg-muted/40"
                )}
              >
                {running ? (
                  <Loader2 className="size-3.5 animate-spin text-amber-600" />
                ) : done ? (
                  <CheckCircle2 className="size-3.5 text-emerald-600" />
                ) : failed ? (
                  <XCircle className="size-3.5 text-destructive" />
                ) : (
                  <KindIcon kind={kind} className="text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">
                    {toolDisplayName(tool.name, ar)}
                  </span>
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {running
                      ? ar
                        ? "ينفّذ"
                        : "running"
                      : done
                        ? ar
                          ? "اكتمل"
                          : "done"
                        : failed
                          ? ar
                            ? "فشل"
                            : "error"
                          : tool.state}
                  </span>
                </div>
                <p
                  className={cn(
                    "mt-0.5 text-[11px]",
                    running
                      ? "font-medium text-teal-800 dark:text-teal-200"
                      : "text-muted-foreground"
                  )}
                >
                  {humanActionLabel(tool.name, ar)}
                </p>
                {tool.input != null && running
                  ? (() => {
                      const preview = summarizeToolInput(tool.input, ar);
                      return preview ? (
                        <p className="mt-1 line-clamp-2 text-muted-foreground">
                          {preview}
                        </p>
                      ) : null;
                    })()
                  : null}
                {summary ? (
                  <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-muted-foreground">
                    {summary}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
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
  const runningCount = tools.filter(
    (t) => isToolRunning(t.state) || t.preliminary
  ).length;
  const doneCount = tools.filter((t) => isToolDone(t.state) && !t.preliminary).length;
  const active = runningCount > 0 || !!isCapturing || !!isSpeaking;

  return (
    <aside
      className={cn(
        "flex min-h-0 flex-col gap-3 rounded-xl border border-border/70 bg-background/70 p-3",
        className
      )}
      aria-label={ar ? "نشاط الأدوات" : "Tool activity"}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border/50 pb-2.5">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "flex size-7 items-center justify-center rounded-lg border",
              active
                ? "border-teal-600/35 bg-teal-600/10 text-teal-800 dark:text-teal-200"
                : "border-border bg-muted/40 text-muted-foreground"
            )}
          >
            <Sparkles className="size-3.5" />
          </div>
          <div>
            <p className="text-sm font-semibold">
              {ar ? "نشاط الأدوات" : "Tool activity"}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {voiceLive
                ? ar
                  ? "جلسة صوت مباشرة"
                  : "Live voice session"
                : ar
                  ? "وضع المتصفح"
                  : "Browser mode"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {voiceLive ? (
            <Badge variant="secondary" className="gap-1 rounded-md text-[10px]">
              <Radio className="size-3" />
              {ar ? "صوت" : "voice"}
            </Badge>
          ) : null}
          <Badge variant="outline" className="rounded-md text-[10px] tabular-nums">
            {runningCount > 0
              ? ar
                ? `${runningCount} يعمل`
                : `${runningCount} running`
              : ar
                ? "خامل"
                : "idle"}
            {" · "}
            {ar ? `${doneCount} تم` : `${doneCount} done`}
          </Badge>
        </div>
      </div>

      <DelegationTeam locale={locale} tools={tools} />
      <DocumentForge locale={locale} tools={tools} voiceLive={voiceLive} />
      <RegulatoryForge locale={locale} tools={tools} voiceLive={voiceLive} />
      <ToolTimeline locale={locale} tools={tools} />
    </aside>
  );
}
