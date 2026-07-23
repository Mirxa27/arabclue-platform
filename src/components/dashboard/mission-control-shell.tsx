"use client";

import { useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  ChevronUp,
  Mic,
  Paperclip,
  Radio,
} from "lucide-react";

type Mode = "live" | "classic";

type Props = {
  locale: "ar" | "en";
  title: string;
  subtitle: string;
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  liveEnabled: boolean;
  liveHint?: string | null;
  liveModelLabel?: string | null;
  performing?: boolean;
  statusBadges?: ReactNode;
  kit: ReactNode;
  kitMeta?: { files?: number; linked?: boolean };
  children: ReactNode;
  composer?: ReactNode;
};

/**
 * Voice Mission Control layout:
 * header (title + mode) → kit drawer → stage → composer.
 */
export function MissionControlShell({
  locale,
  title,
  subtitle,
  mode,
  onModeChange,
  liveEnabled,
  liveHint,
  liveModelLabel,
  performing,
  statusBadges,
  kit,
  kitMeta,
  children,
  composer,
}: Props) {
  const ar = locale === "ar";
  const [kitOpen, setKitOpen] = useState(false);

  return (
    <div
      className="flex h-[calc(100vh-7.5rem)] min-h-[560px] flex-col gap-0 overflow-hidden rounded-2xl border border-border/70 bg-[linear-gradient(165deg,rgba(15,118,110,0.06),transparent_42%),linear-gradient(345deg,rgba(15,23,42,0.03),transparent_50%)]"
      dir={ar ? "rtl" : "ltr"}
    >
      <header className="shrink-0 border-b border-border/60 px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold tracking-tight sm:text-xl">
                {title}
              </h1>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium",
                  performing
                    ? "border-teal-600/30 bg-teal-600/10 text-teal-800 dark:text-teal-200"
                    : "border-border/70 bg-background/70 text-muted-foreground"
                )}
              >
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    performing ? "bg-teal-600 animate-pulse" : "bg-slate-400"
                  )}
                />
                {performing
                  ? ar
                    ? "يعمل الآن"
                    : "Working"
                  : ar
                    ? "جاهز"
                    : "Ready"}
              </span>
            </div>
            <p className="max-w-xl text-sm text-muted-foreground">{subtitle}</p>
          </div>

          <div className="flex flex-col items-stretch gap-2 sm:items-end">
            <div
              className="inline-flex rounded-lg border border-border/70 bg-background/80 p-0.5"
              role="group"
              aria-label={ar ? "وضع الصوت" : "Voice mode"}
            >
              <Button
                type="button"
                size="sm"
                variant={mode === "live" ? "default" : "ghost"}
                className="h-8 gap-1.5 rounded-md px-3"
                disabled={!liveEnabled}
                onClick={() => onModeChange("live")}
              >
                <Radio className="size-3.5" />
                {ar ? "مباشر" : "Live"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={mode === "classic" ? "default" : "ghost"}
                className="h-8 gap-1.5 rounded-md px-3"
                onClick={() => onModeChange("classic")}
              >
                <Mic className="size-3.5" />
                {ar ? "متصفح" : "Browser"}
              </Button>
            </div>
            {liveEnabled && liveModelLabel ? (
              <p className="font-mono text-[10px] text-muted-foreground">
                {liveModelLabel}
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                {ar ? "الصوت المباشر غير مفعّل" : "Live voice not enabled"}
              </p>
            )}
          </div>
        </div>

        {!liveEnabled && liveHint ? (
          <p className="mt-2 rounded-lg border border-amber-500/25 bg-amber-500/8 px-3 py-2 text-xs text-amber-950/80 dark:text-amber-100/80">
            <span className="font-medium">
              {ar ? "لماذا؟ " : "Why? "}
            </span>
            {liveHint}
          </p>
        ) : null}

        {statusBadges ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {statusBadges}
          </div>
        ) : null}
      </header>

      <section className="shrink-0 border-b border-border/50 bg-background/40">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-start transition-colors hover:bg-muted/40 sm:px-5"
          onClick={() => setKitOpen((v) => !v)}
          aria-expanded={kitOpen}
        >
          <span className="flex items-center gap-2 text-sm font-medium">
            <Paperclip className="size-4 text-muted-foreground" />
            {ar ? "ملفات المهمة" : "Mission files"}
            <span className="text-xs font-normal text-muted-foreground">
              {ar
                ? "رفع · امتداد · نبض النشاط"
                : "upload · extension · activity pulse"}
            </span>
          </span>
          <span className="flex items-center gap-2">
            {(kitMeta?.files ?? 0) > 0 ? (
              <Badge variant="outline" className="rounded-md text-[10px]">
                {kitMeta?.files} {ar ? "ملف" : "files"}
              </Badge>
            ) : (
              <span className="text-[11px] text-muted-foreground">
                {ar ? "لا ملفات بعد" : "No files yet"}
              </span>
            )}
            {kitOpen ? (
              <ChevronUp className="size-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="size-4 text-muted-foreground" />
            )}
          </span>
        </button>
        <div
          className={cn(
            "grid transition-[grid-template-rows] duration-300 ease-out",
            kitOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          )}
        >
          <div className="overflow-hidden">
            <div className="space-y-3 border-t border-border/40 px-4 py-3 sm:px-5">
              {kit}
            </div>
          </div>
        </div>
      </section>

      <div className="flex min-h-0 flex-1 flex-col gap-0 bg-background/30 px-3 py-3 sm:px-4">
        {children}
      </div>

      {composer ? (
        <div className="shrink-0 border-t border-border/60 bg-background/85 px-3 py-3 backdrop-blur-sm sm:px-4">
          {composer}
        </div>
      ) : null}
    </div>
  );
}
