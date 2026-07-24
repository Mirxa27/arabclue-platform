"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Scale,
  ShieldAlert,
  BookOpen,
  Columns2,
  AlignLeft,
  ClipboardCheck,
  CheckCircle2,
  Loader2,
  Eye,
  GitCompare,
  History,
  Pencil,
  RotateCcw,
  Save,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useLocale } from "@/lib/store";
import {
  parseContractArticles,
  type ContractArticle,
} from "@/lib/contract-format";
import {
  extractObligations,
  type ObligationMilestone,
} from "@/lib/contract-obligations";
import type { SaudiLawResearchBrief } from "@/lib/saudi-law-research";
import { isProposalEditLocked } from "@/lib/proposal-status";
import type { ApiProposal, ApiProposalVersion } from "@/lib/api-types";

export type ContractStudioMode = "preview" | "edit" | "versions" | "obligations";

type Props = {
  title: string;
  titleAr?: string | null;
  contentMd: string;
  proposalId?: string;
  status?: string | null;
  version?: number | null;
  versions?: ApiProposalVersion[];
  research?: SaudiLawResearchBrief | null;
  articles?: ContractArticle[] | null;
  milestones?: ObligationMilestone[] | null;
  initialMode?: ContractStudioMode;
  className?: string;
  onSaved?: (proposal: ApiProposal) => void;
};

