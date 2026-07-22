"use client";

import { useMemo, useState, useEffect } from "react";
import { useLocale } from "@/lib/store";
import { tr } from "@/lib/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  Save,
  FileDown,
  Sparkles,
  Eye,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { markdownToHtml } from "@/lib/markdown";
import { cn } from "@/lib/utils";

export function ProposalEditorDialog({
  proposalId,
  open,
  onOpenChange,
}: {
  proposalId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { locale } = useLocale();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [draftMd, setDraftMd] = useState<string | null>(null);
  const [draftLocale, setDraftLocale] = useState<"ar" | "en" | null>(null);
  const [mode, setMode] = useState<"edit" | "preview" | "split" | "financial">("split");
  const [instruction, setInstruction] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [boqRows, setBoqRows] = useState<
    { item: string; unit: string; qty: number; unitPrice: number | null; total: number | null }[]
  >([]);

  const { data, isLoading } = useQuery({
    queryKey: ["proposal", proposalId],
    enabled: open && !!proposalId,
    queryFn: async () => {
      const res = await fetch(`/api/proposals/${proposalId}`);
      if (!res.ok) throw new Error("Failed to load proposal");
      return res.json();
    },
  });

  const { data: finData } = useQuery({
    queryKey: ["proposal-financial", proposalId],
    enabled: open && !!proposalId,
    queryFn: async () => {
      const res = await fetch(`/api/proposals/${proposalId}/financial`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  if (open && proposalId && proposalId !== activeId) {
    setActiveId(proposalId);
    setDraftMd(null);
    setDraftLocale(null);
    setInstruction("");
    setBoqRows([]);
  }
  if (!open && activeId) {
    setActiveId(null);
    setDraftMd(null);
    setDraftLocale(null);
  }

  useEffect(() => {
    if (finData?.forms?.boqItems && Array.isArray(finData.forms.boqItems)) {
      setBoqRows(finData.forms.boqItems);
    }
  }, [finData]);

  const markdown = draftMd ?? data?.proposal?.contentMd ?? "";
  const propLocale: "ar" | "en" =
    draftLocale ?? (data?.proposal?.locale === "en" ? "en" : "ar");
  const setMarkdown = (v: string) => setDraftMd(v);
  const setPropLocale = (v: "ar" | "en") => setDraftLocale(v);

  const previewHtml = useMemo(
    () =>
      markdownToHtml(markdown, {
        headingColor: "#1E3A8A",
        accentColor: "#0EA5E9",
      }),
    [markdown]
  );

  const saveMutation = useMutation({
    mutationFn: async (opts?: { downloadPdf?: boolean }) => {
      const res = await fetch(`/api/proposals/${proposalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentMd: markdown,
          locale: propLocale,
          changeLog: "Editor save",
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Save failed");
      }
      return { ...(await res.json()), downloadPdf: !!opts?.downloadPdf };
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["proposals"] });
      qc.invalidateQueries({ queryKey: ["proposal", proposalId] });
      toast({ title: tr("proposal_saved", locale) });
      if (result.downloadPdf && proposalId) {
        window.open(
          `/api/proposals/${proposalId}/download?format=pdf&locale=${propLocale}`,
          "_blank"
        );
      }
    },
    onError: (err: Error) => {
      toast({ title: err.message, variant: "destructive" });
    },
  });

  const rewriteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/proposals/${proposalId}/rewrite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selection: markdown,
          instruction: instruction || undefined,
          locale: propLocale,
          apply: false,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Rewrite failed");
      return json;
    },
    onSuccess: (json) => {
      if (json.content) setMarkdown(json.content);
      toast({
        title: locale === "ar" ? "تمت إعادة الصياغة" : "Rewrite ready",
        description: json.provider ? `via ${json.provider}` : undefined,
      });
    },
    onError: (err: Error) => {
      toast({ title: err.message, variant: "destructive" });
    },
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/proposals/${proposalId}/submit`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Submit failed");
      return json;
    },
    onSuccess: (json) => {
      qc.invalidateQueries({ queryKey: ["proposals"] });
      qc.invalidateQueries({ queryKey: ["proposal", proposalId] });
      toast({
        title: locale === "ar" ? "أُرسل للمراجعة" : "Submitted for review",
        description:
          json.checklist?.missingRequirements > 0
            ? locale === "ar"
              ? `تحذير: ${json.checklist.missingRequirements} متطلبات ناقصة`
              : `Warning: ${json.checklist.missingRequirements} missing requirements`
            : undefined,
      });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const saveFinancialMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/proposals/${proposalId}/financial`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boqItems: boqRows, currency: "SAR" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      return json;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["proposal-financial", proposalId] });
      toast({
        title:
          locale === "ar"
            ? "تم حفظ الأسعار (إدخال بشري فقط)"
            : "Prices saved (human-entered only)",
      });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const version = data?.proposal?.version ?? 1;
  const showEdit = mode === "edit" || mode === "split";
  const showPreview = mode === "preview" || mode === "split";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-[96vw] h-[92vh] flex flex-col gap-3 p-4 sm:p-6">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center justify-between gap-2 pe-8">
            <span>{tr("proposal_editor", locale)}</span>
            <Badge variant="outline" className="font-mono text-[10px]">
              {tr("proposal_version", locale)} v{version}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {tr("loading", locale)}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <div className="flex rounded-md border p-0.5">
                <Button
                  size="sm"
                  variant={mode === "edit" ? "default" : "ghost"}
                  className="h-7 text-[11px] gap-1"
                  onClick={() => setMode("edit")}
                >
                  <Pencil className="size-3" />
                  {tr("action_edit", locale)}
                </Button>
                <Button
                  size="sm"
                  variant={mode === "split" ? "default" : "ghost"}
                  className="h-7 text-[11px]"
                  onClick={() => setMode("split")}
                >
                  Split
                </Button>
                <Button
                  size="sm"
                  variant={mode === "preview" ? "default" : "ghost"}
                  className="h-7 text-[11px] gap-1"
                  onClick={() => setMode("preview")}
                >
                  <Eye className="size-3" />
                  {tr("proposal_preview", locale)}
                </Button>
                <Button
                  size="sm"
                  variant={mode === "financial" ? "default" : "ghost"}
                  className="h-7 text-[11px]"
                  onClick={() => setMode("financial")}
                >
                  {locale === "ar" ? "المالي" : "Financial"}
                </Button>
              </div>

              <Select
                value={propLocale}
                onValueChange={(v) => setPropLocale(v as "ar" | "en")}
              >
                <SelectTrigger className="h-7 w-[140px] text-[11px]">
                  <SelectValue placeholder={tr("proposal_locale", locale)} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ar">العربية</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>

              <div className="flex-1" />

              <Button
                size="sm"
                variant="secondary"
                className="h-7 text-[11px]"
                disabled={submitMutation.isPending}
                onClick={() => submitMutation.mutate()}
              >
                {submitMutation.isPending ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : null}
                {locale === "ar" ? "إرسال للمراجعة" : "Submit for review"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[11px] gap-1"
                disabled={rewriteMutation.isPending || !markdown.trim()}
                onClick={() => rewriteMutation.mutate()}
              >
                {rewriteMutation.isPending ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Sparkles className="size-3" />
                )}
                {tr("proposal_ai_rewrite", locale)}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[11px] gap-1"
                disabled={saveMutation.isPending}
                onClick={() => saveMutation.mutate({})}
              >
                {saveMutation.isPending ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Save className="size-3" />
                )}
                {tr("action_save", locale)}
              </Button>
              <Button
                size="sm"
                className="h-7 text-[11px] gap-1"
                disabled={saveMutation.isPending}
                onClick={() => saveMutation.mutate({ downloadPdf: true })}
              >
                <FileDown className="size-3" />
                {tr("proposal_save_pdf", locale)}
              </Button>
            </div>

            <Input
              className="h-8 text-xs shrink-0"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder={
                locale === "ar"
                  ? "تعليمات إعادة الصياغة (اختياري)..."
                  : "AI rewrite instruction (optional)..."
              }
            />

            {mode === "financial" ? (
              <div className="flex-1 min-h-0 overflow-y-auto space-y-3">
                <p className="text-xs text-muted-foreground">
                  {locale === "ar"
                    ? "أدخل الأسعار يدوياً فقط. أراب كلاو لا يقترح أو يحسب أسعار العطاء."
                    : "Enter prices yourself. ArabClue never suggests or calculates bid prices."}
                </p>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="p-2 text-start">Item</th>
                      <th className="p-2">Unit</th>
                      <th className="p-2">Qty</th>
                      <th className="p-2">Unit price</th>
                      <th className="p-2">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {boqRows.map((row, i) => (
                      <tr key={i} className="border-b border-border/40">
                        <td className="p-1">
                          <Input
                            className="h-8 text-xs"
                            value={row.item}
                            onChange={(e) => {
                              const next = [...boqRows];
                              next[i] = { ...row, item: e.target.value };
                              setBoqRows(next);
                            }}
                          />
                        </td>
                        <td className="p-1 w-20">
                          <Input
                            className="h-8 text-xs"
                            value={row.unit}
                            onChange={(e) => {
                              const next = [...boqRows];
                              next[i] = { ...row, unit: e.target.value };
                              setBoqRows(next);
                            }}
                          />
                        </td>
                        <td className="p-1 w-20">
                          <Input
                            type="number"
                            className="h-8 text-xs"
                            value={row.qty}
                            onChange={(e) => {
                              const qty = Number(e.target.value) || 0;
                              const next = [...boqRows];
                              const unitPrice = row.unitPrice;
                              next[i] = {
                                ...row,
                                qty,
                                total:
                                  unitPrice != null
                                    ? Math.round(unitPrice * qty * 100) / 100
                                    : null,
                              };
                              setBoqRows(next);
                            }}
                          />
                        </td>
                        <td className="p-1 w-28">
                          <Input
                            type="number"
                            className="h-8 text-xs"
                            value={row.unitPrice ?? ""}
                            placeholder="—"
                            onChange={(e) => {
                              const unitPrice =
                                e.target.value === ""
                                  ? null
                                  : Number(e.target.value);
                              const next = [...boqRows];
                              next[i] = {
                                ...row,
                                unitPrice,
                                total:
                                  unitPrice != null
                                    ? Math.round(unitPrice * row.qty * 100) / 100
                                    : null,
                              };
                              setBoqRows(next);
                            }}
                          />
                        </td>
                        <td className="p-1 w-28 text-center">
                          {row.total ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Button
                  size="sm"
                  onClick={() => saveFinancialMutation.mutate()}
                  disabled={saveFinancialMutation.isPending || boqRows.length === 0}
                >
                  {saveFinancialMutation.isPending ? (
                    <Loader2 className="size-3 animate-spin me-1" />
                  ) : (
                    <Save className="size-3 me-1" />
                  )}
                  {locale === "ar" ? "حفظ الأسعار" : "Save prices"}
                </Button>
              </div>
            ) : (
            <div
              className={cn(
                "flex-1 min-h-0 overflow-hidden rounded-md border grid gap-0",
                mode === "split" ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1"
              )}
            >
              {showEdit && (
                <Textarea
                  className={cn(
                    "h-full min-h-[420px] resize-none border-0 rounded-none font-mono text-xs leading-relaxed",
                    mode === "split" && "lg:border-e",
                    propLocale === "ar" && "text-right"
                  )}
                  dir={propLocale === "ar" ? "rtl" : "ltr"}
                  value={markdown}
                  onChange={(e) => setMarkdown(e.target.value)}
                  spellCheck
                />
              )}
              {showPreview && (
                <div
                  className="h-full overflow-y-auto p-4 text-sm bg-muted/20"
                  dir={propLocale === "ar" ? "rtl" : "ltr"}
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              )}
            </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
