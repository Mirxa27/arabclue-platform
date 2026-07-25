"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Maximize2,
} from "lucide-react";
import {
  classifyStoredFilePreviewKind,
  createPdfPreviewObjectUrl,
} from "@/lib/file-delivery-policy";
import {
  pdfPreviewSrc,
  type PdfPreviewZoom,
} from "@/lib/pdf-preview-view";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locale: "ar" | "en";
  title: string;
  storagePath: string;
  mimeType?: string | null;
  fileName?: string;
};

/**
 * Full-bleed in-app layout for uploaded workspace documents.
 * PDFs use an opaque blob URL without iframe sandbox (sandbox blocks Chrome's
 * PDF viewer). Markup uploads are shown only as inert source text.
 */
export function DocumentFileViewer({
  open,
  onOpenChange,
  locale,
  title,
  storagePath,
  mimeType,
  fileName,
}: Props) {
  const ar = locale === "ar";
  const kind = classifyStoredFilePreviewKind(
    mimeType,
    fileName || title
  );
  const fileUrl = useMemo(
    () =>
      `/api/files?path=${encodeURIComponent(storagePath)}&name=${encodeURIComponent(fileName || title)}`,
    [storagePath, fileName, title]
  );
  const downloadUrl = useMemo(
    () =>
      `/api/files?path=${encodeURIComponent(storagePath)}&download=1&name=${encodeURIComponent(fileName || title)}`,
    [storagePath, fileName, title]
  );

  const [textBody, setTextBody] = useState<string | null>(null);
  const [pdfBase, setPdfBase] = useState<string | null>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [pdfZoom, setPdfZoom] = useState<PdfPreviewZoom>("fitH");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const embedSrc = pdfBase ? pdfPreviewSrc(pdfBase, pdfZoom) : null;

  useEffect(() => {
    if (!open) {
      setTextBody(null);
      setPdfBase(null);
      setImageSrc(null);
      setError(null);
      setLoading(false);
      setPdfZoom("fitH");
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;

    async function load() {
      setLoading(true);
      setError(null);
      setTextBody(null);
      setPdfBase(null);
      setImageSrc(null);

      try {
        if (kind === "text") {
          const res = await fetch(fileUrl, { credentials: "include" });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const t = await res.text();
          if (!cancelled) setTextBody(t);
          return;
        }

        if (kind === "pdf") {
          const res = await fetch(fileUrl, { credentials: "include" });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const bytes = await res.arrayBuffer();
          if (bytes.byteLength < 5) {
            throw new Error(ar ? "ملف PDF فارغ" : "Empty PDF file");
          }
          objectUrl = createPdfPreviewObjectUrl(bytes);
          if (!cancelled) setPdfBase(objectUrl);
          return;
        }

        if (kind === "image") {
          const res = await fetch(fileUrl, { credentials: "include" });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const blob = await res.blob();
          objectUrl = URL.createObjectURL(blob);
          if (!cancelled) setImageSrc(objectUrl);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load");
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
  }, [open, kind, fileUrl, ar]);

  const kindLabel =
    kind === "pdf"
      ? "PDF"
      : kind === "image"
        ? ar
          ? "صورة"
          : "Image"
        : kind === "text"
          ? ar
            ? "نص"
            : "Text"
          : ar
            ? "ملف"
            : "File";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[96vw] h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="shrink-0 border-b border-border/60 px-4 py-3">
          <DialogTitle className="flex flex-wrap items-center justify-between gap-2 pe-8 text-base">
            <span className="flex items-center gap-2 min-w-0">
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{title}</span>
              <Badge variant="outline" className="text-[10px] uppercase">
                {kindLabel}
              </Badge>
            </span>
            <span className="flex items-center gap-1.5">
              {kind === "pdf" && pdfBase ? (
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
              <Button size="sm" variant="outline" className="h-8 gap-1" asChild>
                <a href={downloadUrl}>
                  <Download className="size-3.5" />
                  {ar ? "تنزيل" : "Download"}
                </a>
              </Button>
              <Button size="sm" variant="outline" className="h-8 gap-1" asChild>
                <a href={fileUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="size-3.5" />
                  {ar ? "تبويب" : "Open"}
                </a>
              </Button>
              {kind === "pdf" && (
                <Button size="sm" variant="ghost" className="h-8 gap-1" asChild>
                  <a href={fileUrl} target="_blank" rel="noreferrer">
                    <Maximize2 className="size-3.5" />
                  </a>
                </Button>
              )}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div
          className={cn(
            "flex-1 min-h-0 bg-[radial-gradient(ellipse_at_top,rgba(15,118,110,0.06),transparent_50%),linear-gradient(180deg,#f8fafc,transparent)] dark:bg-background"
          )}
          dir={ar ? "rtl" : "ltr"}
        >
          {kind === "pdf" ? (
            loading ? (
              <div className="flex size-full items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                {ar ? "جاري التحميل…" : "Loading…"}
              </div>
            ) : error ? (
              <div className="flex size-full flex-col items-center justify-center gap-3 p-8 text-center">
                <p className="text-sm text-destructive max-w-md">{error}</p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button asChild>
                    <a href={fileUrl} target="_blank" rel="noreferrer">
                      <ExternalLink className="size-3.5 me-1.5" />
                      {ar ? "فتح في تبويب" : "Open in tab"}
                    </a>
                  </Button>
                  <Button variant="outline" asChild>
                    <a href={downloadUrl}>
                      <Download className="size-3.5 me-1.5" />
                      {ar ? "تنزيل" : "Download"}
                    </a>
                  </Button>
                </div>
              </div>
            ) : embedSrc ? (
              <iframe
                key={embedSrc}
                title={title}
                src={embedSrc}
                referrerPolicy="no-referrer"
                className="size-full border-0 bg-white"
              />
            ) : null
          ) : kind === "image" ? (
            loading ? (
              <div className="flex size-full items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                {ar ? "جاري التحميل…" : "Loading…"}
              </div>
            ) : error ? (
              <div className="flex size-full flex-col items-center justify-center gap-3 p-8 text-center">
                <p className="text-sm text-destructive max-w-md">{error}</p>
                <Button asChild>
                  <a href={downloadUrl}>
                    <Download className="size-3.5 me-1.5" />
                    {ar ? "تنزيل" : "Download"}
                  </a>
                </Button>
              </div>
            ) : imageSrc ? (
              <div className="size-full flex items-center justify-center p-6 overflow-auto">
                <img
                  src={imageSrc}
                  alt={title}
                  className="max-h-full max-w-full object-contain rounded-lg shadow-sm border border-border/40 bg-white"
                />
              </div>
            ) : null
          ) : kind === "text" ? (
            <div className="size-full overflow-auto p-4">
              {loading ? (
                <div className="flex items-center justify-center gap-2 h-40 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  {ar ? "جاري التحميل…" : "Loading…"}
                </div>
              ) : error ? (
                <p className="text-sm text-destructive p-4">{error}</p>
              ) : (
                <pre className="text-xs font-mono whitespace-pre-wrap rounded-xl border border-border/60 bg-card p-4 leading-relaxed">
                  {textBody}
                </pre>
              )}
            </div>
          ) : (
            <div className="size-full flex flex-col items-center justify-center gap-3 p-8 text-center">
              <FileText className="size-10 text-muted-foreground/40" />
              <p className="text-sm font-medium">
                {ar
                  ? "لا معاينة مضمّنة لهذا النوع — نزّل الملف"
                  : "No inline preview for this file type — download instead"}
              </p>
              <Button asChild>
                <a href={downloadUrl}>
                  <Download className="size-3.5 me-1.5" />
                  {ar ? "تنزيل" : "Download"}
                </a>
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
