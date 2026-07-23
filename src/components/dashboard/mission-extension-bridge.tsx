"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Puzzle, Sparkles, ExternalLink } from "lucide-react";

type Props = {
  locale: "ar" | "en";
  onExtensionEvent?: (data: unknown) => void;
};

/**
 * Detects the ArabClue Chrome extension bridge and surfaces install / live uplink status.
 */
export function MissionExtensionBridge({ locale, onExtensionEvent }: Props) {
  const ar = locale === "ar";
  const [present, setPresent] = useState<boolean | null>(null);
  const [lastEvent, setLastEvent] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const onReady = () => {
      if (!cancelled) setPresent(true);
    };
    const onPong = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as { ok?: boolean } | undefined;
      if (!cancelled) setPresent(Boolean(detail?.ok));
    };
    const onEvent = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as {
        event?: string;
        data?: unknown;
      };
      if (detail?.event === "extension-ingest") {
        setLastEvent(
          ar ? "تم استلام التقاط من الامتداد" : "Extension capture received"
        );
        onExtensionEvent?.(detail.data);
      }
    };
    const onMessage = (ev: MessageEvent) => {
      if (ev.origin !== window.location.origin) return;
      const data = ev.data as {
        source?: string;
        type?: string;
        event?: string;
        data?: unknown;
      };
      if (data?.source !== "arabclue-extension") return;
      if (data.type === "extension-event" && data.event === "extension-ingest") {
        setLastEvent(
          ar ? "تم استلام التقاط من الامتداد" : "Extension capture received"
        );
        setPresent(true);
        onExtensionEvent?.(data.data);
      }
    };

    window.addEventListener("arabclue-extension-ready", onReady);
    window.addEventListener("arabclue-extension-pong", onPong);
    window.addEventListener("arabclue-extension-event", onEvent);
    window.addEventListener("message", onMessage);
    window.dispatchEvent(new Event("arabclue-extension-ping"));

    const t = window.setTimeout(() => {
      if (!cancelled) setPresent((p) => (p == null ? false : p));
    }, 900);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
      window.removeEventListener("arabclue-extension-ready", onReady);
      window.removeEventListener("arabclue-extension-pong", onPong);
      window.removeEventListener("arabclue-extension-event", onEvent);
      window.removeEventListener("message", onMessage);
    };
  }, [ar, onExtensionEvent]);

  return (
    <div
      className={cn(
        "rounded-2xl border px-4 py-3 flex flex-wrap items-center justify-between gap-3",
        "border-cyan-500/25 bg-[linear-gradient(120deg,rgba(13,148,136,0.1),rgba(8,145,178,0.06),transparent)]"
      )}
    >
      <div className="flex items-start gap-3 min-w-0">
        <div className="mt-0.5 flex size-9 items-center justify-center rounded-full border border-cyan-400/40 bg-cyan-500/10">
          <Puzzle className="size-4 text-cyan-700 dark:text-cyan-200" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">
              {ar ? "امتداد كروم للوكيل" : "Chrome Voice Agent extension"}
            </p>
            <Badge
              variant={present ? "secondary" : "outline"}
              className={cn(
                "text-[10px]",
                present && "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200"
              )}
            >
              {present == null
                ? ar
                  ? "يفحص…"
                  : "checking…"
                : present
                  ? ar
                    ? "متصل"
                    : "linked"
                  : ar
                    ? "غير مثبت"
                    : "not installed"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {present
              ? ar
                ? "الامتداد يغذي Mission Control من أي تبويب — شاهد التلألؤ أثناء التنفيذ."
                : "Extension feeds Mission Control from any tab — watch glitter while it performs."
              : ar
                ? "ثبّت الامتداد من مجلد extensions/arabclue-agent عبر chrome://extensions."
                : "Load unpacked from extensions/arabclue-agent via chrome://extensions."}
          </p>
          {lastEvent ? (
            <p className="text-[11px] text-teal-700 dark:text-teal-300 mt-1 flex items-center gap-1">
              <Sparkles className="size-3" />
              {lastEvent}
            </p>
          ) : null}
        </div>
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="gap-1"
        onClick={() => {
          window.open(
            "https://arabclue.com/app?view=copilot",
            "_blank",
            "noopener,noreferrer"
          );
        }}
      >
        <ExternalLink className="size-3.5" />
        {ar ? "Mission Control" : "Mission Control"}
      </Button>
    </div>
  );
}
