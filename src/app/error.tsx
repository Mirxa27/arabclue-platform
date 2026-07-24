"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[arabclue] route error", error);
  }, [error]);

  return (
    <main className="min-h-[70vh] flex flex-col items-center justify-center gap-4 px-6">
      <div className="text-center space-y-2 max-w-md">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-800/70">
          ArabClue
        </p>
        <h1 className="text-xl font-semibold tracking-tight">
          Something went wrong
        </h1>
        <p className="text-sm text-muted-foreground" dir="rtl">
          حدث خطأ غير متوقع
        </p>
        {error.digest ? (
          <p className="text-[11px] font-mono text-muted-foreground">
            {error.digest}
          </p>
        ) : null}
      </div>
      <div className="flex gap-2">
        <Button onClick={reset} size="sm">
          Try again
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href="/">Home</Link>
        </Button>
      </div>
    </main>
  );
}
