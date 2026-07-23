"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { TheaterToolEvent } from "@/lib/agents/platform/mission-tool-parts";

/**
 * Calm stage wrapper for Mission Control.
 * Kept as a stable export so call sites stay compatible after removing
 * the old glitter-cursor / particle theater.
 */
export function MissionPerformanceStage({
  locale,
  performing,
  tools: _tools,
  children,
  className,
}: {
  locale: "ar" | "en";
  performing: boolean;
  tools: TheaterToolEvent[];
  children: ReactNode;
  className?: string;
}) {
  void locale;
  void _tools;

  return (
    <div
      className={cn(
        "relative flex min-h-0 flex-1 flex-col rounded-xl transition-[border-color,background-color] duration-300",
        performing
          ? "border border-teal-600/25 bg-teal-600/[0.03]"
          : "border border-transparent",
        className
      )}
    >
      {children}
    </div>
  );
}
