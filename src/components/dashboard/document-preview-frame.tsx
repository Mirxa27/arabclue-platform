"use client";

import { apiErrorText } from "@/lib/api-failure-message";

import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Maximize2,
  Printer,
  RefreshCw,
} from "lucide-react";
import { useArtifactDownload } from "@/hooks/use-artifact-download";
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

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    async function load() {
      setLoading(true);
      setError(null);
      setHtmlSrc(null);

      try {
        if (mode === "html") {
          const res = await fetch(htmlUrl, { credentials: "include" });
          if (!res.ok) {
            const data = (await res.json().catch(() => ({}))) as {
              error?: string;
            };
            throw new Error(apiErrorText(data, locale, `HTML failed (${res.status})`));
          }
          const html = await res.text();
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

        const res = await fetch(pdfUrl, { credentials: "include" });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(apiErrorText(data, locale, `PDF failed (${res.status})`));
        }
        const bytes = await res.arrayBuffer();
        objectUrl = createPdfPreviewObjectUrl(bytes);
        pdfCacheRef.current = { key: cacheKey, url: objectUrl };
        if (!cancelled) setPdfBase(objectUrl);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Preview failed");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
      // Only revoke HTML blobs here; PDF cache is owned by pdfCacheRef.
      if (mode === "html" && objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [htmlUrl, pdfUrl, mode, cacheKey]);

  useEffect(() => {
    return () => {
      if (pdfCacheRef.current?.url) {
        URL.revokeObjectURL(pdfCacheRef.current.url);
        pdfCacheRef.current = null;
      }
    };
  }, []);

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl border border-border/70 bg-background",
        className,
      )}
      dir={ar ? "rtl" : "ltr"}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-3 py-2.5 bg-muted/20">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="size-4 text-muted-foreground shrink-0" />
          <p className="text-sm font-medium truncate">
            {title || (ar ? "معاينة المستند" : "Document preview")}
          </p>
          <Badge variant="outline" className="text-[10px] uppercase">
            {mode === "pdf" ? "PDF" : ar ? "تخطيط" : "Layout"}
          </Badge>
          {stale ? (
            <Badge variant="destructive" className="text-[10px]">
              {ar ? "مسودة غير محفوظة" : "Unsaved draft"}
            </Badge>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant={mode === "html" ? "default" : "outline"}
            className="h-8"
            onClick={() => setMode("html")}
          >
            {ar ? "تخطيط" : "Layout"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === "pdf" ? "default" : "outline"}
            className="h-8"
            onClick={() => setMode("pdf")}
          >
            PDF
          </Button>
          {mode === "pdf" ? (
            <div className="flex rounded-md border p-0.5">
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
                  className="h-7 px-2 text-[11px]"
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
            className="h-8 gap-1"
            disabled={loading}
            onClick={() => setReloadNonce((n) => n + 1)}
            title={ar ? "تحديث المعاينة" : "Refresh preview"}
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 gap-1"
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
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Download className="size-3.5" />
            )}
            {ar ? "تنزيل" : "Download"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 gap-1"
            asChild
          >
            <a href={htmlUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="size-3.5" />
              {ar ? "تبويب" : "Tab"}
            </a>
          </Button>
          {mode === "html" ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 gap-1"
              onClick={() => {
                const frame = document.getElementById(
                  `doc-preview-${proposalId}`,
                ) as HTMLIFrameElement | null;
                frame?.contentWindow?.print();
              }}
            >
              <Printer className="size-3.5" />
            </Button>
          ) : null}
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
        className={cn(
          "relative overflow-auto bg-slate-100/80 p-3 sm:p-5 dark:bg-slate-950/30",
          compact ? "h-[420px]" : "h-[min(70vh,760px)]",
        )}
      >
        {loading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground z-10 bg-background/40">
            <Loader2 className="size-5 animate-spin" />
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
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center z-10">
            <p className="text-sm text-destructive max-w-md">{error}</p>
            <p className="text-xs text-muted-foreground max-w-sm">
              {ar
                ? "تأكد من تثبيت Chromium لـ Playwright على الخادم، أو استخدم معاينة التخطيط HTML."
                : "Ensure Playwright Chromium is installed on the server, or use HTML layout preview."}
            </p>
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
          <div className="mx-auto h-full min-h-[360px] w-full max-w-[860px] overflow-hidden rounded-sm border border-slate-200/90 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.18)] ring-1 ring-black/5">
            <iframe
              id={`doc-preview-${proposalId}`}
              title={title || "Document preview"}
              src={htmlSrc}
              className="size-full border-0 bg-white"
              sandbox={GENERATED_HTML_PREVIEW_SANDBOX}
              referrerPolicy="no-referrer"
              onLoad={(event) => {
                const frameDocument = event.currentTarget.contentDocument;
                if (
                  !frameDocument?.querySelector("[data-bilingual-document]")
                ) {
                  return;
                }
                const bilingualRoot = frameDocument.querySelector<HTMLElement>(
                  "[data-bilingual-document]",
                );
                bilingualRoot?.setAttribute(
                  "data-bilingual-preview-state",
                  "loading",
                );
                const synchronize = (): void => {
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
                  synchronize,
                  (cause: unknown) => {
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
          <div className="mx-auto h-full min-h-[360px] w-full max-w-[860px] overflow-hidden rounded-sm border border-slate-200/90 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.18)] ring-1 ring-black/5">
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
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground gap-2">
            <Maximize2 className="size-4" />
            {ar ? "لا معاينة" : "No preview"}
          </div>
        ) : null}
      </div>
    </div>
  );
}
