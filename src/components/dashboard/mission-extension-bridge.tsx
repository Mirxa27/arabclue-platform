"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  ArrowUpCircle,
  CheckCircle2,
  Circle,
  Download,
  Loader2,
  Puzzle,
  RefreshCw,
  Sparkles,
  Wand2,
} from "lucide-react";

type Props = {
  locale: "ar" | "en";
  onExtensionEvent?: (data: unknown) => void;
  /**
   * Auto-open the install wizard when the extension is missing.
   * Default false — the extension is optional, not required.
   */
  autoPrompt?: boolean;
};

type StepId =
  | "download"
  | "unzip"
  | "extensions"
  | "developer"
  | "load"
  | "verify";

const DISMISS_KEY = "arabclue.extension.install.dismissed";

/** Returns true when `installed` is older than `latest` (loose semver). */
export function isVersionOutdated(installed: string, latest: string): boolean {
  const parse = (v: string) =>
    v
      .replace(/^v/i, "")
      .split(".")
      .map((n) => Number.parseInt(n, 10) || 0);
  const a = parse(installed);
  const b = parse(latest);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    if (ai < bi) return true;
    if (ai > bi) return false;
  }
  return false;
}

function useExtensionPresence(onExtensionEvent?: (data: unknown) => void) {
  const [present, setPresent] = useState<boolean | null>(null);
  const [lastEvent, setLastEvent] = useState<string | null>(null);
  const [version, setVersion] = useState<string | null>(null);

  const ping = useCallback(() => {
    // Dual channel: custom DOM event + postMessage (content script listens to both)
    window.dispatchEvent(new Event("arabclue-extension-ping"));
    window.postMessage(
      { source: "arabclue-page", type: "extension-ping" },
      window.location.origin
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    let sawPong = false;

    const markPresent = (v?: string | null) => {
      if (cancelled) return;
      sawPong = true;
      setPresent(true);
      if (v) setVersion(v);
    };

    const onReady = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as { version?: string } | undefined;
      markPresent(detail?.version ?? null);
    };
    const onPong = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as {
        ok?: boolean;
        version?: string;
      };
      if (cancelled) return;
      if (detail?.ok) markPresent(detail.version ?? null);
      else if (!sawPong) setPresent(false);
    };
    const onEvent = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as {
        event?: string;
        data?: unknown;
        type?: string;
      };
      if (
        detail?.event === "extension-ingest" ||
        detail?.type === "extension-event"
      ) {
        setLastEvent("extension-ingest");
        markPresent(null);
        onExtensionEvent?.(detail.data);
      }
    };
    const onMessage = (ev: MessageEvent) => {
      if (ev.origin !== window.location.origin) return;
      if (ev.source !== window) return;
      const data = ev.data as {
        source?: string;
        type?: string;
        event?: string;
        data?: unknown;
        ok?: boolean;
        version?: string;
      };
      if (data?.source !== "arabclue-extension") return;
      if (data.type === "extension-ready" || data.type === "extension-pong") {
        if (data.ok !== false) markPresent(data.version ?? null);
        return;
      }
      if (data.type === "extension-event" && data.event === "extension-ingest") {
        setLastEvent("extension-ingest");
        markPresent(null);
        onExtensionEvent?.(data.data);
      }
    };

    window.addEventListener("arabclue-extension-ready", onReady);
    window.addEventListener("arabclue-extension-pong", onPong);
    window.addEventListener("arabclue-extension-event", onEvent);
    window.addEventListener("message", onMessage);
    ping();

    // First verdict after a short wait; keep light polling so late injects link up
    const t = window.setTimeout(() => {
      if (!cancelled && !sawPong) setPresent(false);
    }, 1200);
    const poll = window.setInterval(() => {
      if (!cancelled) ping();
    }, 4000);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
      window.clearInterval(poll);
      window.removeEventListener("arabclue-extension-ready", onReady);
      window.removeEventListener("arabclue-extension-pong", onPong);
      window.removeEventListener("arabclue-extension-event", onEvent);
      window.removeEventListener("message", onMessage);
    };
  }, [onExtensionEvent, ping]);

  return { present, lastEvent, version, ping, setPresent };
}

/**
 * Optional Chrome extension uplink for Mission Control.
 * Never blocks core Mission Control — install is opt-in via Smart install.
 */
