"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const TONE_CLASS = {
  primary: "bg-chart-1/10 text-chart-1 ring-chart-1/20",
  success: "bg-chart-3/10 text-chart-3 ring-chart-3/20",
  warning: "bg-chart-4/10 text-chart-4 ring-chart-4/20",
  accent: "bg-chart-5/10 text-chart-5 ring-chart-5/20",
  muted: "bg-muted text-muted-foreground ring-border/40",
} as const;

export type PanelTone = keyof typeof TONE_CLASS;

/**
 * Standard dashboard panel: icon header + optional actions + body.
 * Use for list cards, monitors, and form sections.
 */
export function Panel({
  icon: Icon,
  title,
  subtitle,
  tone = "primary",
  actions,
  children,
  className,
  bodyClassName,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  tone?: PanelTone;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <Card
      className={cn(
        "p-0 overflow-hidden border-border/50 shadow-sm gap-0",
        className
      )}
    >
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border/50 bg-gradient-to-b from-muted/40 to-transparent">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={cn(
              "size-8 rounded-lg flex items-center justify-center ring-1 shrink-0",
              TONE_CLASS[tone]
            )}
          >
            <Icon className="size-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold tracking-tight truncate">
              {title}
            </h3>
            {subtitle ? (
              <p className="text-[11px] text-muted-foreground truncate">
                {subtitle}
              </p>
            ) : null}
          </div>
        </div>
        {actions ? (
          <div className="flex items-center gap-2 shrink-0">{actions}</div>
        ) : null}
      </div>
      <div className={bodyClassName}>{children}</div>
    </Card>
  );
}
