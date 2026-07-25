"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { TheaterToolEvent } from "@/lib/agents/platform/mission-tool-parts";

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
        "relative flex min-h-0 w-full min-w-0 max-w-full flex-1 flex-col rounded-[18px] sm:rounded-[20px] transition-[border-color,background-color,box-shadow] duration-500 ease-out will-change-transform transform-gpu",
        performing
          ? "border border-teal-500/20 dark:border-teal-400/15 bg-teal-500/[0.03] dark:bg-teal-500/[0.04] shadow-[0_0_0_1px_rgba(20,184,166,0.08),0_0_32px_-16px_rgba(20,184,166,0.28)]"
          : "border border-transparent bg-transparent",
        className
      )}
    >
      {performing ? (
        <motion.div
          className="pointer-events-none absolute inset-0 rounded-[inherit] overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          aria-hidden
        >
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-teal-400/30 to-transparent" />
          <motion.div className="absolute inset-0 bg-[radial-gradient(80%_60%_at_20%_0%,rgba(20,184,166,0.08),transparent_70%)]" animate={{ opacity: [0.6, 1, 0.6] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }} />
        </motion.div>
      ) : null}
      <div className="relative flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