export function MissionExtensionBridge({
  locale,
  onExtensionEvent,
  autoPrompt = false,
}: Props) {
  const ar = locale === "ar";
  const { present, lastEvent, version, ping } =
    useExtensionPresence(onExtensionEvent);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<StepId>("download");
  const [downloading, setDownloading] = useState(false);
  const [metaVersion, setMetaVersion] = useState<string>("1.0.0");
  const [checking, setChecking] = useState(false);
  const [wizardMode, setWizardMode] = useState<"install" | "update">("install");

  const updateAvailable = Boolean(
    present && version && isVersionOutdated(version, metaVersion)
  );

  useEffect(() => {
    void fetch("/api/platform-agent/extension")
      .then((r) => r.json())
      .then((d) => {
        if (d?.version) setMetaVersion(String(d.version));
      })
      .catch(() => undefined);
  }, []);

  // Optional auto-prompt only when explicitly enabled
  useEffect(() => {
    if (!autoPrompt || present !== false) return;
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {
      /* ignore */
    }
    setWizardMode("install");
    setOpen(true);
    setStep("download");
  }, [autoPrompt, present]);

  useEffect(() => {
    if (!open) return;
    if (present && wizardMode !== "update") return;
    const id = window.setInterval(() => ping(), 1500);
    return () => window.clearInterval(id);
  }, [open, present, wizardMode, ping]);

  useEffect(() => {
    if (present && open && wizardMode === "install") setStep("verify");
  }, [present, open, wizardMode]);

  useEffect(() => {
    if (open && wizardMode === "update" && present && !updateAvailable) {
      setStep("verify");
    }
  }, [open, wizardMode, present, updateAvailable]);

  const steps = useMemo(
    () =>
      [
        {
          id: "download" as const,
          title: ar ? "حمّل الحزمة" : "Download package",
          body: ar
            ? "نزّل ملف ZIP للامتداد مباشرة من ArabClue."
            : "Download the extension ZIP straight from ArabClue.",
        },
        {
          id: "unzip" as const,
          title: ar ? "فك الضغط" : "Unzip",
          body: ar
            ? "فك الضغط لتحصل على مجلد arabclue-agent."
            : "Unzip to get the arabclue-agent folder.",
        },
        {
          id: "extensions" as const,
          title: ar ? "افتح إعدادات الامتدادات" : "Open Chrome extensions",
          body: ar
            ? "في شريط العنوان اكتب: chrome://extensions"
            : "In the address bar open: chrome://extensions",
        },
        {
          id: "developer" as const,
          title: ar ? "فعّل وضع المطوّر" : "Enable Developer mode",
          body: ar
            ? "فعّل Developer mode من الزاوية العلوية."
            : "Toggle Developer mode in the top-right.",
        },
        {
          id: "load" as const,
          title:
            wizardMode === "update"
              ? ar
                ? "استبدل ثم أعد التحميل"
                : "Replace & reload"
              : ar
                ? "Load unpacked"
                : "Load unpacked",
          body:
            wizardMode === "update"
              ? ar
                ? "استبدل محتوى مجلد arabclue-agent بالجديد ثم اضغط ⟳ Reload."
                : "Replace the arabclue-agent folder contents, then click ⟳ Reload."
              : ar
                ? "اضغط Load unpacked واختر مجلد arabclue-agent."
                : "Click Load unpacked and select the arabclue-agent folder.",
        },
        {
          id: "verify" as const,
          title: ar ? "تحقق من الربط" : "Verify link",
          body: ar
            ? "أعد تحميل تبويب ArabClue هذا ثم اضغط تحقق — نكتشف الامتداد تلقائياً."
            : "Refresh this ArabClue tab, then Check now — we detect the extension automatically.",
        },
      ] as const,
    [ar, wizardMode]
  );

  const stepIndex = steps.findIndex((s) => s.id === step);

  async function downloadZip() {
    setDownloading(true);
    try {
      const res = await fetch("/api/platform-agent/extension/download");
      if (!res.ok) throw new Error("download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "arabclue-voice-agent.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setStep("unzip");
    } catch {
      /* keep step */
    } finally {
      setDownloading(false);
    }
  }

  async function recheck() {
    setChecking(true);
    ping();
    window.setTimeout(() => setChecking(false), 800);
  }

  function dismiss(forSession = true) {
    setOpen(false);
    if (forSession) {
      try {
        sessionStorage.setItem(DISMISS_KEY, "1");
      } catch {
        /* ignore */
      }
    }
  }

  return (
    <>
      <div
        className={cn(
          "rounded-2xl border px-4 py-3 flex flex-wrap items-center justify-between gap-3",
          "border-border/70 bg-muted/20",
          present === true &&
            "border-cyan-500/25 bg-[linear-gradient(120deg,rgba(13,148,136,0.1),rgba(8,145,178,0.06),transparent)]"
        )}
      >
        <div className="flex items-start gap-3 min-w-0">
          <div className="mt-0.5 flex size-9 items-center justify-center rounded-full border border-border/60 bg-background">
            <Puzzle className="size-4 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold">
                {ar
                  ? "امتداد كروم (اختياري)"
                  : "Chrome extension (optional)"}
              </p>
              <Badge variant="outline" className="text-[10px]">
                {ar ? "غير إلزامي" : "not required"}
              </Badge>
              <Badge
                variant={present ? "secondary" : "outline"}
                className={cn(
                  "text-[10px]",
                  present &&
                    "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200"
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
              {(version || metaVersion) && present && (
                <Badge variant="outline" className="text-[10px] font-mono">
                  v{version || metaVersion}
                </Badge>
              )}
              {updateAvailable && (
                <Badge className="text-[10px] gap-1 bg-amber-500/20 text-amber-800 dark:text-amber-200 border border-amber-500/50 hover:bg-amber-500/25">
                  <ArrowUpCircle className="size-3" />
                  {ar ? `تحديث v${metaVersion}` : `Update v${metaVersion}`}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {present
                ? ar
                  ? "الامتداد يغذي Mission Control من أي تبويب — اختياري ويقوّي الوكيل."
                  : "Extension feeds Mission Control from any tab — optional uplink that strengthens the agent."
                : ar
                  ? "Mission Control يعمل بالكامل بدونه. ثبّته فقط إذا أردت التقاط تبويبات خارجية."
                  : "Mission Control works fully without it. Install only if you want to capture external browser tabs."}
            </p>
            {lastEvent ? (
              <p className="text-[11px] text-teal-700 dark:text-teal-300 mt-1 flex items-center gap-1">
                <Sparkles className="size-3" />
                {ar
                  ? "تم استلام التقاط من الامتداد"
                  : "Extension capture received"}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {present && updateAvailable && (
            <Button
              type="button"
              size="sm"
              className="gap-1 bg-amber-600 hover:bg-amber-600/90 text-white"
              onClick={() => {
                setWizardMode("update");
                setOpen(true);
                setStep("download");
              }}
            >
              <ArrowUpCircle className="size-3.5" />
              {ar ? "حدّث الآن" : "Update now"}
            </Button>
          )}
          {present ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1"
              onClick={() => void recheck()}
            >
              <RefreshCw
                className={cn("size-3.5", checking && "animate-spin")}
              />
              {ar ? "إعادة فحص" : "Recheck"}
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1"
              onClick={() => {
                setWizardMode("install");
                setOpen(true);
                setStep("download");
              }}
            >
              <Wand2 className="size-3.5" />
              {ar ? "تثبيت اختياري" : "Optional install"}
            </Button>
          )}
        </div>
      </div>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!v) dismiss(true);
          else setOpen(true);
        }}
      >
        <DialogContent className="max-w-lg border-cyan-500/30 bg-gradient-to-b from-background via-teal-500/[0.04] to-background">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-full border border-cyan-400/40 bg-cyan-500/10">
                <Puzzle className="size-4 text-cyan-700" />
              </span>
              {wizardMode === "update"
                ? ar
                  ? `تحديث الامتداد إلى v${metaVersion}`
                  : `Update extension to v${metaVersion}`
                : ar
                  ? "تثبيت اختياري لامتداد الوكيل"
                  : "Optional Voice Agent extension"}
            </DialogTitle>
            <DialogDescription>
              {wizardMode === "update"
                ? ar
                  ? "نزّل الحزمة الجديدة واستبدل المجلد ثم أعد تحميل الامتداد."
                  : "Download the new package, replace the folder, and reload the extension."
                : ar
                  ? "اختياري بالكامل — Mission Control يعمل بدونه. يقوّي الوكيل بالتقاط أي تبويب."
                  : "Fully optional — Mission Control works without it. Strengthens the agent by capturing any browser tab."}
            </DialogDescription>
          </DialogHeader>

          {present && (wizardMode === "install" || !updateAvailable) ? (
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm space-y-2">
              <div className="flex items-center gap-2 font-semibold text-emerald-800 dark:text-emerald-200">
                <CheckCircle2 className="size-4" />
                {wizardMode === "update"
                  ? ar
                    ? "تم التحديث بنجاح"
                    : "Updated successfully"
                  : ar
                    ? "الامتداد متصل بنجاح"
                    : "Extension linked successfully"}
              </div>
              <p className="text-muted-foreground text-xs">
                {ar
                  ? "افتح لوحة الامتداد من أي تبويب وابعث الصفحة إلى Mission Control. تأكد أن API base = https://arabclue.com (بدون /app)."
                  : "Open the extension side panel on any tab and beam the page into Mission Control. Keep API base = https://arabclue.com (no /app)."}
              </p>
              <Button type="button" onClick={() => dismiss(false)}>
                {ar ? "متابعة" : "Continue"}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <ol className="space-y-2">
                {steps.map((s, i) => {
                  const done =
                    i < stepIndex || (s.id === "verify" && present === true);
                  const active = s.id === step;
                  return (
                    <li
                      key={s.id}
                      className={cn(
                        "rounded-xl border px-3 py-2.5 text-sm transition-colors",
                        active &&
                          "border-cyan-500/45 bg-cyan-500/5 mission-tool-live",
                        done &&
                          !active &&
                          "border-emerald-500/30 bg-emerald-500/5",
                        !done && !active && "border-border/70"
                      )}
                    >
                      <button
                        type="button"
                        className="w-full text-start flex gap-2"
                        onClick={() => setStep(s.id)}
                      >
                        {done ? (
                          <CheckCircle2 className="size-4 mt-0.5 text-emerald-600 shrink-0" />
                        ) : active ? (
                          <Loader2 className="size-4 mt-0.5 animate-spin text-cyan-600 shrink-0" />
                        ) : (
                          <Circle className="size-4 mt-0.5 text-muted-foreground shrink-0" />
                        )}
                        <span className="min-w-0">
                          <span className="font-semibold block">{s.title}</span>
                          <span className="text-xs text-muted-foreground">
                            {s.body}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>

              <div className="flex flex-wrap gap-2">
                {step === "download" || step === "unzip" ? (
                  <Button
                    type="button"
                    className="gap-1"
                    disabled={downloading}
                    onClick={() => void downloadZip()}
                  >
                    {downloading ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Download className="size-3.5" />
                    )}
                    {ar ? "تنزيل ZIP" : "Download ZIP"}
                  </Button>
                ) : null}
                {step === "unzip" ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setStep("extensions")}
                  >
                    {ar ? "تم فك الضغط" : "I unzipped it"}
                  </Button>
                ) : null}
                {step === "extensions" || step === "developer" ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() =>
                      setStep(step === "extensions" ? "developer" : "load")
                    }
                  >
                    {ar ? "التالي" : "Next"}
                  </Button>
                ) : null}
                {step === "load" || step === "verify" ? (
                  <>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => window.location.reload()}
                    >
                      {ar ? "أعد تحميل الصفحة" : "Refresh page"}
                    </Button>
                    <Button
                      type="button"
                      className="gap-1"
                      onClick={() => void recheck()}
                    >
                      <RefreshCw
                        className={cn("size-3.5", checking && "animate-spin")}
                      />
                      {ar ? "تحقق الآن" : "Check now"}
                    </Button>
                  </>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => dismiss(true)}
                >
                  {ar ? "تخطي — غير مطلوب" : "Skip — not required"}
                </Button>
              </div>

              <p className="text-[11px] text-muted-foreground">
                {ar
                  ? "بعد Load unpacked أعد تحميل تبويب ArabClue. في اللوحة الجانبية اضبط API base على https://arabclue.com (بدون /app) وكن مسجّل الدخول."
                  : "After Load unpacked, refresh this ArabClue tab. In the side panel set API base to https://arabclue.com (no /app) and stay signed in."}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