export function BilingualContractStudio({
  title,
  titleAr,
  contentMd,
  proposalId,
  status,
  version,
  versions = [],
  research,
  articles: articlesProp,
  milestones,
  initialMode = "preview",
  className,
  onSaved,
}: Props) {
  const { locale } = useLocale();
  const { toast } = useToast();
  const qc = useQueryClient();
  const ar = locale === "ar";
  const [mode, setMode] = useState<"split" | "en" | "ar">("split");
  const [studioMode, setStudioMode] = useState<ContractStudioMode>(initialMode);
  const [showResearch, setShowResearch] = useState(true);
  const [draftMd, setDraftMd] = useState(contentMd);
  const [diffLines, setDiffLines] = useState<string[]>([]);
  const [doneObligationIds, setDoneObligationIds] = useState<Set<string>>(
    () => new Set()
  );

  useEffect(() => {
    setDraftMd(contentMd);
    setDiffLines([]);
  }, [contentMd, proposalId]);

  useEffect(() => {
    setStudioMode(initialMode);
  }, [initialMode, proposalId]);

  const currentVersion = version ?? versions[0]?.version ?? 1;
  const locked = isProposalEditLocked(status);
  const isDirty = draftMd !== contentMd;
  const obligationsStorageKey = proposalId
    ? `arabclue-obligations:${proposalId}`
    : null;

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!proposalId) throw new Error("Missing contract id");
      const res = await fetch(`/api/proposals/${proposalId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentMd: draftMd,
          changeLog: "Contract studio save",
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Save failed");
      return json as { proposal: ApiProposal };
    },
    onSuccess: ({ proposal }) => {
      setDraftMd(proposal.contentMd ?? "");
      setStudioMode("preview");
      qc.invalidateQueries({ queryKey: ["proposals"] });
      qc.invalidateQueries({ queryKey: ["proposal", proposalId] });
      onSaved?.(proposal);
      toast({
        title: ar ? "تم حفظ العقد" : "Contract saved",
        description: `v${proposal.version ?? currentVersion}`,
      });
    },
    onError: (err: Error) => {
      toast({ title: err.message, variant: "destructive" });
    },
  });

  const revertMutation = useMutation({
    mutationFn: async (targetVersion: number) => {
      if (!proposalId) throw new Error("Missing contract id");
      const res = await fetch(
        `/api/proposals/${proposalId}/versions/${targetVersion}/revert`,
        { method: "POST" }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Revert failed");
      return json as { proposal: ApiProposal };
    },
    onSuccess: ({ proposal }) => {
      setDraftMd(proposal.contentMd ?? "");
      setStudioMode("preview");
      setDiffLines([]);
      qc.invalidateQueries({ queryKey: ["proposals"] });
      qc.invalidateQueries({ queryKey: ["proposal", proposalId] });
      onSaved?.(proposal);
      toast({ title: ar ? "تمت استعادة الإصدار" : "Version restored" });
    },
    onError: (err: Error) => {
      toast({ title: err.message, variant: "destructive" });
    },
  });

  const compareMutation = useMutation({
    mutationFn: async ({ a, b }: { a: number; b: number }) => {
      if (!proposalId) throw new Error("Missing contract id");
      const res = await fetch(
        `/api/proposals/${proposalId}/versions/compare?a=${a}&b=${b}`
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Compare failed");
      return json as { contentDiff: string[] };
    },
    onSuccess: (json) => {
      setDiffLines(json.contentDiff ?? []);
    },
    onError: (err: Error) => {
      toast({ title: err.message, variant: "destructive" });
    },
  });

  const articles = useMemo(() => {
    if (!isDirty && articlesProp?.length) return articlesProp;
    return parseContractArticles(draftMd);
  }, [articlesProp, draftMd, isDirty]);

  useEffect(() => {
    if (!obligationsStorageKey || typeof window === "undefined") {
      setDoneObligationIds(new Set());
      return;
    }

    try {
      const parsed = JSON.parse(
        window.localStorage.getItem(obligationsStorageKey) ?? "[]"
      );
      setDoneObligationIds(
        new Set(Array.isArray(parsed) ? parsed.filter(Boolean) : [])
      );
    } catch {
      setDoneObligationIds(new Set());
    }
  }, [obligationsStorageKey]);

  const obligationRows = useMemo(
    () =>
      extractObligations(articles, milestones).map((row) => ({
        ...row,
        status: doneObligationIds.has(row.id) ? "done" : row.status,
      })),
    [articles, doneObligationIds, milestones]
  );

  const toggleObligation = (id: string) => {
    setDoneObligationIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      if (obligationsStorageKey && typeof window !== "undefined") {
        window.localStorage.setItem(
          obligationsStorageKey,
          JSON.stringify(Array.from(next))
        );
      }
      return next;
    });
  };

  return (
    <div
      className={cn(
        "rounded-2xl overflow-hidden border border-[oklch(0.28_0.03_250/0.35)]",
        "bg-[linear-gradient(165deg,oklch(0.16_0.02_250)_0%,oklch(0.12_0.02_240)_45%,oklch(0.14_0.025_200)_100%)]",
        className
      )}
    >
      {/* Masthead */}
      <div className="relative px-6 sm:px-10 pt-8 pb-6 border-b border-white/10">
        <div
          className="absolute inset-0 opacity-40 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 70% 80% at 10% 0%, oklch(0.35_0.06_195 / 0.35), transparent), radial-gradient(ellipse 50% 60% at 90% 20%, oklch(0.30_0.04_80 / 0.2), transparent)",
          }}
        />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[oklch(0.78_0.1_195)]">
              <Scale className="size-5" />
              <span className="text-[11px] font-bold tracking-[0.22em] uppercase">
                ArabClue · أراب كلاو
              </span>
            </div>
            <h2 className="mt-3 font-[family-name:var(--font-ibm-arabic)] text-2xl sm:text-3xl font-bold text-white leading-tight">
              {titleAr || title}
            </h2>
            <p className="mt-1 text-sm text-white/50 font-[family-name:var(--font-space-grotesk)]">
              {title}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge className="bg-amber-500/15 text-amber-200 border-amber-500/30 gap-1.5">
              <ShieldAlert className="size-3" />
              {ar ? "مسودة — ليست استشارة قانونية" : "Draft — not legal advice"}
            </Badge>
            <Badge
              variant="outline"
              className="border-white/15 text-white/60"
            >
              {ar ? "عربي | English" : "EN | عربي"}
            </Badge>
          </div>
        </div>

        <div className="relative mt-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["split", ar ? "متقابل" : "Front-to-front", Columns2],
                ["en", "English", AlignLeft],
                ["ar", "العربية", AlignLeft],
              ] as const
            ).map(([id, label, Icon]) => (
              <Button
                key={id}
                size="sm"
                variant="ghost"
                onClick={() => setMode(id)}
                className={cn(
                  "h-8 rounded-full text-[11px] gap-1.5 border",
                  mode === id
                    ? "bg-white text-black border-white"
                    : "border-white/15 text-white/60 hover:text-white hover:bg-white/10"
                )}
              >
                <Icon className="size-3.5" />
                {label}
              </Button>
            ))}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowResearch((v) => !v)}
              className={cn(
                "h-8 rounded-full text-[11px] gap-1.5 border",
                showResearch
                  ? "bg-[oklch(0.72_0.12_195)]/20 text-[oklch(0.85_0.1_195)] border-[oklch(0.72_0.12_195)]/30"
                  : "border-white/15 text-white/60 hover:text-white hover:bg-white/10"
              )}
            >
              <BookOpen className="size-3.5" />
              {ar ? "البحث النظامي" : "Law research"}
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-white/15 text-white/60">
              v{currentVersion}
            </Badge>
            {status ? (
              <Badge variant="outline" className="border-white/15 text-white/60">
                {status}
              </Badge>
            ) : null}
            {(
              [
                ["preview", Eye, ar ? "معاينة" : "Preview"],
                [
                  "obligations",
                  ClipboardCheck,
                  ar ? "الالتزامات" : "Obligations",
                ],
                ["edit", Pencil, ar ? "تحرير" : "Edit"],
                ["versions", History, ar ? "الإصدارات" : "Versions"],
              ] as const
            ).map(([id, Icon, label]) => (
              <Button
                key={id}
                size="sm"
                variant="ghost"
                disabled={id === "edit" && locked}
                onClick={() => setStudioMode(id)}
                className={cn(
                  "h-8 rounded-full text-[11px] gap-1.5 border",
                  studioMode === id
                    ? "bg-white text-black border-white"
                    : "border-white/15 text-white/60 hover:text-white hover:bg-white/10"
                )}
              >
                <Icon className="size-3.5" />
                {label}
              </Button>
            ))}
            <Button
              size="sm"
              disabled={
                locked ||
                !proposalId ||
                !isDirty ||
                saveMutation.isPending
              }
              onClick={() => saveMutation.mutate()}
              className="h-8 rounded-full text-[11px] gap-1.5"
            >
              {saveMutation.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Save className="size-3.5" />
              )}
              {ar ? "حفظ" : "Save"}
            </Button>
          </div>
        </div>
        {locked ? (
          <p className="relative mt-3 text-[11px] text-amber-100/80">
            {ar
              ? "هذا العقد مقفل بعد إرساله للمراجعة أو الاعتماد أو التصدير."
              : "This contract is locked after review submission, approval, or export."}
          </p>
        ) : null}
      </div>

      {/* Research brief */}
      {showResearch && research ? (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="px-6 sm:px-10 py-5 border-b border-white/10 bg-black/20"
        >
          <p className="text-[11px] font-bold tracking-widest uppercase text-white/40 mb-3">
            {ar ? "بحث قبل الصياغة" : "Pre-draft research"}
          </p>
          <p className="text-xs text-white/55 leading-relaxed max-w-4xl mb-4">
            {ar ? research.updatePostureAr : research.updatePostureEn}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {research.findings.slice(0, 6).map((f) => (
              <div
                key={f.id}
                className="rounded-xl border border-white/10 bg-white/[0.03] p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-white">
                    {ar ? f.topicAr : f.topicEn}
                  </p>
                  <span className="text-[9px] font-mono text-white/40">
                    {f.certainty}
                  </span>
                </div>
                <p className="mt-1.5 text-[11px] text-white/50 leading-relaxed">
                  {ar ? f.statementAr : f.statementEn}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[10px] text-amber-200/80 leading-relaxed max-w-4xl">
            {ar ? research.disclaimerAr : research.disclaimerEn}
          </p>
        </motion.div>
      ) : null}

      {studioMode === "edit" ? (
        <div className="h-[min(70vh,720px)] p-4 sm:p-6">
          <Textarea
            value={draftMd}
            disabled={locked}
            onChange={(e) => setDraftMd(e.target.value)}
            dir="ltr"
            spellCheck
            className="h-full min-h-[520px] resize-none border-white/10 bg-black/25 font-mono text-xs leading-relaxed text-white placeholder:text-white/30"
            placeholder={
              ar ? "حرر نص العقد بصيغة Markdown..." : "Edit contract markdown..."
            }
          />
        </div>
      ) : studioMode === "versions" ? (
        <ScrollArea className="h-[min(70vh,720px)]">
          <div className="px-4 sm:px-8 py-8 space-y-4">
            {versions.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-16 text-white/40 text-sm">
                <History className="size-4" />
                {ar ? "لا توجد إصدارات محفوظة بعد" : "No saved versions yet"}
              </div>
            ) : (
              versions.map((item, i) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-white/10 bg-white/[0.025] p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge className="bg-white text-black">
                          v{item.version}
                        </Badge>
                        {item.version === currentVersion ? (
                          <Badge
                            variant="outline"
                            className="border-emerald-400/30 text-emerald-200"
                          >
                            {ar ? "الحالي" : "Current"}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-2 text-xs text-white/55">
                        {item.changeLog ?? (ar ? "تعديل عقد" : "Contract edit")} ·{" "}
                        {new Date(item.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {versions[i + 1] ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={compareMutation.isPending}
                          onClick={() =>
                            compareMutation.mutate({
                              a: versions[i + 1].version,
                              b: item.version,
                            })
                          }
                          className="h-8 text-[11px] gap-1 border border-white/15 text-white/60 hover:text-white hover:bg-white/10"
                        >
                          <GitCompare className="size-3.5" />
                          {ar ? "مقارنة" : "Compare"}
                        </Button>
                      ) : null}
                      {item.version !== currentVersion ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={locked || revertMutation.isPending}
                          onClick={() => revertMutation.mutate(item.version)}
                          className="h-8 text-[11px] gap-1 border border-white/15 text-white/60 hover:text-white hover:bg-white/10"
                        >
                          {revertMutation.isPending ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <RotateCcw className="size-3.5" />
                          )}
                          {ar ? "استعادة" : "Revert"}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))
            )}
            {diffLines.length > 0 ? (
              <pre className="max-h-72 overflow-auto rounded-xl border border-white/10 bg-black/30 p-4 text-[10px] text-white/65 whitespace-pre-wrap">
                {diffLines.slice(0, 240).join("\n")}
              </pre>
            ) : null}
          </div>
        </ScrollArea>
      ) : studioMode === "obligations" ? (
        <ScrollArea className="h-[min(70vh,720px)]">
          <div className="px-4 sm:px-8 py-8 space-y-4">
            <div className="rounded-xl border border-[oklch(0.72_0.12_195)]/20 bg-[oklch(0.72_0.12_195)]/10 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">
                    {ar
                      ? "سجل الالتزامات المستنتج"
                      : "Derived obligation register"}
                  </p>
                  <p className="mt-1 text-xs text-white/55 leading-relaxed max-w-2xl">
                    {ar
                      ? "مستخرج من البنود والمعالم لأغراض المتابعة. حالات الإنجاز محفوظة محلياً لهذا العقد."
                      : "Extracted from contract articles and milestones for follow-up. Done status is saved locally for this contract."}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className="border-white/15 text-white/60"
                >
                  {obligationRows.filter((row) => row.status === "done").length}/
                  {obligationRows.length} {ar ? "منجز" : "done"}
                </Badge>
              </div>
            </div>

            {obligationRows.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-16 text-white/40 text-sm">
                <ClipboardCheck className="size-4" />
                {ar
                  ? "لم يتم العثور على التزامات مستنتجة"
                  : "No derived obligations found"}
              </div>
            ) : (
              obligationRows.map((row) => (
                <div
                  key={row.id}
                  className={cn(
                    "rounded-xl border p-4 transition-colors",
                    row.status === "done"
                      ? "border-emerald-400/25 bg-emerald-500/10"
                      : "border-white/10 bg-white/[0.025]"
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className="border-white/15 text-white/55 text-[10px]"
                        >
                          {row.source}
                        </Badge>
                        <Badge
                          className={cn(
                            "text-[10px]",
                            row.status === "done"
                              ? "bg-emerald-500/20 text-emerald-100 border-emerald-400/25"
                              : "bg-amber-500/15 text-amber-100 border-amber-400/25"
                          )}
                        >
                          {row.status === "done"
                            ? ar
                              ? "منجز"
                              : "Done"
                            : ar
                              ? "مفتوح"
                              : "Open"}
                        </Badge>
                      </div>
                      <p className="mt-3 text-sm text-white/75 leading-relaxed whitespace-pre-wrap">
                        {row.text}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className={cn(
                        "h-8 rounded-full text-[11px] gap-1.5 border",
                        row.status === "done"
                          ? "border-emerald-400/30 text-emerald-100 hover:bg-emerald-500/15"
                          : "border-white/15 text-white/60 hover:text-white hover:bg-white/10"
                      )}
                      aria-pressed={row.status === "done"}
                      onClick={() => toggleObligation(row.id)}
                    >
                      <CheckCircle2 className="size-3.5" />
                      {row.status === "done"
                        ? ar
                          ? "إعادة فتح"
                          : "Reopen"
                        : ar
                          ? "وضع كمنجز"
                          : "Mark done"}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      ) : (
        <ScrollArea className="h-[min(70vh,720px)]">
          <div className="px-4 sm:px-8 py-8 space-y-6">
            {articles.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-16 text-white/40 text-sm">
                <Loader2 className="size-4 animate-spin" />
                {ar ? "لا بنود قابلة للعرض" : "No parseable articles"}
              </div>
            ) : (
              articles.map((article, i) => (
                <motion.article
                  key={article.number}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-20px" }}
                  transition={{ delay: Math.min(i * 0.03, 0.2) }}
                  className="rounded-xl border border-white/10 bg-white/[0.025] overflow-hidden"
                >
                  <div className="flex items-center gap-3 px-5 py-3 border-b border-white/10 bg-white/[0.03]">
                    <span className="flex size-8 items-center justify-center rounded-full bg-[oklch(0.72_0.12_195)]/15 text-[oklch(0.82_0.1_195)] text-xs font-bold font-mono">
                      {String(article.number).padStart(2, "0")}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">
                        {ar ? article.titleAr : article.titleEn}
                      </p>
                      <p className="text-[11px] text-white/40 truncate">
                        {ar ? article.titleEn : article.titleAr}
                      </p>
                    </div>
                  </div>

                {mode === "split" ? (
                  <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-white/10 rtl:md:divide-x-reverse">
                    <div
                      className="p-5 font-[family-name:var(--font-space-grotesk)]"
                      dir="ltr"
                      lang="en"
                    >
                      <p className="text-[10px] font-bold tracking-widest uppercase text-white/35 mb-2">
                        English
                      </p>
                      <p className="text-[13px] leading-[1.75] text-white/75 whitespace-pre-wrap">
                        {article.bodyEn}
                      </p>
                    </div>
                    <div
                      className="p-5 font-[family-name:var(--font-ibm-arabic)]"
                      dir="rtl"
                      lang="ar"
                    >
                      <p className="text-[10px] font-bold tracking-widest uppercase text-white/35 mb-2">
                        العربية
                      </p>
                      <p className="text-[13px] leading-[1.9] text-white/75 whitespace-pre-wrap">
                        {article.bodyAr}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div
                    className={cn(
                      "p-5",
                      mode === "ar"
                        ? "font-[family-name:var(--font-ibm-arabic)]"
                        : "font-[family-name:var(--font-space-grotesk)]"
                    )}
                    dir={mode === "ar" ? "rtl" : "ltr"}
                    lang={mode === "ar" ? "ar" : "en"}
                  >
                    <p className="text-[13px] leading-[1.85] text-white/75 whitespace-pre-wrap">
                      {mode === "ar" ? article.bodyAr : article.bodyEn}
                    </p>
                  </div>
                )}
              </motion.article>
            ))
          )}
        </div>
      </ScrollArea>
      )}

      <div className="px-6 sm:px-10 py-4 border-t border-white/10 text-[10px] text-white/40 leading-relaxed">
        {ar
          ? "وكيل القانون يبحث سجل الأطر السعودية ومستخرج الكراسة قبل الصياغة. التحقق من النشرات الرسمية واجب على المستشار المعتمد — لا يقين قانوني بنسبة 100%."
          : "The Law agent researches the Saudi framework registry and tender extracts before drafting. Official publication verification is required by authorized counsel — no 100% legal certainty."}
      </div>
    </div>
  );
}
