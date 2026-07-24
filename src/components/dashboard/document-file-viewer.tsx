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

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locale: "ar" | "en";
  title: string;
  storagePath: string;
  mimeType?: string | null;
  fileName?: string;
};

function kindFrom(mime: string | null | undefined, name: string) {
  const m = (mime || "").toLowerCase();
  const n = name.toLowerCase();
  if (m.includes("pdf") || n.endsWith(".pdf")) return "pdf" as const;
  if (
    m.startsWith("image/") ||
    /\.(png|jpe?g|gif|webp|svg)$/.test(n)
  )
    return "image" as const;
  if (
    m.includes("html") ||
    n.endsWith(".html") ||
    n.endsWith(".htm")
  )
    return "html" as const;
  if (
    m.startsWith("text/") ||
    m.includes("markdown") ||
    /\.(txt|md|csv|json)$/.test(n)
  )
    return "text" as const;
  return "binary" as const;
}

/**
 * Full-bleed in-app layout for uploaded workspace documents.
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
  const kind = kindFrom(mimeType, fileName || title);
  const fileUrl = useMemo(
    () => `/api/files?path=${encodeURIComponent(storagePath)}`,
    [storagePath]
  );
  const downloadUrl = useMemo(
    () =>
      `/api/files?path=${encodeURIComponent(storagePath)}&download=1&name=${encodeURIComponent(fileName || title)}`,
    [storagePath, fileName, title]
  );

  const [textBody, setTextBody] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || kind !== "text") {
      setTextBody(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetch(fileUrl, { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const t = await res.text();
        if (!cancelled) setTextBody(t);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, kind, fileUrl]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[96vw] h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="shrink-0 border-b border-border/60 px-4 py-3">
          <DialogTitle className="flex flex-wrap items-center justify-between gap-2 pe-8 text-base">
            <span className="flex items-center gap-2 min-w-0">
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{title}</span>
              <Badge variant="outline" className="text-[10px] uppercase">
                {kind}
              </Badge>
            </span>
            <span className="flex items-center gap-1.5">
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
              {(kind === "pdf" || kind === "html") && (
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
          {kind === "pdf" || kind === "html" ? (
            <iframe
              title={title}
              src={fileUrl}
              className="size-full border-0 bg-white"
            />
          ) : kind === "image" ? (
            <div className="size-full flex items-center justify-center p-6 overflow-auto">
              <img
                src={fileUrl}
                alt={title}
                className="max-h-full max-w-full object-contain rounded-lg shadow-sm border border-border/40 bg-white"
              />
            </div>
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
