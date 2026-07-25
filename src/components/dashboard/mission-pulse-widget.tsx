"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Activity, CheckCircle2, FileText, Puzzle, RefreshCw, XCircle } from "lucide-react";
import type { MissionPulse } from "@/lib/agents/platform/mission-pulse";

type Props = {
  locale: "ar" | "en";
  missionId: string | null;
  refreshKey?: number;
  className?: string;
};

const HEALTH_STYLES: Record<MissionPulse["health"], string> = {
  thriving: "bg-emerald-500/14 text-emerald-800 dark:text-emerald-200 border-emerald-500/20",
  active: "bg-cyan-500/12 text-cyan-800 dark:text-cyan-200 border-cyan-500/20",
  idle: "bg-white/70 dark:bg-white/[0.06] text-zinc-600 dark:text-zinc-400 border-zinc-200/70 dark:border-white/10",
};

export function MissionPulseWidget({ locale, missionId, refreshKey = 0, className }: Props) {
  const ar = locale === "ar";
  const [pulse, setPulse] = useState<MissionPulse | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    if (!missionId) {
      setPulse(null);
      setLoadError(false);
      return;
    }
    let cancelled = false;
    const load = () =>
      fetch(`/api/platform-agent/missions/${missionId}/pulse`)
        .then(async (r) => {
          if (!r.ok) throw new Error(`pulse ${r.status}`);
          return r.json();
        })
        .then((data) => {
          if (cancelled) return;
          setLoadError(false);
          setPulse((data?.pulse as MissionPulse) ?? null);
        })
        .catch(() => {
          if (!cancelled) {
            setLoadError(true);
            setPulse(null);
          }
        });
    void load();
    const id = window.setInterval(() => void load(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [missionId, refreshKey, retryToken]);

  if (!missionId) return null;

  if (loadError) {
    return (
      <div
        className={cn(
          "flex flex-wrap items-center gap-2 rounded-[14px] border border-destructive/30 bg-destructive/5 px-3 py-2 text-[11px]",
          className
        )}
        role="alert"
      >
        <span className="text-destructive">
          {ar ? "تعذر تحميل نبض المهمة" : "Could not load mission pulse"}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 gap-1 rounded-full text-[10px]"
          onClick={() => setRetryToken((n) => n + 1)}
        >
          <RefreshCw className="size-3" />
          {ar ? "إعادة" : "Retry"}
        </Button>
      </div>
    );
  }

  if (!pulse) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-[14px] border border-zinc-200/70 bg-white/60 px-3 py-2 text-[11px] text-muted-foreground dark:border-white/10 dark:bg-zinc-900/40",
          className
        )}
        role="status"
      >
        <Activity className="size-3.5 animate-pulse" />
        {ar ? "جاري تحميل النبض…" : "Loading pulse…"}
      </div>
    );
  }

  const isEmpty =
    pulse.attachments.total === 0 && pulse.actions.total === 0;

  const healthLabel =
    pulse.health === "thriving"
      ? ar
        ? "نشطة جداً"
        : "Thriving"
      : pulse.health === "active"
        ? ar
          ? "نشطة"
          : "Active"
        : ar
          ? "هادئة"
          : "Idle";

  const topCategory = Object.entries(pulse.attachments.byCategory).sort(
    (a, b) => b[1] - a[1]
  )[0];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "relative flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-[14px] border bg-white/[0.62] dark:bg-zinc-900/40 backdrop-blur-xl px-3 py-2.5 shadow-[0_1px_0_0_rgba(255,255,255,0.6)_inset]",
        "border-zinc-200/70 dark:border-white/[0.08]",
        className
      )}
      dir={ar ? "rtl" : "ltr"}
    >
      <div className="pointer-events-none absolute inset-0 rounded-[inherit] bg-[radial-gradient(80%_100%_at_20%_0%,rgba(20,184,166,0.08),transparent_60%)]" />
      <div className="relative flex flex-wrap items-center gap-2">
        <Badge
          variant="outline"
          className={cn(
            "rounded-full gap-1 text-[10px] px-2.5 py-0.5 backdrop-blur",
            HEALTH_STYLES[pulse.health]
          )}
        >
          <Activity className="size-3" />
          {ar ? "نبض:" : "Pulse:"} {healthLabel}
        </Badge>

        {isEmpty ? (
          <span className="text-[11px] text-zinc-600 dark:text-zinc-400">
            {ar
              ? "لا مرفقات أو أدوات بعد — ابدأ برفع مستند أو أمر."
              : "No attachments or tools yet — upload a doc or send a command."}
          </span>
        ) : (
          <>
            <span className="inline-flex items-center gap-1 text-[11px] text-zinc-600 dark:text-zinc-400">
              <FileText className="size-3.5 text-teal-600" />
              {pulse.attachments.total} {ar ? "مستند" : "docs"}
              {topCategory ? (
                <span className="font-mono text-[10px] opacity-70">
                  · {topCategory[0]} ×{topCategory[1]}
                </span>
              ) : null}
            </span>

            <span className="inline-flex items-center gap-1 text-[11px] text-zinc-600 dark:text-zinc-400">
              <CheckCircle2 className="size-3.5 text-emerald-600" />
              {pulse.actions.succeeded} {ar ? "أداة نجحت" : "tools ok"}
            </span>

            {pulse.actions.failed > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] text-red-600 dark:text-red-300">
                <XCircle className="size-3.5" />
                {pulse.actions.failed} {ar ? "فشلت" : "failed"}
              </span>
            )}

            {pulse.activity.extensionCaptures > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] text-zinc-600 dark:text-zinc-400">
                <Puzzle className="size-3.5 text-cyan-600" />
                {pulse.activity.extensionCaptures}{" "}
                {ar ? "التقاط من الامتداد" : "extension captures"}
              </span>
            )}

            {pulse.attachments.needsClarification > 0 && (
              <Badge
                variant="outline"
                className="rounded-full text-[10px] border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200"
              >
                {pulse.attachments.needsClarification}{" "}
                {ar ? "يحتاج توضيحاً" : "need clarification"}
              </Badge>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}
