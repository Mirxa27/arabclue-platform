"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import {
  AlertTriangle,
  BrainCircuit,
  FileSearch,
  Loader2,
  MessageCircleQuestionMark,
  Plus,
  ScanSearch,
  Scroll,
  Upload,
} from "lucide-react";
import { useLocale, useUI } from "@/lib/store";
import { useNavigateToView } from "@/components/dashboard/view-navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, ErrorState } from "@/components/patterns";
import { useToast } from "@/hooks/use-toast";
import { apiErrorText } from "@/lib/api-failure-message";
import { cn } from "@/lib/utils";
import type { ClarificationPatch, ClarificationRecord } from "@/lib/tender-interrogation/repository";
import type { InterrogationAiReport, InterrogationResult } from "@/lib/ai/tender-interrogation";
import type { ClaritySummary } from "@/lib/tender-interrogation/clarity";
import { KIND_LABEL, STATUS_LABEL, label } from "@/lib/tender-interrogation/labels";
import {
  CLARIFICATION_KINDS,
  CLARIFICATION_STATUSES,
  type ClarificationKind,
  type ClarificationStatus,
} from "@/lib/tender-interrogation/types";
import { RadialGauge } from "./radial-gauge";
import { ClarificationCard } from "./clarification-card";
import { ClarificationLetterSheet } from "./clarification-letter-sheet";
import { ListSkeleton } from "./loading-skeletons";

type Locale = "ar" | "en";

type ListResponse = {
  items: ClarificationRecord[];
  summary: ClaritySummary;
  lastRunAt: string | null;
  lastProvider: { provider: string; model: string } | null;
};

const SEVERITY_ORDER = ["CRITICAL", "MAJOR", "MINOR"] as const;
const SEVERITY_HEADING: Record<(typeof SEVERITY_ORDER)[number], Record<Locale, string>> = {
  CRITICAL: { ar: "حرج — قد يُسقط العرض أو يغيّر الموعد", en: "Critical — could disqualify the bid or move the deadline" },
  MAJOR: { ar: "جوهري — يغيّر النطاق أو الدرجة أو التعرض", en: "Major — changes scope, score or exposure" },
  MINOR: { ar: "ثانوي — يستحق التوضيح", en: "Minor — worth clarifying" },
};

