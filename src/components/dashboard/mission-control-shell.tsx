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
  Sparkles,
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
 * Clean Mission Control composition:
 * header → optional kit (collapsed) → primary stage → composer.
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
      className="flex flex-col gap-3 h-[calc(100vh-8rem)] min-h-[560px]"
      dir={ar ? "rtl" : "ltr"}
    >
      <header className="shrink-0 space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
                {title}
              </h1>
              {performing ? (
                <Badge className="gap-1 bg-teal-700 animate-pulse">
                  <Sparkles className="size-3" />
                  {ar ? "ينفّذ حيّاً" : "Performing live"}
                </Badge>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
              {subtitle}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-full border border-border/70 bg-muted/30 p-0.5">
              <Button
                type="button"
                size="sm"
                variant={mode === "live" ? "default" : "ghost"}
                className="h-8 gap-1 rounded-full px-3"
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
                className="h-8 gap-1 rounded-full px-3"
                onClick={() => onModeChange("classic")}
              >
                <Mic className="size-3.5" />
                {ar ? "متصفح" : "Browser"}
              </Button>
            </div>
            {liveEnabled && liveModelLabel ? (
              <Badge variant="secondary" className="font-mono text-[10px]">
                {liveModelLabel}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                {ar ? "الصوت المباشر غير متاح" : "Live voice unavailable"}
              </Badge>
            )}
          </div>
        </div>

        {!liveEnabled && liveHint ? (
          <p className="text-xs text-muted-foreground rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
            {ar ? "سبب التعطيل: " : "Why it’s off: "}
            {liveHint}
          </p>
        ) : null}

        {statusBadges ? (
          <div className="flex flex-wrap items-center gap-2">{statusBadges}</div>
        ) : null}
      </header>

      <section className="shrink-0 rounded-2xl border border-border/60 bg-muted/15 overflow-hidden">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-start hover:bg-muted/30 transition-colors"
          onClick={() => setKitOpen((v) => !v)}
          aria-expanded={kitOpen}
        >
          <span className="flex items-center gap-2 text-sm font-medium">
            <Paperclip className="size-4 text-muted-foreground" />
            {ar ? "عدة المهمة" : "Mission kit"}
            <span className="text-xs font-normal text-muted-foreground">
              {ar
                ? "ملفات · امتداد اختياري · نبض"
                : "files · optional extension · pulse"}
            </span>
          </span>
          <span className="flex items-center gap-2">
            {(kitMeta?.files ?? 0) > 0 ? (
              <Badge variant="outline" className="text-[10px]">
                {kitMeta?.files} {ar ? "ملف" : "files"}
              </Badge>
            ) : null}
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
            <div className="space-y-3 border-t border-border/50 px-3 py-3">
              {kit}
            </div>
          </div>
        </div>
      </section>

      <div className="flex min-h-0 flex-1 flex-col gap-3">{children}</div>

      {composer ? <div className="shrink-0">{composer}</div> : null}
    </div>
  );
}
