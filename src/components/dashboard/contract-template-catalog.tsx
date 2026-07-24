"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileText, Loader2, Scale } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import { saveBlob } from "@/lib/download-artifact";

interface ContractTemplateCatalogItem {
  key: string;
  versionId: string;
  lifecycle: "DRAFT";
  legalReviewStatus: "UNREVIEWED";
  counselReviewRequired: true;
  name: { en: string; ar: string };
  summary: { en: string; ar: string };
  disclaimer: { en: string; ar: string };
  sections: Array<{
    key: string;
    title: { en: string; ar: string };
    clauseCount: number;
  }>;
}

interface ContractTemplateCatalogPayload {
  executionAllowed: false;
  templates: ContractTemplateCatalogItem[];
}

export function ContractTemplateCatalog() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["contract-template-catalog"],
    queryFn: async () => {
      const response = await fetch("/api/contracts/templates", {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(`Template catalog failed (${response.status})`);
      }
      return (await response.json()) as ContractTemplateCatalogPayload;
    },
  });

  async function downloadPreview(
    template: ContractTemplateCatalogItem,
    format: "html" | "pdf"
  ) {
    const key = `${template.key}:${format}`;
    setBusy(key);
    try {
      const response = await fetch(
        `/api/contracts/templates/${encodeURIComponent(
          template.key
        )}/preview?format=${format}`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "PREVIEW", bindings: {} }),
        }
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error || `Preview failed (${response.status})`);
      }
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition");
      const filename =
        disposition?.match(/filename="?([^";]+)"?/i)?.[1] ??
        `${template.key}-unreviewed-draft.${format}`;
      saveBlob(blob, filename);
      toast({
        title: ar ? "تم تنزيل المسودة" : "Draft preview downloaded",
        description: filename,
      });
    } catch (error) {
      toast({
        title: ar ? "تعذرت المعاينة" : "Preview unavailable",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-labelledby="contract-template-catalog-heading">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3
            id="contract-template-catalog-heading"
            className="text-sm font-semibold"
          >
            {ar ? "قوالب العقود الثنائية" : "Bilingual contract templates"}
          </h3>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">
            {ar
              ? "سبع مسودات منظمة للمعاينة فقط. جميعها غير مراجعة وغير قابلة للتوقيع، وتتطلب مراجعة محامٍ سعودي مؤهل."
              : "Seven structured preview-only drafts. Every template is unreviewed, non-executable, and requires qualified Saudi counsel review."}
          </p>
        </div>
        <Badge variant="destructive">
          {ar ? "غير مراجع · غير قابل للتوقيع" : "Unreviewed · non-executable"}
        </Badge>
      </div>

      {isLoading ? (
        <Card className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {ar ? "جاري تحميل القوالب…" : "Loading templates…"}
        </Card>
      ) : isError ? (
        <Card className="border-destructive/40 p-4 text-sm text-destructive">
          {ar ? "تعذر تحميل كتالوج القوالب." : "Could not load template catalog."}
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(data?.templates ?? []).map((template) => (
            <Card key={template.key} className="flex flex-col gap-3 p-4">
              <div className="flex items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-teal-500/10 text-teal-700 dark:text-teal-300">
                  <Scale className="size-4" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold">
                    {ar ? template.name.ar : template.name.en}
                  </h4>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {template.versionId} · {template.sections.length}{" "}
                    {ar ? "أقسام" : "sections"}
                  </p>
                </div>
              </div>
              <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                {ar ? template.summary.ar : template.summary.en}
              </p>
              <div className="mt-auto flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy !== null}
                  onClick={() => void downloadPreview(template, "html")}
                >
                  {busy === `${template.key}:html` ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <FileText className="size-3.5" />
                  )}
                  HTML
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy !== null}
                  onClick={() => void downloadPreview(template, "pdf")}
                >
                  {busy === `${template.key}:pdf` ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Download className="size-3.5" />
                  )}
                  PDF
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

