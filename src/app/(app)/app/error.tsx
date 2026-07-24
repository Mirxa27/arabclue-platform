"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[arabclue] app workspace error", error);
  }, [error]);

  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center gap-3 p-8">
      <h2 className="text-lg font-semibold">Workspace error</h2>
      <p className="text-sm text-muted-foreground text-center max-w-sm">
        The dashboard failed to render. Retry without leaving the app shell.
      </p>
      {error.digest ? (
        <p className="text-[11px] font-mono text-muted-foreground">
          {error.digest}
        </p>
      ) : null}
      <Button size="sm" onClick={reset}>
        Retry
      </Button>
    </div>
  );
}
