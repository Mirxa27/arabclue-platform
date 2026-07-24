"use client";

import { useMemo, useState, useEffect } from "react";
import { useLocale, useUI } from "@/lib/store";
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
  History,
  ShieldCheck,
  RefreshCw,
  GitFork,
  Download,
  FileText,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { DocumentPreviewFrame } from "./document-preview-frame";
import { MarkdownStudioEditor } from "./markdown-studio-editor";
import { useArtifactDownload } from "@/hooks/use-artifact-download";
import type { ArtifactDownloadFormat } from "@/lib/download-artifact";
import {
  ExportReadinessChecklist,
  ErrorState,
} from "@/components/patterns";

type StudioMode =
  | "edit"
  | "preview"
  | "print"
  | "split"
  | "financial"
  | "versions"
  | "validation";

type ProposalSkill =
  | "rewrite"
  | "expand"
  | "condense"
  | "translate"
  | "redesign"
  | "section";

const SKILLS: { id: ProposalSkill; en: string; ar: string }[] = [
  { id: "rewrite", en: "Rewrite", ar: "إعادة صياغة" },
  { id: "expand", en: "Expand", ar: "توسيع" },
  { id: "condense", en: "Condense", ar: "اختصار" },
  { id: "translate", en: "Translate", ar: "ترجمة" },
  { id: "redesign", en: "Redesign layout", ar: "إعادة تصميم" },
  { id: "section", en: "Section only", ar: "قسم فقط" },
];

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
  const { activeProjectId } = useUI();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { download, busyFormat, isBusy: downloadBusy } = useArtifactDownload();
  const [draftMd, setDraftMd] = useState<string | null>(null);
  const [draftLocale, setDraftLocale] = useState<"ar" | "en" | null>(null);
  const [mode, setMode] = useState<StudioMode>("split");
  const [instruction, setInstruction] = useState("");
  const [skill, setSkill] = useState<ProposalSkill>("rewrite");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [boqRows, setBoqRows] = useState<
    { item: string; unit: string; qty: number; unitPrice: number | null; total: number | null }[]
  >([]);
  const [compareA, setCompareA] = useState<string>("");
  const [compareB, setCompareB] = useState<string>("");
  const [diffLines, setDiffLines] = useState<string[]>([]);

  const { data, isLoading, isError, refetch } = useQuery({
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

  const { data: validationData, refetch: refetchValidation } = useQuery({
    queryKey: ["proposal-validate", proposalId],
    enabled: open && !!proposalId,
    queryFn: async () => {
      const res = await fetch(`/api/proposals/${proposalId}/validate`);
      if (!res.ok) throw new Error("Validation failed");
      return res.json();
    },
  });

  const { data: brandData } = useQuery({
    queryKey: ["brand"],
    enabled: open,
    queryFn: async () => {
      const res = await fetch("/api/brand");
      if (!res.ok) return { brandProfile: null };
      return res.json();
    },
  });
  const brandColors = {
    primaryColor: brandData?.brandProfile?.primaryColor as string | undefined,
    accentColor: brandData?.brandProfile?.accentColor as string | undefined,
  };
  if (open && proposalId && proposalId !== activeId) {
    setActiveId(proposalId);
    setDraftMd(null);
    setDraftLocale(null);
    setInstruction("");
    setBoqRows([]);
    setDiffLines([]);
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
  const versions: {
    id: string;
    version: number;
    changeLog: string | null;
    createdAt: string;
  }[] = data?.proposal?.versions ?? [];

  const previewHtml = useMemo(
    () =>
      markdownToHtml(markdown, {
        headingColor: brandColors.primaryColor ?? "#1E3A8A",
        accentColor: brandColors.accentColor ?? "#0EA5E9",
      }),
    [markdown, brandColors.primaryColor, brandColors.accentColor]
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
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
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["proposals"] });
      qc.invalidateQueries({ queryKey: ["proposal", proposalId] });
      refetchValidation();
      toast({ title: tr("proposal_saved", locale) });
    },
    onError: (err: Error) => {
      toast({ title: err.message, variant: "destructive" });
    },
  });

  const rewriteMutation = useMutation({
    mutationFn: async (apply: boolean) => {
      const res = await fetch(`/api/proposals/${proposalId}/rewrite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selection: markdown,
          instruction: instruction || undefined,
          locale: propLocale,
          skill,
          apply,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Skill failed");
      return json;
    },
    onSuccess: (json) => {
      if (json.fullContent) setMarkdown(json.fullContent);
      else if (json.content) setMarkdown(json.content);
      if (json.previewDiff) setDiffLines(json.previewDiff);
      qc.invalidateQueries({ queryKey: ["proposal", proposalId] });
      qc.invalidateQueries({ queryKey: ["proposals"] });
      refetchValidation();
      toast({
        title:
          locale === "ar"
            ? json.proposal
              ? "تم تطبيق المهارة"
              : "معاينة المهارة جاهزة"
            : json.proposal
              ? "Skill applied"
              : "Skill preview ready",
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
      refetchValidation();
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
      refetchValidation();
      toast({
        title:
          locale === "ar"
            ? "تم حفظ الأسعار (إدخال بشري فقط)"
            : "Prices saved (human-entered only)",
      });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const revertMutation = useMutation({
    mutationFn: async (version: number) => {
      const res = await fetch(
        `/api/proposals/${proposalId}/versions/${version}/revert`,
        { method: "POST" }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Revert failed");
      return json;
    },
    onSuccess: (json) => {
      setDraftMd(json.proposal?.contentMd ?? null);
      qc.invalidateQueries({ queryKey: ["proposal", proposalId] });
      qc.invalidateQueries({ queryKey: ["proposals"] });
      refetchValidation();
      toast({
        title: locale === "ar" ? "تمت الاستعادة" : "Version restored",
      });
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const compareMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `/api/proposals/${proposalId}/versions/compare?a=${compareA}&b=${compareB}`
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Compare failed");
      return json;
    },
    onSuccess: (json) => {
      setDiffLines(json.contentDiff ?? []);
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const regenerateMutation = useMutation({
    mutationFn: async (regenerateMode: "version" | "fork") => {
      const projectId = data?.proposal?.projectId ?? activeProjectId;
      if (!projectId) throw new Error("Missing project");
      const res = await fetch("/api/agents/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          locale: propLocale,
          regenerateMode,
          targetProposalId: proposalId,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Regenerate failed");
      return { ...json, regenerateMode };
    },
    onSuccess: (json) => {
      qc.invalidateQueries({ queryKey: ["proposals"] });
      toast({
        title:
          locale === "ar"
            ? json.regenerateMode === "fork"
              ? "بدأ إنشاء نسخة فرعية"
              : "بدأ إعادة التوليد كإصدار"
            : json.regenerateMode === "fork"
              ? "Fork generation started"
              : "Version regenerate started",
        description: `runId: ${json.runId}`,
      });
      onOpenChange(false);
    },
    onError: (err: Error) => toast({ title: err.message, variant: "destructive" }),
  });

  const exportMutation = useMutation({
    mutationFn: async (format: ArtifactDownloadFormat) => {
      if (!proposalId) throw new Error("Missing proposal");
      if (!validationData?.exportReady) {
        throw new Error(
          validationData?.exportBlocker?.error ??
            (locale === "ar"
              ? "العرض غير جاهز للتصدير"
              : "Proposal is not export-ready")
        );
      }
      const ok = await download({
        proposalId,
        format,
        locale,
        fallbackName:
          format === "zip"
            ? "Arabclue_Bid_Package.zip"
            : format === "pdf"
              ? "Technical_Proposal.pdf"
              : `export.${format}`,
      });
      if (!ok) throw new Error(locale === "ar" ? "فشل التصدير" : "Export failed");
      return format;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["proposals"] });
      qc.invalidateQueries({ queryKey: ["proposal", proposalId] });
      refetchValidation();
    },
    onError: (err: Error) => {
      refetchValidation();
      setMode("validation");
      toast({ title: err.message, variant: "destructive" });
    },
  });

  const version = data?.proposal?.version ?? 1;
  const status = data?.proposal?.status ?? "DRAFT";
  const showPrint = mode === "print";
  const issues = validationData?.validation?.issues ?? [];
  const exportBlocked = validationData != null && !validationData.exportReady;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-[96vw] h-[92vh] flex flex-col gap-3 p-4 sm:p-6">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center justify-between gap-2 pe-8">
            <span>{tr("proposal_editor", locale)}</span>
            <div className="flex items-center gap-1.5">
              <Badge variant="outline" className="font-mono text-[10px]">
                {tr("proposal_version", locale)} v{version}
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                {tr(`status_${status}` as Parameters<typeof tr>[0], locale)}
              </Badge>
              {validationData?.exportReady ? (
                <Badge className="text-[10px] bg-emerald-600">
                  {locale === "ar" ? "جاهز للتصدير" : "Export ready"}
                </Badge>
              ) : (
                <Badge variant="destructive" className="text-[10px]">
                  {locale === "ar" ? "غير جاهز" : "Not export-ready"}
                </Badge>
              )}
            </div>
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {tr("loading", locale)}
          </div>
        ) : isError ? (
          <ErrorState
            message={
              locale === "ar"
                ? "تعذر تحميل العرض"
                : "Failed to load proposal"
            }
            onRetry={() => refetch()}
            retryLabel={locale === "ar" ? "إعادة المحاولة" : "Retry"}
          />
        ) : (
          <>
            <ExportReadinessChecklist
              locale={locale}
              exportReady={validationData?.exportReady}
              exportBlocker={validationData?.exportBlocker}
              issues={issues}
              onOpenValidation={() => setMode("validation")}
              className="shrink-0"
            />
            <div className="flex flex-wrap items-center gap-2 shrink-0">              <div className="flex rounded-md border p-0.5 flex-wrap">
                {(
                  [
                    ["edit", Pencil, tr("action_edit", locale)],
                    ["split", Eye, "Split"],
                    ["preview", Eye, tr("proposal_preview", locale)],
                    [
                      "print",
                      FileText,
                      locale === "ar" ? "PDF / طباعة" : "PDF / Print",
                    ],
                    [
                      "financial",
                      Save,
                      locale === "ar" ? "المالي" : "Financial",
                    ],
                    [
                      "versions",
                      History,
                      locale === "ar" ? "الإصدارات" : "Versions",
                    ],
                    [
                      "validation",
                      ShieldCheck,
                      locale === "ar" ? "التحقق" : "Validation",
                    ],
                  ] as const
                ).map(([key, Icon, label]) => (
                  <Button
                    key={key}
                    size="sm"
                    variant={mode === key ? "default" : "ghost"}
                    className="h-7 text-[11px] gap-1"
                    onClick={() => setMode(key)}
                  >
                    <Icon className="size-3" />
                    {label}
                  </Button>
                ))}
              </div>

              <Select
                value={propLocale}
                onValueChange={(v) => setPropLocale(v as "ar" | "en")}
              >
                <SelectTrigger className="h-7 w-[120px] text-[11px]">
                  <SelectValue placeholder={tr("proposal_locale", locale)} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ar">العربية</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={skill}
                onValueChange={(v) => setSkill(v as ProposalSkill)}
              >
                <SelectTrigger className="h-7 w-[140px] text-[11px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SKILLS.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {locale === "ar" ? s.ar : s.en}
                    </SelectItem>
                  ))}
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
                {locale === "ar" ? "إرسال للمراجعة" : "Submit for review"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[11px] gap-1"
                disabled={rewriteMutation.isPending || !markdown.trim()}
                onClick={() => rewriteMutation.mutate(false)}
              >
                {rewriteMutation.isPending ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Sparkles className="size-3" />
                )}
                {locale === "ar" ? "معاينة" : "Preview skill"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[11px] gap-1"
                disabled={rewriteMutation.isPending || !markdown.trim()}
                onClick={() => rewriteMutation.mutate(true)}
              >
                <Sparkles className="size-3" />
                {locale === "ar" ? "تطبيق" : "Apply skill"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[11px] gap-1"
                disabled={saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
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
                variant="outline"
                className="h-7 text-[11px] gap-1"
                disabled={
                  exportMutation.isPending || downloadBusy || exportBlocked
                }
                title={
                  exportBlocked
                    ? validationData?.exportBlocker?.error ??
                      (locale === "ar"
                        ? "أكمل التحقق أولاً"
                        : "Complete validation first")
                    : undefined
                }
                onClick={() => exportMutation.mutate("zip")}
              >
                {busyFormat === "zip" ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Download className="size-3" />
                )}
                ZIP
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[11px] gap-1"
                disabled={
                  exportMutation.isPending || downloadBusy || exportBlocked
                }
                title={
                  exportBlocked
                    ? validationData?.exportBlocker?.error ??
                      (locale === "ar"
                        ? "أكمل التحقق أولاً"
                        : "Complete validation first")
                    : undefined
                }
                onClick={() => exportMutation.mutate("pdf")}
              >
                {busyFormat === "pdf" ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <FileDown className="size-3" />
                )}
                PDF
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <Input
                className="h-8 text-xs flex-1 min-w-[200px]"
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder={
                  locale === "ar"
                    ? "تعليمات المهارة (اختياري)..."
                    : "Skill instruction (optional)..."
                }
              />
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-[11px] gap-1"
                disabled={regenerateMutation.isPending}
                onClick={() => regenerateMutation.mutate("version")}
              >
                <RefreshCw className="size-3" />
                {locale === "ar" ? "إعادة توليد (إصدار)" : "Regen version"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-[11px] gap-1"
                disabled={regenerateMutation.isPending}
                onClick={() => regenerateMutation.mutate("fork")}
              >
                <GitFork className="size-3" />
                {locale === "ar" ? "نسخة فرعية" : "Fork new"}
              </Button>
            </div>

            {mode === "financial" ? (
              <div className="flex-1 min-h-0 overflow-y-auto space-y-3">
                <p className="text-xs text-muted-foreground">
                  {locale === "ar"
                    ? "أدخل الأسعار يدوياً فقط. أراب كلاو لا يقترح أو يحسب أسعار العطاء."
                    : "Enter prices yourself. ArabClue never suggests or calculates bid prices."}
                </p>
                {boqRows.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border/70 p-8 text-center space-y-3">
                    <p className="text-sm font-medium">
                      {locale === "ar"
                        ? "لا توجد بنود جدول كميات بعد"
                        : "No BoQ line items yet"}
                    </p>
                    <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                      {locale === "ar"
                        ? "أضف بنوداً من كراسة الشروط، ثم أدخل الكميات والأسعار يدوياً قبل التصدير."
                        : "Add lines from the tender schedule, then enter quantities and unit prices before export."}
                    </p>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="gap-1"
                      onClick={() =>
                        setBoqRows([
                          {
                            item: "",
                            unit: "LS",
                            qty: 1,
                            unitPrice: null,
                            total: null,
                          },
                        ])
                      }
                    >
                      <Plus className="size-3.5" />
                      {locale === "ar" ? "إضافة بند" : "Add line item"}
                    </Button>
                  </div>
                ) : (
                  <>
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
                                    ? Math.round(unitPrice * row.qty * 100) /
                                      100
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
                <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setBoqRows([
                      ...boqRows,
                      {
                        item: "",
                        unit: "LS",
                        qty: 1,
                        unitPrice: null,
                        total: null,
                      },
                    ])
                  }
                >
                  <Plus className="size-3 me-1" />
                  {locale === "ar" ? "بند" : "Line"}
                </Button>
                <Button
                  size="sm"
                  onClick={() => saveFinancialMutation.mutate()}
                  disabled={
                    saveFinancialMutation.isPending || boqRows.length === 0
                  }
                >
                  {saveFinancialMutation.isPending ? (
                    <Loader2 className="size-3 animate-spin me-1" />
                  ) : (
                    <Save className="size-3 me-1" />
                  )}
                  {locale === "ar" ? "حفظ الأسعار" : "Save prices"}
                </Button>
                </div>
                  </>
                )}
              </div>
            ) : mode === "versions" ? (              <div className="flex-1 min-h-0 overflow-y-auto space-y-3 text-xs">
                <ul className="space-y-2">
                  {versions.map((v) => (
                    <li
                      key={v.id}
                      className="flex items-center justify-between gap-2 border rounded-md p-2"
                    >
                      <div>
                        <div className="font-medium">v{v.version}</div>
                        <div className="text-muted-foreground">
                          {v.changeLog ?? "—"} ·{" "}
                          {new Date(v.createdAt).toLocaleString()}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px]"
                        disabled={revertMutation.isPending}
                        onClick={() => revertMutation.mutate(v.version)}
                      >
                        {locale === "ar" ? "استعادة" : "Revert"}
                      </Button>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    className="h-8 w-20 text-xs"
                    placeholder="A"
                    value={compareA}
                    onChange={(e) => setCompareA(e.target.value)}
                  />
                  <Input
                    className="h-8 w-20 text-xs"
                    placeholder="B"
                    value={compareB}
                    onChange={(e) => setCompareB(e.target.value)}
                  />
                  <Button
                    size="sm"
                    className="h-8 text-[11px]"
                    disabled={compareMutation.isPending}
                    onClick={() => compareMutation.mutate()}
                  >
                    {locale === "ar" ? "مقارنة" : "Compare"}
                  </Button>
                </div>
                {diffLines.length > 0 && (
                  <pre className="bg-muted/40 p-3 rounded-md overflow-auto max-h-64 text-[10px] font-mono whitespace-pre-wrap">
                    {diffLines.slice(0, 200).join("\n")}
                  </pre>
                )}
              </div>
            ) : mode === "validation" ? (
              <div className="flex-1 min-h-0 overflow-y-auto space-y-3 text-xs">
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      validationData?.exportReady ? "default" : "destructive"
                    }
                  >
                    {validationData?.exportReady
                      ? locale === "ar"
                        ? "جاهز"
                        : "Ready"
                      : locale === "ar"
                        ? "محظور"
                        : "Blocked"}
                  </Badge>
                  {validationData?.exportBlocker && (
                    <span className="text-destructive">
                      {validationData.exportBlocker.error}
                    </span>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 ms-auto"
                    onClick={() => refetchValidation()}
                  >
                    {locale === "ar" ? "تحديث" : "Refresh"}
                  </Button>
                </div>
                {issues.length === 0 ? (
                  <p className="text-muted-foreground">
                    {locale === "ar"
                      ? "لا توجد مشاكل تحقق."
                      : "No validation issues."}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {issues.map(
                      (
                        issue: {
                          code: string;
                          severity: string;
                          message: string;
                        },
                        i: number
                      ) => (
                        <li
                          key={`${issue.code}-${i}`}
                          className={cn(
                            "border rounded-md p-2",
                            issue.severity === "error"
                              ? "border-destructive/40"
                              : "border-border"
                          )}
                        >
                          <div className="font-mono text-[10px]">
                            {issue.code} · {issue.severity}
                          </div>
                          <div>{issue.message}</div>
                        </li>
                      )
                    )}
                  </ul>
                )}
                {data?.proposal?.parentProposalId && (
                  <p className="text-muted-foreground">
                    {locale === "ar" ? "متفرع من" : "Forked from"}{" "}
                    <span className="font-mono">
                      {data.proposal.parentProposalId}
                    </span>
                  </p>
                )}
              </div>
            ) : showPrint && proposalId ? (
              <div className="flex-1 min-h-0 overflow-auto">
                <DocumentPreviewFrame
                  locale={propLocale}
                  proposalId={proposalId}
                  title={data?.proposal?.title}
                  defaultMode="html"
                  compact
                />
              </div>
            ) : (
              <div className="flex-1 min-h-0 overflow-hidden flex flex-col gap-2">
                {(mode === "edit" || mode === "split") && (
                  <MarkdownStudioEditor
                    markdown={markdown}
                    onChange={setMarkdown}
                    locale={propLocale}
                    dir={propLocale === "ar" ? "rtl" : "ltr"}
                    splitPreview={mode === "split"}
                    brand={brandColors}
                    className="flex-1 min-h-0"
                  />
                )}
                {mode === "preview" && (
                  <div
                    className="flex-1 min-h-0 overflow-y-auto rounded-md border p-4 text-sm bg-muted/20"
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
