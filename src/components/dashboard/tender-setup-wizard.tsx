"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocale, useUI } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import { apiJson } from "@/lib/api-client";
import { TENDER_TYPES, getTenderType } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Sparkles,
} from "lucide-react";

type Step = 0 | 1 | 2 | 3;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const STEPS = [
  { en: "Identity", ar: "الهوية" },
  { en: "Tender type", ar: "نوع المناقصة" },
  { en: "Targets", ar: "الأهداف" },
  { en: "Review", ar: "مراجعة" },
] as const;

/**
 * Guided multi-step tender project creation — replaces the thin create dialog.
 */
export function TenderSetupWizard({ open, onOpenChange }: Props) {
  const { locale } = useLocale();
  const { setView, setActiveProjectId, setTenderType } = useUI();
  const ar = locale === "ar";
  const qc = useQueryClient();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>(0);
  const [title, setTitle] = useState("");
  const [titleAr, setTitleAr] = useState("");
  const [etimadRef, setEtimadRef] = useState("");
  const [category, setCategory] = useState("IT");
  const [budget, setBudget] = useState("");
  const [deadline, setDeadline] = useState("");
  const [saudization, setSaudization] = useState("30");
  const [localContent, setLocalContent] = useState("40");

  const tender = useMemo(() => getTenderType(category), [category]);

  function reset() {
    setStep(0);
    setTitle("");
    setTitleAr("");
    setEtimadRef("");
    setCategory("IT");
    setBudget("");
    setDeadline("");
    setSaudization("30");
    setLocalContent("40");
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      const body = {
        title: title.trim(),
        titleAr: titleAr.trim() || null,
        etimadRef: etimadRef.trim() || undefined,
        category,
        budget: budget ? Number(budget) : null,
        currency: "SAR",
        submissionDeadline: deadline
          ? new Date(deadline).toISOString()
          : undefined,
        saudizationTarget: Number(saudization) || 0,
        localContentTarget: Number(localContent) || 0,
      };
      return apiJson<{ project?: { id: string } }>("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      setTenderType(category);
      onOpenChange(false);
      reset();
      if (data.project?.id) {
        setActiveProjectId(data.project.id);
        setView("documents");
      }
      toast({
        title: ar ? "تم إعداد المناقصة" : "Tender project ready",
        description: ar
          ? "ارفع كراسة الشروط ثم شغّل الوكلاء."
          : "Upload the RFP, then run the agents.",
      });
    },
    onError: (err: Error) => {
      toast({
        title: ar ? "فشل الإنشاء" : "Create failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  function canNext(): boolean {
    if (step === 0) return title.trim().length >= 3;
    if (step === 1) return Boolean(category);
    if (step === 2) return true;
    return title.trim().length >= 3;
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-xl gap-0 p-0 overflow-hidden">
        <DialogHeader className="border-b border-border/60 px-5 py-4 space-y-3">
          <DialogTitle>
            {ar ? "إعداد مناقصة جديدة" : "Set up a new tender"}
          </DialogTitle>
          <DialogDescription>
            {ar
              ? "تدفق منظم من الهوية إلى الأهداف — ثم ارفع الكراسة وشغّل الوكلاء."
              : "A clear path from identity to targets — then upload the RFP and run agents."}
          </DialogDescription>
          <ol className="flex flex-wrap gap-1.5 pt-1">
            {STEPS.map((s, i) => {
              const done = i < step;
              const active = i === step;
              return (
                <li key={s.en}>
                  <Badge
                    variant={active ? "default" : "outline"}
                    className={cn(
                      "gap-1 text-[10px]",
                      done && "border-emerald-500/40 bg-emerald-500/10 text-emerald-700"
                    )}
                  >
                    {done ? <Check className="size-3" /> : <span>{i + 1}</span>}
                    {ar ? s.ar : s.en}
                  </Badge>
                </li>
              );
            })}
          </ol>
        </DialogHeader>

        <div className="px-5 py-4 space-y-4 min-h-[280px]">
          {step === 0 ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="tender-title">
                  {ar ? "عنوان المشروع (EN)" : "Project title (EN)"}
                </Label>
                <Input
                  id="tender-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Smart City Infrastructure RFP"
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tender-title-ar">
                  {ar ? "العنوان بالعربية" : "Arabic title"}
                </Label>
                <Input
                  id="tender-title-ar"
                  value={titleAr}
                  onChange={(e) => setTitleAr(e.target.value)}
                  placeholder="مناقصة البنية التحتية للمدينة الذكية"
                  dir="rtl"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tender-etimad">
                  {ar ? "مرجع اعتماد (اختياري)" : "Etimad reference (optional)"}
                </Label>
                <Input
                  id="tender-etimad"
                  value={etimadRef}
                  onChange={(e) => setEtimadRef(e.target.value)}
                  placeholder="ETM-2026-…"
                  className="font-mono"
                />
              </div>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {TENDER_TYPES.map((t) => {
                const selected = category === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setCategory(t.id)}
                    className={cn(
                      "rounded-xl border p-3 text-start transition-colors",
                      selected
                        ? "border-teal-500/50 bg-teal-500/10"
                        : "border-border/70 hover:border-teal-500/30"
                    )}
                  >
                    <p className="text-sm font-semibold">
                      {ar ? t.nameAr : t.name}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {t.evaluationSplit.technical}% / {t.evaluationSplit.financial}% · SLA{" "}
                      {t.slaMaxPenalty}%
                    </p>
                  </button>
                );
              })}
            </div>
          ) : null}

          {step === 2 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="tender-budget">
                  {ar ? "الميزانية (ر.س)" : "Budget (SAR)"}
                </Label>
                <Input
                  id="tender-budget"
                  type="number"
                  min={0}
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  placeholder={String(tender.typicalBudget)}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="tender-deadline">
                  {ar ? "موعد التسليم" : "Submission deadline"}
                </Label>
                <Input
                  id="tender-deadline"
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tender-saud">
                  {ar ? "هدف السعودة %" : "Saudization %"}
                </Label>
                <Input
                  id="tender-saud"
                  type="number"
                  min={0}
                  max={100}
                  value={saudization}
                  onChange={(e) => setSaudization(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tender-local">
                  {ar ? "المحتوى المحلي %" : "Local content %"}
                </Label>
                <Input
                  id="tender-local"
                  type="number"
                  min={0}
                  max={100}
                  value={localContent}
                  onChange={(e) => setLocalContent(e.target.value)}
                />
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="rounded-xl border border-border/70 bg-muted/20 p-4 space-y-2 text-sm">
              <p className="font-semibold">{title || "—"}</p>
              {titleAr ? (
                <p className="text-muted-foreground" dir="rtl">
                  {titleAr}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2 pt-1">
                <Badge variant="secondary">
                  {ar ? tender.nameAr : tender.name}
                </Badge>
                {etimadRef ? (
                  <Badge variant="outline" className="font-mono">
                    {etimadRef}
                  </Badge>
                ) : (
                  <Badge variant="outline">
                    {ar ? "مرجع تلقائي" : "Auto Etimad ref"}
                  </Badge>
                )}
                {budget ? (
                  <Badge variant="outline">
                    {Number(budget).toLocaleString()} SAR
                  </Badge>
                ) : null}
                {deadline ? (
                  <Badge variant="outline">{deadline}</Badge>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground pt-2 leading-relaxed">
                {ar
                  ? "بعد الإنشاء ستنتقل إلى المستندات لرفع كراسة الشروط، ثم شغّل الوكلاء لتوليد العرض والعقد."
                  : "After create you’ll go to Documents to upload the RFP, then run agents to draft the proposal and contract."}
              </p>
            </div>
          ) : null}
        </div>

        <DialogFooter className="border-t border-border/60 px-5 py-3 gap-2 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            disabled={step === 0 || createMutation.isPending}
            onClick={() => setStep((s) => (Math.max(0, s - 1) as Step))}
            className="gap-1"
          >
            <ChevronLeft className="size-4" />
            {ar ? "رجوع" : "Back"}
          </Button>
          <div className="flex gap-2">
            {step < 3 ? (
              <Button
                type="button"
                disabled={!canNext()}
                onClick={() => setStep((s) => (Math.min(3, s + 1) as Step))}
                className="gap-1"
              >
                {ar ? "التالي" : "Next"}
                <ChevronRight className="size-4" />
              </Button>
            ) : (
              <Button
                type="button"
                disabled={!canNext() || createMutation.isPending}
                onClick={() => createMutation.mutate()}
                className="gap-1"
              >
                {createMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                {ar ? "إنشاء ومتابعة" : "Create & continue"}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
