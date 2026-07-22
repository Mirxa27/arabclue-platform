"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function ListSkeleton({
  rows = 4,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn("p-4 space-y-3", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="space-y-2 rounded-lg border border-border/50 p-3">
          <Skeleton className="h-3.5 w-2/3" />
          <Skeleton className="h-2.5 w-1/3" />
          <Skeleton className="h-8 w-full" />
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("p-5 space-y-4", className)}>
      <Skeleton className="h-4 w-32" />
      <div className="flex items-end gap-2 h-36">
        {[40, 70, 55, 85, 45].map((h, i) => (
          <Skeleton
            key={i}
            className="flex-1 rounded-t-md"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
    </div>
  );
}

export function CardHeaderSkeleton() {
  return (
    <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border/60">
      <Skeleton className="size-8 rounded-lg" />
      <div className="space-y-1.5 flex-1">
        <Skeleton className="h-3.5 w-28" />
        <Skeleton className="h-2.5 w-40" />
      </div>
    </div>
  );
}
