"use client";

import { apiErrorText } from "@/lib/api-failure-message";

import { useCallback, useMemo, useState, useEffect } from "react";
import { useLocale, useUI } from "@/lib/store";
import { tr } from "@/lib/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useUnsavedChangesWarning } from "@/hooks/use-unsaved-changes-warning";
import { useEditorDraft } from "@/hooks/use-editor-draft";
import {
  ArrowLeft,
  Loader2,
  Save,
  FileDown,
  Sparkles,
  Eye,
  Pencil,
  Columns2,
  Calculator,
  Languages,
  History,
  ShieldCheck,
  RefreshCw,
  GitFork,
  Download,
  FileText,
  Package,
  ChevronDown,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { cn } from "@/lib/utils";
import { ProposalOptimizeAction } from "@/components/dashboard/ai-assist-actions";
import {
  letterheadCompanyName,
  type LetterheadBrand,
  type LetterheadCompany,
} from "@/lib/letterhead";
import { DocumentPreviewFrame } from "./document-preview-frame";
import { MarkdownStudioEditor } from "./markdown-studio-editor";
import { CopilotRail } from "./copilot-rail";
import { useArtifactDownload } from "@/hooks/use-artifact-download";
import type { ArtifactDownloadFormat } from "@/lib/download-artifact";
import {
  ExportReadinessChecklist,
  ErrorState,
} from "@/components/patterns";
import { submitProposalWithStructuredSnapshot } from "@/lib/proposal-submit-client";

type StudioMode =
  | "edit"
  | "preview"
  | "split"
  | "financial"
  | "versions"
  | "validation"
  | "bilingual";

/**
 * How the bidder is looking at the document. One of these is always active.
 *
 * `print` used to sit here too, but all it did was open the preview with its
 * HTML/PDF toggle already flipped to PDF — a whole tab for one control's
 * default, on a row the bidder already had to read eight items deep.
 */
const VIEW_TABS = [
  ["edit", Pencil],
  ["split", Columns2],
  ["preview", Eye],
] as const;

/**
 * Everything else about the proposal. These replace the document, so they are
 * a different kind of choice and are separated from the view group above.
 */
const PANEL_TABS = [
  ["financial", Calculator],
  ["versions", History],
  ["validation", ShieldCheck],
  ["bilingual", Languages],
] as const;

function studioModeLabel(mode: StudioMode, locale: "ar" | "en"): string {
  if (mode === "edit") return tr("action_edit", locale);
  if (mode === "preview") return tr("proposal_preview", locale);
  if (mode === "split") return locale === "ar" ? "مقسّم" : "Split";
  if (mode === "financial") return locale === "ar" ? "المالي" : "Financial";
  if (mode === "versions") return locale === "ar" ? "الإصدارات" : "Versions";
  if (mode === "validation") return locale === "ar" ? "التحقق" : "Validation";
  return locale === "ar" ? "ثنائي اللغة" : "Bilingual";
}

type ProposalSkill =
  | "rewrite"
  | "expand"
  | "condense"
  | "translate"
  | "redesign"
  | "section";

type BrandResponse = {
  brandProfile: LetterheadBrand | null;
  company?: LetterheadCompany | null;
};

/**
 * The three artifacts a bidder actually asks for by name, behind one Download
 * control. Which of them a given proposal can produce is decided server side
 * (`offerableProposalDownloadFormats`) — the editor only renders the answer,
 * because guessing it from proposal status is what previously offered Word on
 * proposals the route refused.
 */
const DOWNLOAD_FORMAT_ICONS = {
  zip: Package,
  pdf: FileDown,
  docx: FileText,
} as const;

type EditorDownloadFormat = keyof typeof DOWNLOAD_FORMAT_ICONS;

function isEditorDownloadFormat(value: string): value is EditorDownloadFormat {
  return value in DOWNLOAD_FORMAT_ICONS;
}

function downloadFormatLabel(
  format: EditorDownloadFormat,
  locale: "ar" | "en"
): string {
  if (format === "zip") return locale === "ar" ? "حزمة العطاء" : "Bid package";
  if (format === "pdf") return locale === "ar" ? "عرض فني PDF" : "Technical proposal";
  return locale === "ar" ? "نسخة Word" : "Word copy";
}

function downloadFormatHint(
  format: EditorDownloadFormat,
  locale: "ar" | "en"
): string {
  if (format === "zip") {
    return locale === "ar"
      ? "ZIP — كل شيء يُقدَّم للجهة"
      : "ZIP — everything you submit";
  }
  if (format === "pdf") {
    return locale === "ar"
      ? "PDF — النسخة المعتمدة"
      : "PDF — the authoritative copy";
  }
  return locale === "ar"
    ? "DOCX — للمراجعة والتعديل"
    : "DOCX — for redlines and edits";
}

const SKILLS: { id: ProposalSkill; en: string; ar: string }[] = [
  { id: "rewrite", en: "Rewrite", ar: "إعادة صياغة" },
  { id: "expand", en: "Expand", ar: "توسيع" },
  { id: "condense", en: "Condense", ar: "اختصار" },
  { id: "translate", en: "Translate", ar: "ترجمة" },
  { id: "redesign", en: "Redesign layout", ar: "إعادة تصميم" },
  { id: "section", en: "Section only", ar: "قسم فقط" },
];

/**
 * The studio renders in two places with the same body and different chrome: a
 * modal for the quick look from the reviews queue, and a full-width page for
 * actual authoring, where the editor, the preview and the co-pilot rail all need
 * room at once. Only the wrapper differs, so both share one implementation.
 */
type StudioChrome = "dialog" | "page";

function StudioShell({
  chrome,
  open,
  onOpenChange,
  title,
  onBack,
  backLabel,
  children,
}: {
  chrome: StudioChrome;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  onBack: () => void;
  backLabel: string;
  children: React.ReactNode;
}) {
  if (chrome === "page") {
    return (
      <section className="flex flex-col gap-3 h-[calc(100vh-7.5rem)] min-h-[36rem]">
        <header className="shrink-0 flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 text-[11px] shrink-0"
            onClick={onBack}
          >
            <ArrowLeft className="size-3.5 rtl:rotate-180" />
            {backLabel}
          </Button>
          <div className="flex flex-1 items-center justify-between gap-2 min-w-0">
            {title}
          </div>
        </header>
        {children}
      </section>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-[96vw] h-[92vh] flex flex-col gap-3 p-4 sm:p-6">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center justify-between gap-2 pe-8">
            {title}
          </DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

/** Modal chrome — the quick look from the reviews queue. */
export function ProposalEditorDialog(props: {
  proposalId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return <ProposalStudioBase {...props} chrome="dialog" />;
}

/** Page chrome — the authoring surface, rendered in place of a list. */
export function ProposalStudio({
  proposalId,
  onClose,
}: {
  proposalId: string;
  onClose: () => void;
}) {
  return (
    <ProposalStudioBase
      proposalId={proposalId}
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      chrome="page"
    />
  );
}

function ProposalStudioBase({
  proposalId,
  open,
  onOpenChange,
  chrome,
}: {
  proposalId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chrome: StudioChrome;
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
  const [counterpartMd, setCounterpartMd] = useState("");

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

  const {
    data: brandData,
    isError: brandError,
    refetch: refetchBrand,
  } = useQuery<BrandResponse>({
    queryKey: ["brand"],
    enabled: open,
    queryFn: async () => {
      const res = await fetch("/api/brand");
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(apiErrorText(payload, locale));
      }
      return res.json();
    },
  });
  const brandProfile = brandData?.brandProfile ?? null;
  const brandColors = useMemo(
    () => ({
      primaryColor: brandProfile?.primaryColor ?? undefined,
      accentColor: brandProfile?.accentColor ?? undefined,
    }),
    [brandProfile?.primaryColor, brandProfile?.accentColor]
  );
  if (open && proposalId && proposalId !== activeId) {
    setActiveId(proposalId);
    setDraftMd(null);
    setDraftLocale(null);
    setInstruction("");
    setBoqRows([]);
    setDiffLines([]);
    setCounterpartMd("");
  }
  if (!open && activeId) {
    setActiveId(null);
    setDraftMd(null);
    setDraftLocale(null);
    setCounterpartMd("");
  }

  useEffect(() => {
    if (finData?.forms?.boqItems && Array.isArray(finData.forms.boqItems)) {
      setBoqRows(finData.forms.boqItems);
    }
  }, [finData]);

  const persistedMd = data?.proposal?.contentMd ?? "";
  const markdown = draftMd ?? persistedMd;
  const propLocale: "ar" | "en" =
    draftLocale ?? (data?.proposal?.locale === "en" ? "en" : "ar");
  const setMarkdown = (v: string) => setDraftMd(v);
  const setPropLocale = (v: "ar" | "en") => setDraftLocale(v);
  const isDirty =
    draftMd != null
      ? draftMd !== persistedMd ||
        (draftLocale != null &&
          draftLocale !== (data?.proposal?.locale === "en" ? "en" : "ar"))
      : false;
  useUnsavedChangesWarning(isDirty);
  const restoreDraft = useCallback(
    (contentMd: string, l: "ar" | "en") => {
      setDraftMd(contentMd);
      setDraftLocale(l);
      // Silent restoration is indistinguishable from the server having sent
      // this text, which would make the unsaved state invisible again.
      toast({
        title:
          locale === "ar"
            ? "تم استعادة تعديلات غير محفوظة"
            : "Unsaved changes restored",
        description:
          locale === "ar"
            ? "احفظ لتثبيتها على العطاء."
            : "Save to commit them to the proposal.",
      });
    },
    [toast, locale]
  );
  const {
    staleDraft,
    applyStaleDraft,
    discardStaleDraft,
    clearStoredDraft,
  } = useEditorDraft({
    // Null while closed, so reopening re-offers a draft the close discarded.
    proposalId: open ? proposalId : null,
    serverVersion:
      typeof data?.proposal?.version === "number"
        ? data.proposal.version
        : null,
    serverContentMd: persistedMd,
    serverLocale: data?.proposal?.locale === "en" ? "en" : "ar",
    draftMd,
    draftLocale,
    isDirty,
    onRestore: restoreDraft,
  });
  const versions: {
    id: string;
    version: number;
    changeLog: string | null;
    createdAt: string;
  }[] = data?.proposal?.versions ?? [];

  const splitLetterhead = useMemo(
    () => ({
      brand: brandProfile,
      companyName: letterheadCompanyName(
        propLocale,
        brandProfile,
        brandData?.company
      ),
    }),
    [brandData?.company, brandProfile, propLocale]
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      const expectedVersion = data?.proposal?.version;
      const expectedUpdatedAt = data?.proposal?.updatedAt;
      if (
        typeof expectedVersion !== "number" ||
        typeof expectedUpdatedAt !== "string"
      ) {
        throw new Error("Reload the proposal before saving");
      }
      const res = await fetch(`/api/proposals/${proposalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentMd: markdown,
          locale: propLocale,
          changeLog: "Editor save",
          expectedVersion,
          expectedUpdatedAt,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(apiErrorText(err, locale));
      }
      return res.json();
    },
    onSuccess: () => {
      // Before the state reset: the draft on disk names the version we just
      // superseded, so keeping it would make the next open report a phantom
      // diverged draft on every single save.
      clearStoredDraft();
      setDraftMd(null);
      setDraftLocale(null);
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
      if (!res.ok) throw new Error(apiErrorText(json, locale));
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
      if (!proposalId) throw new Error("Missing proposal");
      const persistedVersion = data?.proposal?.version;
      const persistedUpdatedAt = data?.proposal?.updatedAt;
      if (
        typeof persistedVersion !== "number" ||
        typeof persistedUpdatedAt !== "string"
      ) {
        throw new Error("Reload the proposal before submitting");
      }
      return submitProposalWithStructuredSnapshot({
        proposalId,
        currentContentMd: markdown,
        currentLocale: propLocale,
        persistedContentMd: data?.proposal?.contentMd ?? "",
        persistedLocale:
          data?.proposal?.locale === "en" ? "en" : "ar",
        persistedVersion,
        persistedUpdatedAt,
        hasStructuredSnapshot:
          data?.proposal?.structuredSnapshot != null,
        counterpartContentMd: counterpartMd,
      });
    },
    onSuccess: (json) => {
      setDraftMd(null);
      setDraftLocale(null);
      qc.invalidateQueries({ queryKey: ["proposals"] });
      qc.invalidateQueries({ queryKey: ["proposal", proposalId] });
      refetchValidation();
      const checklist = json.checklist as
        | {
            missingRequirements?: number;
            nonCompliantControls?: number;
            pricesEntered?: boolean;
            hasFinancialStructure?: boolean;
            qualification?: {
              strongBidReady?: boolean;
              gaps?: Array<{ labelEn: string; labelAr: string }>;
            };
          }
        | undefined;
      const warnings: string[] = [];
      if ((checklist?.missingRequirements ?? 0) > 0) {
        warnings.push(
          locale === "ar"
            ? `${checklist!.missingRequirements} متطلبات ناقصة`
            : `${checklist!.missingRequirements} missing requirements`
        );
      }
      if ((checklist?.nonCompliantControls ?? 0) > 0) {
        warnings.push(
          locale === "ar"
            ? `${checklist!.nonCompliantControls} ضوابط غير مطابقة`
            : `${checklist!.nonCompliantControls} non-compliant controls`
        );
      }
      if (checklist?.hasFinancialStructure && checklist.pricesEntered === false) {
        warnings.push(
          locale === "ar" ? "أسعار البنود غير مكتملة" : "BoQ prices not entered"
        );
      }
      const gaps = checklist?.qualification?.gaps ?? [];
      if (gaps.length > 0) {
        const labels = gaps
          .slice(0, 3)
          .map((g) => (locale === "ar" ? g.labelAr : g.labelEn))
          .join(locale === "ar" ? "، " : ", ");
        warnings.push(
          locale === "ar"
            ? `فجوات التأهيل: ${labels}${gaps.length > 3 ? "…" : ""}`
            : `Qualification gaps: ${labels}${gaps.length > 3 ? "…" : ""}`
        );
      }
      toast({
        title: locale === "ar" ? "أُرسل للمراجعة" : "Submitted for review",
        description:
          warnings.length > 0
            ? `${locale === "ar" ? "تحذير إرشادي" : "Advisory"}: ${warnings.join(locale === "ar" ? " · " : " · ")}`
            : checklist?.qualification?.strongBidReady
              ? locale === "ar"
                ? "ملف التأهيل جاهز للمنافسة القوية"
                : "Qualification dossier looks strong-bid ready"
              : undefined,
      });
    },
    onError: (err: Error) => {
      if (err.message.toLowerCase().includes("counterpart-language")) {
        setMode("bilingual");
      }
      toast({ title: err.message, variant: "destructive" });
    },
  });

  const saveFinancialMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/proposals/${proposalId}/financial`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boqItems: boqRows, currency: "SAR" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(apiErrorText(json, locale));
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
      if (!res.ok) throw new Error(apiErrorText(json, locale));
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
      if (!res.ok) throw new Error(apiErrorText(json, locale));
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
      if (!res.ok) throw new Error(apiErrorText(json, locale));
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
              : format === "docx"
                ? "Technical_Proposal.docx"
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
  const showDocumentPreview = mode === "preview";
  const issues = validationData?.validation?.issues ?? [];
  const exportBlocked = validationData != null && !validationData.exportReady;
  const exportDisabled =
    exportMutation.isPending || downloadBusy || exportBlocked;
  const exportBlockedReason = exportBlocked
    ? validationData?.exportBlocker?.error ??
      (locale === "ar" ? "أكمل التحقق أولاً" : "Complete validation first")
    : undefined;
  // Which formats the download route would actually honour, computed server
  // side from the same selector it enforces with. Falls back to the always-safe
  // pair until validation lands, rather than guessing that Word is available.
  const downloadFormats: readonly EditorDownloadFormat[] =
    validationData?.downloadFormats?.filter(isEditorDownloadFormat) ?? [
      "zip",
      "pdf",
    ];

  return (
    <StudioShell
      chrome={chrome}
      open={open}
      onOpenChange={onOpenChange}
      onBack={() => onOpenChange(false)}
      backLabel={locale === "ar" ? "رجوع" : "Back"}
      title={
        <>
            <span>{tr("proposal_editor", locale)}</span>
            <div className="flex items-center gap-1.5">
              <Badge variant="outline" className="font-mono text-[10px]">
                {tr("proposal_version", locale)} v{version}
              </Badge>
              {isDirty ? (
                <Badge variant="destructive" className="text-[10px]">
                  {locale === "ar" ? "غير محفوظ" : "Unsaved"}
                </Badge>
              ) : null}
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
        </>
      }
    >
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
            {brandError ? (
              <ErrorState
                message={
                  locale === "ar"
                    ? "تعذر تحميل هوية العلامة للترويسة"
                    : "Could not load brand for letterhead"
                }
                onRetry={() => void refetchBrand()}
                retryLabel={locale === "ar" ? "إعادة المحاولة" : "Retry"}
                className="shrink-0 py-3"
              />
            ) : null}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {/* Two groups, not one row of eight: picking a view of the
                  document and swapping the document out for another panel are
                  different decisions and should not look like the same one. */}
              <div
                className="flex rounded-md border p-0.5"
                role="group"
                aria-label={
                  locale === "ar" ? "طريقة العرض" : "Document view"
                }
              >
                {VIEW_TABS.map(([key, Icon]) => (
                  <Button
                    key={key}
                    size="sm"
                    variant={mode === key ? "default" : "ghost"}
                    className="h-7 text-[11px] gap-1"
                    aria-pressed={mode === key}
                    onClick={() => {
                      if (isDirty && key === "preview") {
                        toast({
                          title:
                            locale === "ar"
                              ? "المعاينة تعرض آخر حفظ"
                              : "Preview shows the last save",
                          description:
                            locale === "ar"
                              ? "احفظ المسودة لتحديث المعاينة الرسمية."
                              : "Save your draft to refresh the official preview.",
                        });
                      }
                      setMode(key);
                    }}
                  >
                    <Icon className="size-3" />
                    {studioModeLabel(key, locale)}
                  </Button>
                ))}
              </div>
              <div
                className="flex rounded-md border p-0.5 flex-wrap"
                role="group"
                aria-label={locale === "ar" ? "لوحات العطاء" : "Bid panels"}
              >
                {PANEL_TABS.map(([key, Icon]) => (
                  <Button
                    key={key}
                    size="sm"
                    variant={mode === key ? "default" : "ghost"}
                    className="h-7 text-[11px] gap-1"
                    aria-pressed={mode === key}
                    onClick={() => setMode(key)}
                  >
                    <Icon className="size-3" />
                    {studioModeLabel(key, locale)}
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
              <ProposalOptimizeAction
                locale={locale}
                contentMd={markdown}
              />
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
              {/* One action. Format is a detail of it, not a separate decision
                  the bidder has to make three times across the toolbar. */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    className="h-7 text-[11px] gap-1"
                    disabled={exportDisabled}
                    title={exportBlockedReason}
                  >
                    {exportMutation.isPending || downloadBusy ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Download className="size-3" />
                    )}
                    {locale === "ar" ? "تنزيل" : "Download"}
                    <ChevronDown className="size-3 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  {downloadFormats.map((format) => {
                    const Icon = DOWNLOAD_FORMAT_ICONS[format];
                    return (
                      <DropdownMenuItem
                        key={format}
                        disabled={exportDisabled}
                        onSelect={() => exportMutation.mutate(format)}
                        className="gap-2 items-start"
                      >
                        {busyFormat === format ? (
                          <Loader2 className="size-3.5 mt-0.5 animate-spin" />
                        ) : (
                          <Icon className="size-3.5 mt-0.5" />
                        )}
                        <span className="flex flex-col gap-0.5">
                          <span className="text-xs font-medium">
                            {downloadFormatLabel(format, locale)}
                          </span>
                          <span className="text-[10px] text-muted-foreground leading-tight">
                            {downloadFormatHint(format, locale)}
                          </span>
                        </span>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
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

            {staleDraft ? (
              <div
                role="status"
                className="shrink-0 flex flex-wrap items-center gap-2 rounded-lg border border-chart-4/30 bg-chart-4/10 px-3 py-2"
              >
                <History className="size-4 shrink-0 text-chart-4" />
                <p className="flex-1 min-w-0 text-[11px] leading-snug">
                  <span className="font-semibold">
                    {locale === "ar"
                      ? "لديك تعديلات غير محفوظة على هذا الجهاز"
                      : "You have unsaved changes on this device"}
                  </span>{" "}
                  <span className="text-muted-foreground">
                    {locale === "ar"
                      ? `كُتبت على الإصدار ${staleDraft.version}، والعطاء الآن على الإصدار ${data?.proposal?.version ?? "?"}. الاستعادة تستبدل كل ما تغيّر بعدها.`
                      : `Written against v${staleDraft.version}; the proposal is now v${data?.proposal?.version ?? "?"}. Restoring replaces everything changed since.`}
                  </span>
                </p>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px]"
                    onClick={applyStaleDraft}
                  >
                    {locale === "ar" ? "استعادة" : "Restore"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-[11px]"
                    onClick={discardStaleDraft}
                  >
                    {locale === "ar" ? "تجاهل" : "Discard"}
                  </Button>
                </div>
              </div>
            ) : null}

            {mode === "bilingual" ? (
              <div className="flex-1 min-h-0 overflow-y-auto space-y-4">
                <div className="rounded-lg border bg-muted/20 p-3 space-y-1">
                  <p className="text-sm font-medium">
                    {locale === "ar"
                      ? "إعداد اللقطة الثنائية للمراجعة"
                      : "Prepare the bilingual review snapshot"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {propLocale === "ar"
                      ? locale === "ar"
                        ? "المسودة العربية في المحرر هي الجانب الأول. أدخل النسخة الإنجليزية الصريحة أدناه؛ لا ينشئ النظام ترجمة تلقائية."
                        : "The Arabic editor draft is the first side. Enter the explicit English counterpart below; the system does not synthesize a translation."
                      : locale === "ar"
                        ? "المسودة الإنجليزية في المحرر هي الجانب الأول. أدخل النسخة العربية الصريحة أدناه؛ لا ينشئ النظام ترجمة تلقائية."
                        : "The English editor draft is the first side. Enter the explicit Arabic counterpart below; the system does not synthesize a translation."}
                  </p>
                  {data?.proposal?.structuredSnapshot != null && (
                    <Badge variant="outline" className="mt-2">
                      {locale === "ar"
                        ? "لقطة منظمة موجودة"
                        : "Structured snapshot prepared"}
                    </Badge>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium">
                    {propLocale === "ar"
                      ? locale === "ar"
                        ? "المحتوى الإنجليزي المقابل"
                        : "English counterpart"
                      : locale === "ar"
                        ? "المحتوى العربي المقابل"
                        : "Arabic counterpart"}
                  </label>
                  <Textarea
                    value={counterpartMd}
                    onChange={(event) =>
                      setCounterpartMd(event.target.value)
                    }
                    dir={propLocale === "ar" ? "ltr" : "rtl"}
                    className="min-h-[320px] font-mono text-xs leading-6"
                    placeholder={
                      propLocale === "ar"
                        ? "# English proposal\n\nEnter the complete reviewed counterpart…"
                        : "# العرض العربي\n\nأدخل النسخة المقابلة الكاملة للمراجعة…"
                    }
                  />
                </div>
                <Button
                  size="sm"
                  disabled={
                    submitMutation.isPending || !counterpartMd.trim()
                  }
                  onClick={() => submitMutation.mutate()}
                >
                  {submitMutation.isPending ? (
                    <Loader2 className="size-3 animate-spin me-1" />
                  ) : (
                    <ShieldCheck className="size-3 me-1" />
                  )}
                  {locale === "ar"
                    ? "إنشاء اللقطة والإرسال للمراجعة"
                    : "Build snapshot and submit for review"}
                </Button>
              </div>
            ) : mode === "financial" ? (
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
            ) : showDocumentPreview && proposalId ? (
              <div className="flex-1 min-h-0 overflow-auto">
                <DocumentPreviewFrame
                  locale={propLocale}
                  proposalId={proposalId}
                  title={data?.proposal?.title}
                  defaultMode="html"
                  contentRevision={data?.proposal?.updatedAt}
                  stale={isDirty}
                  onRequestSave={() => saveMutation.mutate()}
                  compact
                />
              </div>
            ) : (
              <div className="flex-1 min-h-0 overflow-hidden flex gap-2">
                {(mode === "edit" || mode === "split") && (
                  <>
                    <MarkdownStudioEditor
                      markdown={markdown}
                      onChange={setMarkdown}
                      locale={propLocale}
                      dir={propLocale === "ar" ? "rtl" : "ltr"}
                      splitPreview={mode === "split"}
                      brand={brandColors}
                      letterhead={splitLetterhead}
                      className="flex-1 min-h-0"
                    />
                    {proposalId && (
                      <CopilotRail
                        proposalId={proposalId}
                        markdown={markdown}
                        locale={propLocale}
                        onApply={setMarkdown}
                      />
                    )}
                  </>
                )}
              </div>
            )}
          </>
        )}
    </StudioShell>
  );
}