function relativeTime(iso: string | null, locale: Locale): string {
  if (!iso) return locale === "ar" ? "لم يُشغَّل بعد" : "not run yet";
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return locale === "ar" ? "الآن" : "just now";
  if (minutes < 60) return locale === "ar" ? `قبل ${minutes} د` : `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return locale === "ar" ? `قبل ${hours} س` : `${hours} h ago`;
  return new Date(iso).toLocaleDateString(locale === "ar" ? "ar-SA" : "en-GB");
}

function aiStatusCopy(ai: InterrogationAiReport, locale: Locale): { tone: "ok" | "warn"; text: string } | null {
  const ar = locale === "ar";
  if (ai.status === "complete") {
    return {
      tone: "ok",
      text: ar
        ? `قرأ النموذج ${ai.windows} مقطعاً · ${ai.quotesGrounded} اقتباساً مطابقاً للنص · ${ai.quotesRejected} مرفوضاً · ${ai.model ?? ""}`
        : `Model read ${ai.windows} window${ai.windows === 1 ? "" : "s"} · ${ai.quotesGrounded} quotes verified against the text · ${ai.quotesRejected} rejected · ${ai.model ?? ""}`,
    };
  }
  if (ai.status === "partial") {
    return {
      tone: "warn",
      text: ar
        ? `أجاب النموذج عن ${ai.windowsAnswered} من ${ai.windows} مقاطع (${ai.failureKind ?? "خلل"})؛ نتائج القواعد كاملة`
        : `Model answered ${ai.windowsAnswered} of ${ai.windows} windows (${ai.failureKind ?? "failure"}); rule-based findings are complete`,
    };
  }
  if (ai.status === "unavailable") {
    return {
      tone: "warn",
      text: ar
        ? `لم يتوفر مزوّد ذكاء اصطناعي (${ai.failureKind ?? "غير متاح"}). تُعرض نتائج قواعد التحقق فقط — لا شيء مُختلَق`
        : `No AI provider answered (${ai.failureKind ?? "unavailable"}). Showing rule-based findings only — nothing is fabricated`,
    };
  }
  return null;
}

export function TenderInterrogation() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const { activeProjectId } = useUI();
  const navigate = useNavigateToView();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: session } = useSession();
  const canWrite = session?.user?.role !== "REVIEWER";

  const [kindFilter, setKindFilter] = useState<ClarificationKind | "ALL">("ALL");
  const [statusFilter, setStatusFilter] = useState<ClarificationStatus | "ALL">("ALL");
  const [showDropped, setShowDropped] = useState(false);
  const [letterOpen, setLetterOpen] = useState(false);
  const [lastAi, setLastAi] = useState<InterrogationAiReport | null>(null);
  const [lastRun, setLastRun] = useState<InterrogationResult | null>(null);
  const [adding, setAdding] = useState(false);
  const [own, setOwn] = useState({ titleAr: "", titleEn: "", questionAr: "", questionEn: "" });

  const base = activeProjectId ? `/api/projects/${activeProjectId}/clarifications` : null;
  const listKey = ["clarifications", activeProjectId] as const;

  const list = useQuery({
    queryKey: listKey,
    enabled: !!base,
    queryFn: async (): Promise<ListResponse> => {
      const res = await fetch(base!);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(apiErrorText(body, locale));
      return body as ListResponse;
    },
  });

  const interrogate = useMutation({
    mutationFn: async (withModel: boolean) => {
      const res = await fetch(`${base}/interrogate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locale, withModel }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(apiErrorText(body, locale)) as Error & { code?: string };
        err.code = typeof (body as { code?: unknown }).code === "string" ? (body as { code: string }).code : undefined;
        throw err;
      }
      return body as InterrogationResult;
    },
    onSuccess: (result) => {
      setLastAi(result.ai);
      setLastRun(result);
      qc.setQueryData<ListResponse>(listKey, (prev) => ({
        items: [...result.items],
        summary: result.summary,
        lastRunAt: new Date().toISOString(),
        lastProvider: result.ai.provider ? { provider: result.ai.provider, model: result.ai.model ?? "" } : prev?.lastProvider ?? null,
      }));
      toast({
        title: ar ? "اكتمل استجواب المنافسة" : "Tender interrogated",
        description: ar
          ? `${result.created} استفساراً جديداً · ${result.refreshed} محدَّثاً · ${result.passages} مقطعاً قُرئ`
          : `${result.created} new · ${result.refreshed} refreshed · ${result.passages} passages read`,
      });
    },
    onError: (error: Error & { code?: string }) => {
      toast({ title: error.message, variant: "destructive" });
    },
  });

  const patch = useMutation({
    mutationFn: async ({ id, patch: body }: { id: string; patch: ClarificationPatch }) => {
      const res = await fetch(`${base}/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(apiErrorText(payload, locale));
      return (payload as { item: ClarificationRecord }).item;
    },
    onSuccess: (item) => {
      qc.setQueryData<ListResponse>(listKey, (prev) => {
        if (!prev) return prev;
        const items = prev.items.map((i) => (i.id === item.id ? item : i));
        return { ...prev, items, summary: recomputeSummary(items) };
      });
      void qc.invalidateQueries({ queryKey: listKey });
    },
    onError: (error: Error) => toast({ title: error.message, variant: "destructive" }),
  });

  const create = useMutation({
    mutationFn: async () => {
      const res = await fetch(base!, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(own),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(apiErrorText(payload, locale));
      return (payload as { item: ClarificationRecord }).item;
    },
    onSuccess: () => {
      setOwn({ titleAr: "", titleEn: "", questionAr: "", questionEn: "" });
      setAdding(false);
      void qc.invalidateQueries({ queryKey: listKey });
      toast({ title: ar ? "أُضيف الاستفسار واعتُمد للخطاب" : "Question added and kept for the letter" });
    },
    onError: (error: Error) => toast({ title: error.message, variant: "destructive" }),
  });

  const items = list.data?.items ?? [];
  const summary = list.data?.summary;
  const keptCount = items.filter((i) => i.status === "KEPT" || i.status === "SUBMITTED").length;

  const visible = useMemo(
    () =>
      items.filter((i) => {
        if (!showDropped && i.status === "DROPPED" && statusFilter !== "DROPPED") return false;
        if (kindFilter !== "ALL" && i.kind !== kindFilter) return false;
        if (statusFilter !== "ALL" && i.status !== statusFilter) return false;
        return true;
      }),
    [items, kindFilter, statusFilter, showDropped]
  );

  if (!activeProjectId) {
    return (
      <EmptyState
        icon={FileSearch}
        title={ar ? "اختر مشروعاً أولاً" : "Select a project first"}
        description={ar ? "الاستفسارات تُبنى على مستندات منافسة محددة" : "Clarifications are built from a specific tender's documents"}
        action={<Button size="sm" onClick={() => navigate("projects")}>{ar ? "المشاريع" : "Projects"}</Button>}
      />
    );
  }

  const running = interrogate.isPending;
  // Only the card being changed waits; the rest stay actionable so a reader
  // can keep triaging while one request is in flight.
  const busy = running;
  const pendingId = patch.isPending ? patch.variables?.id ?? null : null;
  const noTenderText = interrogate.error?.code === "NO_TENDER_TEXT";
  const aiCopy = lastAi ? aiStatusCopy(lastAi, locale) : null;

  return (
    <div className="space-y-4" dir={ar ? "rtl" : "ltr"}>
      {/* Stage: the dark control band the findings sit under. */}
      <section className="ops-stage relative overflow-hidden rounded-3xl p-5 sm:p-6" aria-labelledby="interrogation-stage-title">
        <div className="ops-aurora" aria-hidden />
        <div className="ops-stage-grid absolute inset-0" aria-hidden />
        <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <RadialGauge
              value={summary?.score ?? 100}
              size={84}
              strokeWidth={7}
              className="text-emerald-300"
              trackClassName="text-white/15"
              ariaLabel={ar ? `وضوح المنافسة ${summary?.score ?? 100}%` : `Tender clarity ${summary?.score ?? 100}%`}
              indeterminate={running}
            >
              <span className="text-lg font-bold tabular-nums">{running ? "…" : summary?.score ?? 100}</span>
            </RadialGauge>
            <div>
              <h2 id="interrogation-stage-title" className="text-base font-semibold tracking-tight">
                {ar ? "وضوح المنافسة" : "Tender clarity"}
              </h2>
              <p className="max-w-md text-[12px] leading-relaxed text-white/70">
                {ar
                  ? "مقياس مُشتق من الثغرات المفتوحة في نص المنافسة — لا يتنبأ بالفوز. كل ثغرة تستند إلى اقتباس حرفي من المستندات المرفوعة."
                  : "Derived from the open defects in the tender text — not a prediction of winning. Every defect rests on a verbatim quote from the uploaded documents."}
              </p>
              <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-white/80">
                <Stat label={ar ? "حرج" : "Critical"} value={summary?.bySeverity.CRITICAL ?? 0} tone="text-rose-300" />
                <Stat label={ar ? "جوهري" : "Major"} value={summary?.bySeverity.MAJOR ?? 0} tone="text-amber-300" />
                <Stat label={ar ? "ثانوي" : "Minor"} value={summary?.bySeverity.MINOR ?? 0} tone="text-sky-300" />
                <Stat label={ar ? "معتمد" : "Kept"} value={summary?.byStatus.KEPT ?? 0} tone="text-emerald-300" />
                <Stat label={ar ? "مُقدَّم" : "Submitted"} value={summary?.byStatus.SUBMITTED ?? 0} tone="text-indigo-300" />
                <Stat label={ar ? "مُجاب" : "Answered"} value={summary?.byStatus.ANSWERED ?? 0} tone="text-teal-300" />
              </dl>
            </div>
          </div>

          <div className="flex flex-col items-stretch gap-2 lg:items-end">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => interrogate.mutate(true)}
                disabled={busy || !canWrite}
                className="btn-premium bg-white text-slate-900 hover:bg-white/90"
              >
                {running ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ScanSearch className="size-4" aria-hidden />}
                {running ? (ar ? "يقرأ المنافسة…" : "Reading the tender…") : ar ? "استجواب المنافسة" : "Interrogate tender"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setLetterOpen(true)}
                disabled={keptCount === 0}
                className="border-white/30 bg-white/5 text-white hover:bg-white/15 hover:text-white"
              >
                <Scroll className="size-4" aria-hidden />
                {ar ? `خطاب الاستفسارات (${keptCount})` : `Compose letter (${keptCount})`}
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/70">
              <span className="inline-flex items-center gap-1 rounded-full border border-white/20 px-2 py-0.5">
                <BrainCircuit className="size-3" aria-hidden />
                {list.data?.lastProvider?.model
                  ? `${list.data.lastProvider.provider} · ${list.data.lastProvider.model}`
                  : ar
                    ? "قواعد التحقق"
                    : "rule-based"}
              </span>
              <span>{ar ? "آخر تشغيل:" : "Last run:"} {relativeTime(list.data?.lastRunAt ?? null, locale)}</span>
              {canWrite ? (
                <button
                  type="button"
                  className="underline-offset-2 hover:underline disabled:opacity-50"
                  onClick={() => interrogate.mutate(false)}
                  disabled={busy}
                >
                  {ar ? "القواعد فقط (دون نموذج)" : "Rules only (no model)"}
                </button>
              ) : null}
            </div>
          </div>
        </div>
        <p className="sr-only" role="status" aria-live="polite">
          {running ? (ar ? "جارٍ استجواب المنافسة" : "Interrogating the tender") : lastRun ? (ar ? "اكتمل الاستجواب" : "Interrogation complete") : ""}
        </p>
      </section>

      {aiCopy ? (
        <div
          role="status"
          className={cn(
            "flex items-start gap-2 rounded-xl border px-4 py-2.5 text-[12.5px]",
            aiCopy.tone === "ok"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
              : "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-100"
          )}
        >
          {aiCopy.tone === "ok" ? <BrainCircuit className="mt-0.5 size-4 shrink-0" aria-hidden /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />}
          <span>{aiCopy.text}</span>
        </div>
      ) : null}

      {noTenderText ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-[12.5px]">
          <span className="flex items-center gap-2">
            <Upload className="size-4" aria-hidden />
            {ar
              ? "لا يوجد نص منافسة مُحلَّل. ارفع كراسة الشروط في المستندات وانتظر انتهاء التحليل."
              : "No parsed tender text yet. Upload the tender in Documents and wait for parsing to finish."}
          </span>
          <Button size="sm" variant="outline" onClick={() => navigate("documents")}>
            {ar ? "المستندات" : "Documents"}
          </Button>
        </div>
      ) : null}

      {/* Filters */}
      {items.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 text-[11.5px]">
          <Chip active={kindFilter === "ALL"} onClick={() => setKindFilter("ALL")}>{ar ? "الكل" : "All"}</Chip>
          {CLARIFICATION_KINDS.map((k) => (
            <Chip key={k} active={kindFilter === k} onClick={() => setKindFilter(k)}>
              {label(KIND_LABEL, k, locale)} <span className="opacity-60">{items.filter((i) => i.kind === k && i.status !== "DROPPED").length}</span>
            </Chip>
          ))}
          <span className="mx-1 h-4 w-px bg-border" aria-hidden />
          <Chip active={statusFilter === "ALL"} onClick={() => setStatusFilter("ALL")}>{ar ? "كل الحالات" : "Any status"}</Chip>
          {CLARIFICATION_STATUSES.map((s) => (
            <Chip
              key={s}
              active={statusFilter === s}
              onClick={() => {
                setStatusFilter(s);
                if (s === "DROPPED") setShowDropped(true);
              }}
            >
              {label(STATUS_LABEL, s, locale)} <span className="opacity-60">{items.filter((i) => i.status === s).length}</span>
            </Chip>
          ))}
          <label className="ms-auto inline-flex items-center gap-1.5 text-muted-foreground">
            <input type="checkbox" checked={showDropped} onChange={(e) => setShowDropped(e.target.checked)} className="size-3.5 accent-primary" />
            {ar ? "إظهار المستبعد" : "Show dropped"}
          </label>
        </div>
      ) : null}

      {/* Findings */}
      {list.isLoading ? (
        <ListSkeleton rows={4} />
      ) : list.isError ? (
        <ErrorState message={(list.error as Error).message} onRetry={() => void list.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={MessageCircleQuestionMark}
          className="rounded-2xl border border-dashed border-border/70"
          title={ar ? "لم تُستجوَب هذه المنافسة بعد" : "This tender has not been interrogated yet"}
          description={
            ar
              ? "يبحث ArabClue عن التعارضات والغموض والملاحق الناقصة والبنود عالية المخاطر في نص المنافسة، ويصوغ لكل منها استفساراً رسمياً ثنائي اللغة يمكن تقديمه خلال فترة الاستفسارات."
              : "ArabClue reads the tender text for contradictions, ambiguities, missing annexes and risk clauses, and drafts a formal bilingual question for each, ready for the inquiries window."
          }
          action={
            canWrite ? (
              <Button size="sm" onClick={() => interrogate.mutate(true)} disabled={busy}>
                <ScanSearch className="size-3.5" aria-hidden />
                {ar ? "ابدأ الاستجواب" : "Start interrogation"}
              </Button>
            ) : undefined
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState icon={FileSearch} title={ar ? "لا نتائج تطابق المرشّحات" : "No findings match the filters"} />
      ) : (
        <div className="space-y-6">
          {SEVERITY_ORDER.map((sev) => {
            const group = visible.filter((i) => i.severity === sev);
            if (group.length === 0) return null;
            return (
              <section key={sev} aria-label={SEVERITY_HEADING[sev][locale]} className="space-y-2.5">
                <h3 className="flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <span className={cn("size-2 rounded-full", sev === "CRITICAL" ? "bg-rose-500" : sev === "MAJOR" ? "bg-amber-500" : "bg-sky-500")} aria-hidden />
                  {SEVERITY_HEADING[sev][locale]}
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10.5px] tabular-nums normal-case tracking-normal">{group.length}</span>
                </h3>
                <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                  {group.map((item) => (
                    <ClarificationCard
                      key={item.id}
                      item={item}
                      locale={locale}
                      busy={running || pendingId === item.id}
                      canWrite={canWrite}
                      onPatch={(id, body) => patch.mutate({ id, patch: body })}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* The team's own question */}
      {canWrite ? (
        <section className="rounded-2xl border border-border/60 bg-card p-4">
          {adding ? (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                create.mutate();
              }}
            >
              <h3 className="text-sm font-semibold">{ar ? "استفسار من الفريق" : "A question from the team"}</h3>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className="text-[11.5px] text-muted-foreground">
                  {ar ? "العنوان (عربي)" : "Title (Arabic)"}
                  <Input dir="rtl" value={own.titleAr} onChange={(e) => setOwn({ ...own, titleAr: e.target.value })} className="mt-1" required minLength={3} />
                </label>
                <label className="text-[11.5px] text-muted-foreground">
                  {ar ? "العنوان (إنجليزي)" : "Title (English)"}
                  <Input dir="ltr" value={own.titleEn} onChange={(e) => setOwn({ ...own, titleEn: e.target.value })} className="mt-1" required minLength={3} />
                </label>
                <label className="text-[11.5px] text-muted-foreground">
                  {ar ? "الاستفسار (عربي)" : "Question (Arabic)"}
                  <Textarea dir="rtl" rows={3} value={own.questionAr} onChange={(e) => setOwn({ ...own, questionAr: e.target.value })} className="mt-1" required minLength={10} />
                </label>
                <label className="text-[11.5px] text-muted-foreground">
                  {ar ? "الاستفسار (إنجليزي)" : "Question (English)"}
                  <Textarea dir="ltr" rows={3} value={own.questionEn} onChange={(e) => setOwn({ ...own, questionEn: e.target.value })} className="mt-1" required minLength={10} />
                </label>
              </div>
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={create.isPending}>
                  {create.isPending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Plus className="size-3.5" aria-hidden />}
                  {ar ? "إضافة واعتماد" : "Add and keep"}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>
                  {ar ? "إلغاء" : "Cancel"}
                </Button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border/70 px-4 py-3 text-[12.5px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
            >
              <Plus className="size-4" aria-hidden />
              {ar ? "أضف استفساراً من عندك — سيُعتمد للخطاب مباشرة" : "Add your own question — it is kept for the letter right away"}
            </button>
          )}
        </section>
      ) : null}

      <ClarificationLetterSheet
        projectId={activeProjectId}
        locale={locale}
        open={letterOpen}
        onOpenChange={setLetterOpen}
        keptCount={keptCount}
      />
    </div>
  );
}

function recomputeSummary(items: ClarificationRecord[]): ClaritySummary {
  const weight = { CRITICAL: 15, MAJOR: 6, MINOR: 2 } as const;
  const byStatus = { PROPOSED: 0, KEPT: 0, DROPPED: 0, SUBMITTED: 0, ANSWERED: 0 } as Record<ClarificationStatus, number>;
  const bySeverity = { CRITICAL: 0, MAJOR: 0, MINOR: 0 } as Record<ClarificationRecord["severity"], number>;
  let open = 0;
  let sum = 0;
  for (const i of items) {
    byStatus[i.status] += 1;
    if (i.status !== "DROPPED" && i.status !== "ANSWERED") {
      open += 1;
      bySeverity[i.severity] += 1;
      sum += weight[i.severity];
    }
  }
  return { score: Math.max(0, 100 - sum), total: items.length, open, byStatus, bySeverity };
}

function Stat({ label: text, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="flex items-baseline gap-1">
      <dt className="text-white/60">{text}</dt>
      <dd className={cn("font-semibold tabular-nums", tone)}>{value}</dd>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 transition-colors",
        active ? "border-primary/50 bg-primary/10 text-primary" : "border-border/60 text-muted-foreground hover:border-border hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}
