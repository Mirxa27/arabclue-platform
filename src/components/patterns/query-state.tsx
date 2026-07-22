"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ListSkeleton } from "@/components/dashboard/loading-skeletons";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("p-10 text-center", className)}>
      <Icon className="size-9 text-muted-foreground/30 mx-auto mb-3" />
      <p className="text-xs font-medium text-foreground/80">{title}</p>
      {description ? (
        <p className="text-[11px] text-muted-foreground mt-1 max-w-xs mx-auto">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-3 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
  retryLabel = "Retry",
  className,
}: {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}) {
  return (
    <div className={cn("p-8 text-center space-y-2", className)}>
      <AlertCircle className="size-8 text-destructive/50 mx-auto" />
      <p className="text-xs text-destructive">{message}</p>
      {onRetry ? (
        <Button size="sm" variant="outline" onClick={onRetry}>
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Standard loading / error / empty / content branch for data panels.
 */
export function QueryState({
  isLoading,
  isError,
  errorMessage,
  isEmpty,
  onRetry,
  locale = "en",
  loading,
  empty,
  children,
}: {
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
  isEmpty: boolean;
  onRetry?: () => void;
  locale?: "ar" | "en";
  loading?: ReactNode;
  empty: ReactNode;
  children: ReactNode;
}) {
  if (isLoading) {
    return <>{loading ?? <ListSkeleton rows={3} />}</>;
  }
  if (isError) {
    return (
      <ErrorState
        message={errorMessage ?? (locale === "ar" ? "حدث خطأ" : "Something went wrong")}
        onRetry={onRetry}
        retryLabel={locale === "ar" ? "إعادة المحاولة" : "Retry"}
      />
    );
  }
  if (isEmpty) {
    return <>{empty}</>;
  }
  return <>{children}</>;
}
