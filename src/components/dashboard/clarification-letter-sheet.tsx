"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, Download, ExternalLink, FileDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiErrorText } from "@/lib/api-failure-message";
import { useToast } from "@/hooks/use-toast";

type Locale = "ar" | "en";

/**
 * The letter over the kept questions: Markdown per locale to paste into the
 * Etimad inquiries form, or the paired AR|EN document as HTML or PDF.
 */
export function ClarificationLetterSheet({
  projectId,
  locale,
  open,
  onOpenChange,
  keptCount,
}: {
  projectId: string;
  locale: Locale;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  keptCount: number;
}) {
  const ar = locale === "ar";
  const { toast } = useToast();
  const [tab, setTab] = useState<Locale>(locale);
  const base = `/api/projects/${projectId}/clarifications/letter`;

  const letter = useQuery({
    queryKey: ["clarification-letter", projectId, keptCount],
    enabled: open && keptCount > 0,
    queryFn: async () => {
      const res = await fetch(`${base}?format=json`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(apiErrorText(body, locale));
      return body as { count: number; markdown: Record<Locale, string>; plain: Record<Locale, string> };
    },
  });

  const copy = async () => {
    const text = letter.data?.plain[tab];
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: ar ? "تم نسخ الخطاب" : "Letter copied" });
    } catch {
      toast({ title: ar ? "تعذر النسخ" : "Could not copy", variant: "destructive" });
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={ar ? "left" : "right"} className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl" dir={ar ? "rtl" : "ltr"}>
        <SheetHeader className="border-b border-border/60 px-6 py-4 text-start">
          <SheetTitle>{ar ? "خطاب الاستفسارات" : "Clarification letter"}</SheetTitle>
          <SheetDescription>
            {ar
              ? `${keptCount} استفساراً معتمداً · النص أدناه جاهز للصق في نموذج الاستفسارات بمنصة اعتماد، أو صدّره كمستند ثنائي اللغة`
              : `${keptCount} kept question${keptCount === 1 ? "" : "s"} · the text below is ready to paste into the Etimad inquiries form, or export the paired AR|EN document`}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-6 py-3">
          <Button type="button" size="sm" onClick={copy} disabled={!letter.data}>
            <Copy className="size-3.5" aria-hidden />
            {ar ? "نسخ النص" : "Copy text"}
          </Button>
          <Button type="button" size="sm" variant="outline" asChild>
            <a href={`${base}?format=md&locale=${tab}`}>
              <Download className="size-3.5" aria-hidden />
              {ar ? "تنزيل Markdown" : "Download .md"}
            </a>
          </Button>
          <Button type="button" size="sm" variant="outline" asChild>
            <a href={`${base}?format=html`} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="size-3.5" aria-hidden />
              {ar ? "المستند الثنائي (HTML)" : "Paired document (HTML)"}
            </a>
          </Button>
          <Button type="button" size="sm" variant="outline" asChild>
            <a href={`${base}?format=pdf`}>
              <FileDown className="size-3.5" aria-hidden />
              PDF
            </a>
          </Button>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as Locale)} className="flex min-h-0 flex-1 flex-col">
          <TabsList className="mx-6 mt-3 w-fit">
            <TabsTrigger value="ar">العربية</TabsTrigger>
            <TabsTrigger value="en">English</TabsTrigger>
          </TabsList>
          {(["ar", "en"] as const).map((l) => (
            <TabsContent key={l} value={l} className="min-h-0 flex-1 overflow-auto px-6 pb-6 pt-3">
              {letter.isLoading ? (
                <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  {ar ? "يُجهَّز الخطاب…" : "Composing the letter…"}
                </div>
              ) : letter.isError ? (
                <p className="text-sm text-destructive">{(letter.error as Error).message}</p>
              ) : (
                <div
                  dir={l === "ar" ? "rtl" : "ltr"}
                  className="ops-paper whitespace-pre-wrap rounded-xl px-5 py-4 text-[13.5px] leading-[1.8]"
                >
                  {letter.data?.plain[l]}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
