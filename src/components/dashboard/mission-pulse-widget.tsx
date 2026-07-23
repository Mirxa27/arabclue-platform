"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Activity,
  CheckCircle2,
  FileText,
  Puzzle,
  XCircle,
} from "lucide-react";
import type { MissionPulse } from "@/lib/agents/platform/mission-pulse";

type Props = {
  locale: "ar" | "en";
  missionId: string | null;
  /** Bump to force an immediate refresh (e.g. when the execution feed changes). */
  refreshKey?: number;
  className?: string;
};

const HEALTH_STYLES: Record<MissionPulse["health"], string> = {
  thriving:
    "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 border-emerald-500/40",
  active: "bg-cyan-500/15 text-cyan-800 dark:text-cyan-200 border-cyan-500/40",
  idle: "bg-muted text-muted-foreground border-border",
};

/** Compact live analytics strip for the active Mission Control session. */
export function MissionPulseWidget({
  locale,
  missionId,
  refreshKey = 0,
  className,
}: Props) {
  const ar = locale === "ar";
  const [pulse, setPulse] = useState<MissionPulse | null>(null);

  useEffect(() => {
    if (!missionId) return;
    let cancelled = false;

    const load = () =>
      fetch(`/api/platform-agent/missions/${missionId}/pulse`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (!cancelled && data?.pulse) setPulse(data.pulse as MissionPulse);
        })
        .catch(() => undefined);

    void load();
    const id = window.setInterval(() => void load(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [missionId, refreshKey]);

  if (!pulse || (pulse.attachments.total === 0 && pulse.actions.total === 0)) {
    return null;
  }

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
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-2xl border border-teal-500/20 bg-[linear-gradient(110deg,rgba(13,148,136,0.07),transparent_60%)] px-4 py-2",
        className
      )}
      dir={ar ? "rtl" : "ltr"}
    >
      <Badge
        variant="outline"
        className={cn("gap-1 text-[10px]", HEALTH_STYLES[pulse.health])}
      >
        <Activity className="size-3" />
        {ar ? "نبض المهمة:" : "Mission pulse:"} {healthLabel}
      </Badge>

      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <FileText className="size-3.5 text-teal-600" />
        {pulse.attachments.total} {ar ? "مستند" : "docs"}
        {topCategory ? (
          <span className="font-mono text-[10px] opacity-70">
            · {topCategory[0]} ×{topCategory[1]}
          </span>
        ) : null}
      </span>

      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <CheckCircle2 className="size-3.5 text-emerald-600" />
        {pulse.actions.succeeded} {ar ? "أداة نجحت" : "tools ok"}
      </span>

      {pulse.actions.failed > 0 && (
        <span className="inline-flex items-center gap-1 text-xs text-destructive">
          <XCircle className="size-3.5" />
          {pulse.actions.failed} {ar ? "فشلت" : "failed"}
        </span>
      )}

      {pulse.activity.extensionCaptures > 0 && (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Puzzle className="size-3.5 text-cyan-600" />
          {pulse.activity.extensionCaptures}{" "}
          {ar ? "التقاط من الامتداد" : "extension captures"}
        </span>
      )}

      {pulse.attachments.needsClarification > 0 && (
        <Badge variant="outline" className="text-[10px] border-amber-500/50 text-amber-700 dark:text-amber-300">
          {pulse.attachments.needsClarification}{" "}
          {ar ? "يحتاج توضيحاً" : "need clarification"}
        </Badge>
      )}
    </div>
  );
}
