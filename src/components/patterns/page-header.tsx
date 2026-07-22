"use client";

import type { ReactNode } from "react";
import { Lock, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

type BadgeVariant = "compliance" | "admin" | "none";

const BADGE: Record<
  Exclude<BadgeVariant, "none">,
  { className: string; icon: typeof Sparkles; labelEn: string; labelAr: string }
> = {
  compliance: {
    className:
      "text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border-emerald-500/20",
    icon: Sparkles,
    labelEn: "C1 Compliance",
    labelAr: "امتثال C1",
  },
  admin: {
    className: "text-amber-700 dark:text-amber-300 bg-amber-500/10 border-amber-500/20",
    icon: Lock,
    labelEn: "Admin Access",
    labelAr: "وصول المسؤول",
  },
};

export function PageHeader({
  title,
  subtitle,
  badge = "compliance",
  locale = "en",
  actions,
  className,
}: {
  title: string;
  subtitle: string;
  badge?: BadgeVariant;
  locale?: "ar" | "en";
  actions?: ReactNode;
  className?: string;
}) {
  const meta = badge !== "none" ? BADGE[badge] : null;
  const Icon = meta?.icon;
  const isAdmin = badge === "admin";

  return (
    <div
      className={cn(
        "mb-4 flex flex-wrap items-center justify-between gap-3",
        className
      )}
    >
      <div className="min-w-0">
        <h1
          className={cn(
            "text-lg lg:text-xl font-bold tracking-tight",
            isAdmin && "flex items-center gap-2"
          )}
        >
          {isAdmin && <Lock className="size-4 text-amber-600 shrink-0" />}
          {title}
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
      </div>
      <div className="flex items-center gap-2">
        {actions}
        {meta && Icon && (
          <div
            className={cn(
              "hidden sm:flex items-center gap-1.5 text-[10px] font-medium border px-2.5 py-1 rounded-full",
              meta.className
            )}
          >
            <Icon className="size-2.5" />
            {locale === "ar" ? meta.labelAr : meta.labelEn}
          </div>
        )}
      </div>
    </div>
  );
}

/** Standard page section wrapper used by all dashboard views. */
export function PageSection({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("space-y-4", className)}>{children}</div>;
}
