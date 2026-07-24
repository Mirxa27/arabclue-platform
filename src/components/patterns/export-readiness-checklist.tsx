"use client";

import { AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ExportIssue = {
  code: string;
  severity: string;
  message: string;
};

export function ExportReadinessChecklist({
  locale,
  exportReady,
  exportBlocker,
  issues,
  onOpenValidation,
  className,
}: {
  locale: "ar" | "en";
  exportReady?: boolean;
  exportBlocker?: { code: string; error: string } | null;
  issues?: ExportIssue[];
  onOpenValidation?: () => void;
  className?: string;
}) {
  const ar = locale === "ar";
  const blockers = (issues ?? []).filter(
    (i) => i.severity === "error" || i.severity === "blocking"
  );
  const ready = Boolean(exportReady);

  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2.5 text-xs",
        ready
          ? "border-emerald-500/30 bg-emerald-500/5"
          : "border-amber-500/30 bg-amber-500/5",
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {ready ? (
          <CheckCircle2 className="size-3.5 text-emerald-600 shrink-0" />
        ) : (
          <ShieldAlert className="size-3.5 text-amber-700 shrink-0" />
        )}
        <span className="font-medium">
          {ready
            ? ar
              ? "جاهز لتصدير حزمة العطاء"
              : "Ready to export bid package"
            : ar
              ? "التصدير محظور حتى تُحل العوائق"
              : "Export blocked until issues are resolved"}
        </span>
        <Badge
          variant={ready ? "default" : "destructive"}
          className="text-[10px] h-5"
        >
          {ready ? (ar ? "جاهز" : "Ready") : ar ? "محظور" : "Blocked"}
        </Badge>
        {onOpenValidation ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 text-[11px] ms-auto"
            onClick={onOpenValidation}
          >
            {ar ? "التفاصيل" : "Details"}
          </Button>
        ) : null}
      </div>
      {!ready && exportBlocker?.error ? (
        <p className="mt-1.5 text-destructive flex items-start gap-1.5">
          <AlertTriangle className="size-3 mt-0.5 shrink-0" />
          <span>{exportBlocker.error}</span>
        </p>
      ) : null}
      {!ready && blockers.length > 0 ? (
        <ul className="mt-2 space-y-1 text-muted-foreground">
          {blockers.slice(0, 4).map((issue, i) => (
            <li key={`${issue.code}-${i}`} className="flex gap-2">
              <span className="font-mono text-[10px] shrink-0">{issue.code}</span>
              <span className="truncate">{issue.message}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
