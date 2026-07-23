"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CheckCircle2, Loader2, XCircle, Zap } from "lucide-react";

export type MissionFeedItem = {
  id: string;
  toolName: string;
  status: string;
  summary?: string;
  at?: string;
};

export function MissionExecutionFeed({
  locale,
  items,
}: {
  locale: "ar" | "en";
  items: MissionFeedItem[];
}) {
  const ar = locale === "ar";
  if (!items.length) {
    return (
      <p className="text-xs text-muted-foreground">
        {ar
          ? "سيظهر هنا تنفيذ الأدوات والوكلاء لحظة بلحظة."
          : "Tool and agent execution will stream here live."}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Zap className="size-3.5 text-amber-600" />
        {ar ? "أحداث الملفات" : "File events"}
      </div>
      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
        {items.map((item) => {
          const running =
            item.status === "RUNNING" ||
            item.status === "input-available" ||
            item.status === "input-streaming";
          const ok =
            item.status === "SUCCEEDED" || item.status === "output-available";
          const failed =
            item.status === "FAILED" || item.status === "output-error";
          return (
            <div
              key={item.id}
              className={cn(
                "rounded-lg border px-2.5 py-2 text-xs flex gap-2 transition-colors",
                running && "border-amber-500/40 bg-amber-500/5",
                ok && "border-emerald-500/40 bg-emerald-500/5",
                failed && "border-destructive/40 bg-destructive/5"
              )}
            >
              {running ? (
                <Loader2 className="size-3.5 mt-0.5 animate-spin text-amber-600" />
              ) : ok ? (
                <CheckCircle2 className="size-3.5 mt-0.5 text-emerald-600" />
              ) : (
                <XCircle className="size-3.5 mt-0.5 text-destructive" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold font-mono">{item.toolName}</span>
                  <Badge variant="outline" className="text-[10px] h-5">
                    {item.status}
                  </Badge>
                </div>
                {item.summary ? (
                  <p className="mt-1 text-muted-foreground line-clamp-3 whitespace-pre-wrap">
                    {item.summary}
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
