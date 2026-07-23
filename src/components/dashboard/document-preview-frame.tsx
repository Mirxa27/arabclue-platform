"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Maximize2,
  Printer,
} from "lucide-react";
import { useArtifactDownload } from "@/hooks/use-artifact-download";

type Mode = "html" | "pdf";

type Props = {
  locale: "ar" | "en";
  proposalId: string;
  title?: string;
  /** Prefer html layout preview (instant) or binary pdf (Playwright). */
  defaultMode?: Mode;
  className?: string;
  compact?: boolean;
};

/**
 * In-app document viewer for proposals/contracts.
 * HTML mode uses a sandboxed iframe of the print layout.
 * PDF mode fetches bytes and embeds via blob URL.
 */
export function DocumentPreviewFrame({
  locale,
  proposalId,
  title,
  defaultMode = "html",
  className,
  compact,
}: Props) {
  const ar = locale === "ar";
  const [mode, setMode] = useState<Mode>(defaultMode);
  const [htmlSrc, setHtmlSrc] = useState<string | null>(null);
  const [pdfSrc, setPdfSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { download, busyFormat } = useArtifactDownload();

  const htmlUrl = useMemo(
    () => `/api/proposals/${proposalId}/download?format=html`,
    [proposalId]
  );

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    async function load() {
      setLoading(true);
      setError(null);
      setHtmlSrc(null);
      setPdfSrc(null);
      try {
        if (mode === "html") {
          // iframe can load authenticated same-origin URL directly
          if (!cancelled) setHtmlSrc(htmlUrl);
          return;
        }
        const res = await fetch(
          `/api/proposals/${proposalId}/download?format=pdf`,
          { credentials: "include" }
        );
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(data.error || `PDF failed (${res.status})`);
        }
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) setPdfSrc(objectUrl);
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
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [htmlUrl, mode, proposalId]);

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl border border-border/70 bg-background",
        className
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
            {mode}
          </Badge>
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
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 gap-1"
            disabled={busyFormat === "pdf"}
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
                  `doc-preview-${proposalId}`
                ) as HTMLIFrameElement | null;
                frame?.contentWindow?.print();
              }}
            >
              <Printer className="size-3.5" />
            </Button>
          ) : null}
        </div>
      </div>

      <div
        className={cn(
          "relative bg-[radial-gradient(ellipse_at_top,_rgba(15,23,42,0.04),_transparent_55%)]",
          compact ? "h-[420px]" : "h-[min(70vh,760px)]"
        )}
      >
        {loading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
            {ar ? "جارٍ تحميل المعاينة…" : "Loading preview…"}
          </div>
        ) : null}
        {error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="text-sm text-destructive max-w-md">{error}</p>
            <p className="text-xs text-muted-foreground max-w-sm">
              {ar
                ? "تأكد من تثبيت Chromium لـ Playwright على الخادم، أو استخدم معاينة التخطيط HTML."
                : "Ensure Playwright Chromium is installed on the server, or use HTML layout preview."}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setMode("html")}
            >
              {ar ? "العودة للتخطيط" : "Back to layout"}
            </Button>
          </div>
        ) : null}
        {!loading && !error && mode === "html" && htmlSrc ? (
          <iframe
            id={`doc-preview-${proposalId}`}
            title={title || "Document preview"}
            src={htmlSrc}
            className="size-full border-0 bg-white"
            sandbox="allow-same-origin allow-scripts allow-modals allow-popups"
          />
        ) : null}
        {!loading && !error && mode === "pdf" && pdfSrc ? (
          <iframe
            title={title || "PDF preview"}
            src={pdfSrc}
            className="size-full border-0 bg-muted/30"
          />
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
