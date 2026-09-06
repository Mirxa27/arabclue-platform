"use client";

import { apiErrorText } from "@/lib/api-failure-message";

import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Maximize2,
  Minimize2,
  Printer,
  RefreshCw,
} from "lucide-react";
import { useArtifactDownload } from "@/hooks/use-artifact-download";
import { tr } from "@/lib/i18n";
import {
  createHtmlPreviewObjectUrl,
  createPdfPreviewObjectUrl,
  GENERATED_HTML_PREVIEW_SANDBOX,
} from "@/lib/file-delivery-policy";
import { synchronizeCurrentBilingualDocument } from "@/lib/layout-sync";
import {
  pdfPreviewSrc,
  type PdfPreviewZoom,
} from "@/lib/pdf-preview-view";

type Mode = "html" | "pdf";

type Props = {
  locale: "ar" | "en";
  proposalId: string;
  title?: string;
  /** Prefer html layout preview (instant) or binary pdf (Playwright). */
  defaultMode?: Mode;
  className?: string;
  compact?: boolean;
  /**
   * Bump after save (e.g. proposal.updatedAt) so HTML/PDF reloads.
   * Without this, Preview/PDF stay on the last fetched revision.
   */
  contentRevision?: string | number | null;
  /** True when the studio has unsaved markdown — show save-before-PDF banner. */
  stale?: boolean;
  onRequestSave?: () => void;
};

async function waitForPreviewAssets(document: Document): Promise<void> {
  await document.fonts.ready;
  const images = Array.from(document.images);
  await Promise.all(
    images.map(async (image) => {
      if (!image.complete) {
        await new Promise<void>((resolve, reject) => {
          image.addEventListener("load", () => resolve(), { once: true });
          image.addEventListener(
            "error",
            () => reject(new Error("A document preview image failed to load.")),
            { once: true },
          );
        });
      }
      if (typeof image.decode === "function") {
        await image.decode();
      }
    }),
  );
}

function bindBilingualViewerTabs(
  document: Document,
  onLanguageChange: () => void,
): void {
  const root = document.querySelector<HTMLElement>("[data-bilingual-document]");
  const tabs = document.querySelector<HTMLElement>(
    "[data-bilingual-viewer-tabs]",
  );
  if (
    !root ||
    !tabs ||
    root.dataset.viewerPreference !== "tabs" ||
    tabs.dataset.bilingualViewerBound === "true"
  ) {
    return;
  }
  const selectedLanguage = root.dataset.viewerLanguage === "en" ? "en" : "ar";
  tabs.replaceChildren();
  tabs.removeAttribute("role");
  tabs.setAttribute("aria-label", "Document language view");
  for (const [language, label] of [
    ["en", "English"],
    ["ar", "العربية"],
  ] as const) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.viewerLanguage = language;
    button.dataset.viewerDocument = tabs.dataset.viewerDocument ?? "";
    button.setAttribute("aria-pressed", String(language === selectedLanguage));
    button.textContent = label;
    tabs.append(button);
  }
  root.dataset.viewerMode = "tabs";
  tabs.dataset.bilingualViewerBound = "true";
  tabs.addEventListener("click", (event) => {
    const elementConstructor = document.defaultView?.Element;
    if (!elementConstructor || !(event.target instanceof elementConstructor)) {
      return;
    }
    const button = event.target.closest<HTMLButtonElement>(
      "button[data-viewer-language]",
    );
    const language = button?.dataset.viewerLanguage;
    if (language !== "en" && language !== "ar") return;
    root.dataset.viewerLanguage = language;
    tabs
      .querySelectorAll<HTMLButtonElement>("button[data-viewer-language]")
      .forEach((candidate) => {
        candidate.setAttribute(
          "aria-pressed",
          String(candidate.dataset.viewerLanguage === language),
        );
      });
    onLanguageChange();
  });
}

/**
 * In-app document viewer for proposals/contracts.
 * HTML mode uses a sandboxed iframe of the print layout.
 * PDF mode fetches bytes and embeds via blob URL (no sandbox — Chromium PDF).
 */
export function DocumentPreviewFrame({
  locale,
  proposalId,
  title,
  defaultMode = "html",
  className,
  compact,
  contentRevision,
  stale = false,
  onRequestSave,
}: Props) {
  const ar = locale === "ar";
  const [mode, setMode] = useState<Mode>(defaultMode);
  const [htmlSrc, setHtmlSrc] = useState<string | null>(null);
  const [pdfBase, setPdfBase] = useState<string | null>(null);
  const [pdfZoom, setPdfZoom] = useState<PdfPreviewZoom>("fitH");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const expandButtonRef = useRef<HTMLButtonElement>(null);
  const frameEventsRef = useRef<AbortController | null>(null);
  const readingPositionRef = useRef<{ key: string; top: number; left: number } | null>(null);
  const { download, busyFormat } = useArtifactDownload();
  const pdfCacheRef = useRef<{
    key: string;
    url: string;
  } | null>(null);

  const revisionKey = String(contentRevision ?? "0");
  const cacheKey = `${proposalId}:${revisionKey}:${locale}:${reloadNonce}`;

  const htmlUrl = useMemo(
    () =>
      `/api/proposals/${proposalId}/download?format=html&locale=${locale}`,
    [proposalId, locale],
  );
  const pdfUrl = useMemo(
    () =>
      `/api/proposals/${proposalId}/download?format=pdf&locale=${locale}`,
    [proposalId, locale],
  );

  const pdfSrc = pdfBase ? pdfPreviewSrc(pdfBase, pdfZoom) : null;

  const changeExpanded = (nextExpanded: boolean) => {
    const scrollingElement = mode === "html" ? iframeRef.current?.contentDocument?.scrollingElement : null;
    if (scrollingElement) {
      readingPositionRef.current = { key: cacheKey, top: scrollingElement.scrollTop, left: scrollingElement.scrollLeft };
    }
    frameEventsRef.current?.abort();
    setExpanded(nextExpanded);
  };

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError(null);
      setHtmlSrc(null);
      const failureMessage = locale === "ar"
        ? "تعذّر تحميل المستند. أعد المحاولة."
        : "Unable to load the document. Please try again.";

      try {
        if (mode === "html") {
          const res = await fetch(htmlUrl, { credentials: "include", signal: controller.signal });
          if (!res.ok) {
            const data = (await res.json().catch(() => ({}))) as {
              error?: string;
            };
            if (!cancelled) setError(apiErrorText(data, locale, failureMessage));
            return;
          }
          const html = await res.text();
          if (cancelled) return;
          objectUrl = createHtmlPreviewObjectUrl(html);
          if (!cancelled) setHtmlSrc(objectUrl);
          return;
        }

        const cached = pdfCacheRef.current;
        if (cached?.key === cacheKey) {
          if (!cancelled) {
            setPdfBase(cached.url);
            setLoading(false);
          }
          return;
        }

        if (pdfCacheRef.current?.url) {
          URL.revokeObjectURL(pdfCacheRef.current.url);
          pdfCacheRef.current = null;
        }
        setPdfBase(null);

        const res = await fetch(pdfUrl, { credentials: "include", signal: controller.signal });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          if (!cancelled) setError(apiErrorText(data, locale, failureMessage));
          return;
        }
        const bytes = await res.arrayBuffer();
        if (cancelled) return;
        objectUrl = createPdfPreviewObjectUrl(bytes);
        pdfCacheRef.current = { key: cacheKey, url: objectUrl };
        if (!cancelled) setPdfBase(objectUrl);
      } catch {
        if (!cancelled) {
          setError(failureMessage);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
      controller.abort();
      // Only revoke HTML blobs here; PDF cache is owned by pdfCacheRef.
      if (mode === "html" && objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [htmlUrl, pdfUrl, mode, cacheKey, locale]);

  useEffect(() => {
    return () => {
      frameEventsRef.current?.abort();
      if (pdfCacheRef.current?.url) {
        URL.revokeObjectURL(pdfCacheRef.current.url);
        pdfCacheRef.current = null;
      }
    };
  }, []);

  const viewer = (
    <div
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-lg border border-border/70 bg-background",
        className,
        expanded && "h-full min-h-0 w-full flex-1 rounded-none border-0",
      )}
      dir={ar ? "rtl" : "ltr"}
    >
      {/* Chrome: what this is, then one segmented control per decision
          (layout or PDF; how the PDF fits), then the actions. */}
      <div className="flex flex-col gap-3 border-b border-border/60 px-4 py-3">
        <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-3 sm:flex">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <FileText className="size-5" aria-hidden />
          </span>
          <p className="min-w-0 flex-1 break-words text-sm font-semibold leading-snug [overflow-wrap:anywhere]">
            {title || (ar ? "معاينة المستند" : "Document preview")}
          </p>
          <div className="col-span-2 flex shrink-0 flex-wrap items-center gap-2 sm:ms-auto">
            <Badge variant="outline" className="text-[10px] uppercase tabular-nums">
              {mode === "pdf" ? "PDF" : ar ? "تخطيط" : "Layout"}
            </Badge>
            {stale ? (
              <Badge variant="destructive" className="text-[10px]">
                {ar ? "مسودة غير محفوظة" : "Unsaved draft"}
              </Badge>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-border/70 bg-background p-0.5" role="group" aria-label={ar ? "وضع المعاينة" : "Preview mode"}>
            <Button
              type="button"
              size="sm"
              variant={mode === "html" ? "secondary" : "ghost"}
              aria-pressed={mode === "html"}
              className="h-9 px-3 text-xs"
              onClick={() => setMode("html")}
            >
              {ar ? "تخطيط" : "Layout"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === "pdf" ? "secondary" : "ghost"}
              aria-pressed={mode === "pdf"}
              className="h-9 px-3 text-xs"
              onClick={() => setMode("pdf")}
            >
              PDF
            </Button>
          </div>
          {mode === "pdf" ? (
            <div className="flex rounded-lg border border-border/70 bg-background p-0.5" role="group" aria-label={tr("preview_zoom_label", locale)}>
              {(
                [
                  ["fitH", ar ? "عرض" : "Width"],
                  ["fitV", ar ? "صفحة" : "Page"],
                  ["page", "100%"],
                ] as const
              ).map(([id, label]) => (
                <Button
                  key={id}
                  type="button"
                  size="sm"
                  variant={pdfZoom === id ? "secondary" : "ghost"}
                  aria-pressed={pdfZoom === id}
                  className="h-9 px-3 text-xs"
                  onClick={() => setPdfZoom(id)}
                >
                  {label}
                </Button>
              ))}
            </div>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="size-10 p-0"
            disabled={loading}
            onClick={() => setReloadNonce((n) => n + 1)}
            title={ar ? "تحديث المعاينة" : "Refresh preview"}
            aria-label={ar ? "تحديث المعاينة" : "Refresh preview"}
          >
            <RefreshCw className={cn("size-3.5", loading && "motion-safe:animate-spin")} />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-10 gap-2"
            disabled={busyFormat === "pdf" || stale}
            onClick={() =>
              void download({
                proposalId,
                format: "pdf",
                fallbackName: `${(title || "document").replace(/\s+/g, "_")}.pdf`,
                locale,
              })
            }
          >
            {busyFormat === "pdf" ? (
              <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden />
            ) : (
              <Download className="size-3.5" />
            )}
            {ar ? "تنزيل" : "Download"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="size-10 p-0"
            asChild
          >
            <a href={mode === "pdf" ? pdfUrl : htmlUrl} target="_blank" rel="noreferrer" title={ar ? "فتح في تبويب جديد" : "Open in new tab"} aria-label={ar ? "فتح في تبويب جديد" : "Open in new tab"}>
              <ExternalLink className="size-4" aria-hidden />
            </a>
          </Button>
          {mode === "html" ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="size-10 p-0"
              disabled={loading || Boolean(error) || !htmlSrc}
              title={ar ? "طباعة" : "Print"}
              aria-label={ar ? "طباعة" : "Print"}
              onClick={() => {
                iframeRef.current?.contentWindow?.print();
              }}
            >
              <Printer className="size-3.5" />
            </Button>
          ) : null}
          <Button ref={expandButtonRef} type="button" size="icon" variant="ghost" className="size-10" onClick={() => changeExpanded(!expanded)} aria-pressed={expanded} aria-haspopup={expanded ? undefined : "dialog"} title={expanded ? ar ? "تصغير العرض" : "Exit expanded view" : ar ? "توسيع العرض" : "Expand view"} aria-label={expanded ? ar ? "تصغير العرض" : "Exit expanded view" : ar ? "توسيع العرض" : "Expand view"}>
            {expanded ? <Minimize2 className="size-4" aria-hidden /> : <Maximize2 className="size-4" aria-hidden />}
          </Button>
        </div>
      </div>

      {stale ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-950 dark:text-amber-100">
          <AlertTriangle className="size-3.5 shrink-0" />
          <span className="flex-1 min-w-0">
            {ar
              ? "المعاينة الرسمية وPDF تعكسان آخر نسخة محفوظة. احفظ المسودة لتحديثهما."
              : "Official layout and PDF show the last saved revision. Save your draft to refresh them."}
          </span>
          {onRequestSave ? (
            <Button
              type="button"
              size="sm"
              className="h-7"
              onClick={onRequestSave}
            >
              {ar ? "حفظ الآن" : "Save now"}
            </Button>
          ) : null}
        </div>
      ) : null}

      <div
        aria-busy={loading}
        className={cn(
          "relative overflow-auto bg-muted/40 p-0 sm:p-5 scrollbar-thin",
          expanded ? "min-h-0 flex-1" : compact ? "h-[420px]" : "h-[min(75dvh,900px)] min-h-[360px]",
        )}
      >
        {loading ? (
          <div role="status" className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-background/90 text-sm text-muted-foreground">
            <Loader2 className="size-5 motion-safe:animate-spin" />
            {mode === "pdf"
              ? ar
                ? "جارٍ توليد PDF…"
                : "Rendering PDF…"
              : ar
                ? "جارٍ تحميل المعاينة…"
                : "Loading preview…"}
          </div>
        ) : null}
        {error ? (
          <div role="alert" className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-background p-6 text-center">
            <AlertTriangle className="size-7 text-destructive" aria-hidden />
            <p className="max-w-md break-words text-sm text-destructive [overflow-wrap:anywhere]">{error}</p>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setMode("html")}
              >
                {ar ? "العودة للتخطيط" : "Back to layout"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setReloadNonce((n) => n + 1)}
              >
                <RefreshCw className="size-3.5 me-1" />
                {ar ? "إعادة المحاولة" : "Retry"}
              </Button>
            </div>
          </div>
        ) : null}
        {!loading && !error && mode === "html" && htmlSrc ? (
          <div
            className="relative mx-auto h-full min-h-[360px] w-full max-w-[1100px] overflow-hidden bg-white shadow-sm ring-1 ring-border/40 sm:rounded-sm"
            aria-label={tr("preview_stage_paper", locale)}
          >
            <iframe
              ref={iframeRef}
              id={`doc-preview-${proposalId}`}
              title={title || "Document preview"}
              src={htmlSrc}
              className="size-full border-0 bg-white"
              sandbox={GENERATED_HTML_PREVIEW_SANDBOX}
              referrerPolicy="no-referrer"
              onLoad={(event) => {
                const frameDocument = event.currentTarget.contentDocument;
                if (!frameDocument) return;
                frameEventsRef.current?.abort();
                const controller = new AbortController();
                frameEventsRef.current = controller;
                frameDocument.addEventListener("keydown", (keyboardEvent) => {
                  if (keyboardEvent.key === "Escape" && expanded) {
                    keyboardEvent.preventDefault();
                    changeExpanded(false);
                  }
                }, { signal: controller.signal });
                const restorePosition = () => {
                  if (iframeRef.current?.contentDocument !== frameDocument) return;
                  const position = readingPositionRef.current;
                  if (position?.key === cacheKey) {
                    frameDocument.defaultView?.scrollTo(position.left, position.top);
                  }
                };
                restorePosition();
                if (!frameDocument.querySelector("[data-bilingual-document]")) return;
                const bilingualRoot = frameDocument.querySelector<HTMLElement>(
                  "[data-bilingual-document]",
                );
                bilingualRoot?.setAttribute(
                  "data-bilingual-preview-state",
                  "loading",
                );
                const synchronize = (): void => {
                  if (iframeRef.current?.contentDocument !== frameDocument) return;
                  try {
                    synchronizeCurrentBilingualDocument({}, frameDocument);
                    bilingualRoot?.setAttribute(
                      "data-bilingual-preview-state",
                      "ready",
                    );
                  } catch (cause) {
                    bilingualRoot?.setAttribute(
                      "data-bilingual-preview-state",
                      "error",
                    );
                    setError(
                      cause instanceof Error
                        ? cause.message
                        : "Bilingual preview synchronization failed",
                    );
                  }
                };
                bindBilingualViewerTabs(frameDocument, synchronize);
                void waitForPreviewAssets(frameDocument).then(
                  () => {
                    synchronize();
                    restorePosition();
                  },
                  (cause: unknown) => {
                    if (iframeRef.current?.contentDocument !== frameDocument) return;
                    bilingualRoot?.setAttribute(
                      "data-bilingual-preview-state",
                      "error",
                    );
                    setError(
                      cause instanceof Error
                        ? cause.message
                        : "Bilingual preview asset loading failed",
                    );
                  },
                );
              }}
            />
          </div>
        ) : null}
        {!loading && !error && mode === "pdf" && pdfSrc ? (
          <div
            className="relative mx-auto h-full min-h-[360px] w-full overflow-hidden bg-white sm:rounded-sm"
            aria-label={tr("preview_stage_paper", locale)}
          >
            <iframe
              key={pdfSrc}
              title={title || "PDF preview"}
              src={pdfSrc}
              referrerPolicy="no-referrer"
              className="size-full border-0 bg-muted/30"
            />
          </div>
        ) : null}
        {!loading && !error && !htmlSrc && !pdfSrc ? (
          <div role="status" className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Maximize2 className="size-4" />
            {ar ? "لا معاينة" : "No preview"}
          </div>
        ) : null}
      </div>
    </div>
  );

  return (
    <Dialog open={expanded} onOpenChange={changeExpanded}>
      {expanded ? (
        <DialogContent
          showCloseButton={false}
          dir={ar ? "rtl" : "ltr"}
          className="flex h-dvh w-full max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 sm:max-w-none"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            requestAnimationFrame(() => expandButtonRef.current?.focus());
          }}
        >
          <DialogTitle className="sr-only">{title || (ar ? "معاينة المستند" : "Document preview")}</DialogTitle>
          {viewer}
        </DialogContent>
      ) : viewer}
    </Dialog>
  );
}
