"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  Plus,
  Filter,
  ShieldAlert,
  Scale,
  Search,
  Check,
  AlertTriangle,
  Loader2,
  FileText,
  Sparkles,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLocale, useUI } from "@/lib/store";
import { apiJson } from "@/lib/api-client";
import { tr } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { create } from "zustand";

type Clause = {
  id: string;
  clauseKey: string | null;
  nameEn: string;
  nameAr: string;
  contentEn: string;
  contentAr: string;
  category: string;
  mandatory: boolean;
  isCustom: boolean;
  isSystem: boolean;
  order: number;
  legalReviewStatus: string;
  counselReviewRequired: boolean;
  translationStatus: string;
  canonicalHash: string | null;
};

type ClausesResponse = {
  clauses: Clause[];
  nextCursor: string | null;
};

const CATEGORY_OPTIONS = [
  "FOUNDATION",
  "PERFORMANCE",
  "GOVERNANCE",
  "RISK",
  "GOODS",
  "PROFESSIONAL_SERVICES",
  "CONFIDENTIALITY",
  "DATA_AND_SECURITY",
  "SUBCONTRACT",
  "COMPLIANCE",
  "COMMERCIAL",
  "FRAMEWORK",
  "SAAS",
  "EXIT",
];

interface ClauseSelectionState {
  selectedIds: string[];
  toggle: (id: string) => void;
  clear: () => void;
  setAll: (ids: string[]) => void;
}

export const useClauseSelection = create<ClauseSelectionState>((set) => ({
  selectedIds: [],
  toggle: (id) =>
    set((s) => ({
      selectedIds: s.selectedIds.includes(id)
        ? s.selectedIds.filter((x) => x !== id)
        : [...s.selectedIds, id],
    })),
  clear: () => set({ selectedIds: [] }),
  setAll: (ids) => set({ selectedIds: ids }),
}));

export function ClauseBrowser() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const { toast } = useToast();
  const qc = useQueryClient();
  const { selectedIds, toggle, clear } = useClauseSelection();
  const [category, setCategory] = useState<string>("");
  const [mandatoryOnly, setMandatoryOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [cursorStack, setCursorStack] = useState<(string | null)[]>([null]);
  const [currentCursor, setCurrentCursor] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [draftEn, setDraftEn] = useState("");
  const [draftAr, setDraftAr] = useState("");
  const [draftCat, setDraftCat] = useState("GENERAL");
  const [draftTitleEn, setDraftTitleEn] = useState("");
  const [draftTitleAr, setDraftTitleAr] = useState("");

  const queryKey = ["clauses", category, mandatoryOnly, search, currentCursor];

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (category) params.set("category", category);
      if (mandatoryOnly) params.set("mandatory", "true");
      if (search.trim()) params.set("search", search.trim());
      if (currentCursor) params.set("cursor", currentCursor);
      params.set("take", "50");
      return apiJson<ClausesResponse>(`/api/clauses?${params.toString()}`);
    },
  });

  const clauses = data?.clauses ?? [];
  const nextCursor = data?.nextCursor ?? null;

  const createMutation = useMutation({
    mutationFn: async () => {
      return apiJson<{ clause: Clause }>("/api/clauses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: draftCat,
          englishText: draftEn,
          arabicText: draftAr,
          titleEn: draftTitleEn,
          titleAr: draftTitleAr,
        }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clauses"] });
      setShowCreate(false);
      setDraftEn("");
      setDraftAr("");
      setDraftTitleEn("");
      setDraftTitleAr("");
      toast({ title: ar ? "تم إنشاء البند" : "Clause created" });
    },
    onError: (err: any) => {
      const msg = err?.message ?? (ar ? "فشل إنشاء البند" : "Failed to create clause");
      toast({ title: msg, variant: "destructive" });
    },
  });

  const selectMutation = useMutation({
    mutationFn: async () => {
      if (selectedIds.length === 0) throw new Error(ar ? "لم يتم اختيار بنود" : "No clauses selected");
      return apiJson<{ combined: Clause[] }>("/api/clauses/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clauseIds: selectedIds }),
      });
    },
    onSuccess: (res) => {
      window.dispatchEvent(
        new CustomEvent("clause-library:select", { detail: { clauses: res.combined } })
      );
      toast({
        title: ar ? `تم إدراج ${res.combined.length} بندًا` : `Inserted ${res.combined.length} clauses`,
      });
    },
    onError: (e: any) => {
      toast({ title: e?.message ?? "Select failed", variant: "destructive" });
    },
  });

  function handleNextPage() {
    if (nextCursor) {
      setCursorStack((prev) => [...prev, nextCursor]);
      setCurrentCursor(nextCursor);
    }
  }

  function handlePrevPage() {
    if (cursorStack.length > 1) {
      const newStack = cursorStack.slice(0, -1);
      setCursorStack(newStack);
      setCurrentCursor(newStack[newStack.length - 1]);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-5 border-border/60">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="size-10 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 flex items-center justify-center shrink-0">
              <BookOpen className="size-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">{tr("clause_library_title", locale)}</h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-2xl leading-relaxed">
                {tr("clause_library_subtitle", locale)}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge variant="outline" className="text-[10px] gap-1">
                  <Scale className="size-3" />
                  {ar ? "32 بند معياري" : "32 standard clauses"}
                </Badge>
                <Badge variant="secondary" className="text-[10px] gap-1 bg-amber-500/10 text-amber-700 dark:text-amber-300">
                  <ShieldAlert className="size-3" />
                  {tr("clause_counsel_required", locale)}
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  UNREVIEWED
                </Badge>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowCreate(true)}>
              <Plus className="size-3.5" />
              {tr("clause_add_custom", locale)}
            </Button>
            {selectedIds.length > 0 && (
              <Button
                size="sm"
                className="gap-1.5"
                disabled={selectMutation.isPending}
                onClick={() => selectMutation.mutate()}
              >
                {selectMutation.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Sparkles className="size-3.5" />
                )}
                {tr("clause_insert_draft", locale)} ({selectedIds.length})
              </Button>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentCursor(null);
                setCursorStack([null]);
              }}
              placeholder={tr("clause_filter_search", locale)}
              className="ps-8 h-9 text-sm"
            />
          </div>

          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setCurrentCursor(null);
              setCursorStack([null]);
            }}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">{ar ? "كل الفئات" : "All categories"}</option>
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <label className="flex items-center gap-2 text-sm px-2 border rounded-md h-9 cursor-pointer">
            <input
              type="checkbox"
              checked={mandatoryOnly}
              onChange={(e) => {
                setMandatoryOnly(e.target.checked);
                setCurrentCursor(null);
                setCursorStack([null]);
              }}
              className="rounded"
            />
            <span className="flex items-center gap-1">
              <Filter className="size-3.5" />
              {tr("clause_filter_mandatory", locale)}
            </span>
          </label>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading} className="h-9">
              {isLoading ? <Loader2 className="size-4 animate-spin" /> : ar ? "تحديث" : "Refresh"}
            </Button>
            {selectedIds.length > 0 && (
              <Button variant="ghost" size="sm" onClick={clear} className="h-9">
                {ar ? "مسح التحديد" : "Clear selection"}
              </Button>
            )}
          </div>
        </div>
      </Card>

      {isLoading && (
        <Card className="p-4 border-dashed">
          <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            <span className="text-sm">{tr("loading", locale)}</span>
          </div>
        </Card>
      )}

      {isError && (
        <Card className="p-4 border-destructive/50 bg-destructive/5">
          <div className="flex items-start gap-2 text-sm">
            <AlertTriangle className="size-4 text-destructive shrink-0 mt-0.5" />
            <span>{(error as any)?.message ?? (ar ? "تعذر تحميل البنود" : "Could not load clauses")}</span>
          </div>
        </Card>
      )}

      {!isLoading && clauses.length === 0 && !isError && (
        <Card className="border-dashed p-8 text-center">
          <FileText className="size-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm font-medium">{tr("clause_empty", locale)}</p>
          <p className="text-xs text-muted-foreground mt-1">{tr("clause_empty_hint", locale)}</p>
        </Card>
      )}

      <div className="grid gap-3">
        {clauses.map((cl) => {
          const isSelected = selectedIds.includes(cl.id);
          return (
            <Card
              key={cl.id}
              className={`p-4 border-border/60 transition-colors ${isSelected ? "border-indigo-500/50 bg-indigo-50/30 dark:bg-indigo-950/20" : "hover:border-indigo-500/30"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                    <button
                      type="button"
                      onClick={() => toggle(cl.id)}
                      className={`size-5 rounded border flex items-center justify-center transition-colors ${isSelected ? "bg-indigo-600 border-indigo-600 text-white" : "border-input bg-background"}`}
                    >
                      {isSelected && <Check className="size-3" />}
                    </button>
                    <span className="text-[11px] font-mono text-muted-foreground">{cl.clauseKey ?? cl.id.slice(0, 8)}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {cl.category}
                    </Badge>
                    {cl.mandatory ? (
                      <Badge className="text-[10px] bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/20">
                        {tr("clause_mandatory_badge", locale)}
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">
                        {tr("clause_optional_badge", locale)}
                      </Badge>
                    )}
                    {cl.isCustom ? (
                      <Badge variant="secondary" className="text-[10px] bg-violet-500/10 text-violet-700 dark:text-violet-300">
                        {tr("clause_custom_badge", locale)}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">
                        {tr("clause_system_badge", locale)}
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-[10px] gap-1">
                      <ShieldAlert className="size-3" />
                      {cl.legalReviewStatus}
                    </Badge>
                    {cl.counselReviewRequired && (
                      <span title={tr("clause_counsel_required", locale)} className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-0.5">
                        <Scale className="size-3" />
                      </span>
                    )}
                  </div>

                  <h4 className="text-sm font-semibold truncate">
                    {ar ? cl.nameAr || cl.nameEn : cl.nameEn}
                  </h4>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{ar ? cl.nameEn : cl.nameAr}</p>
                </div>
                <Button size="sm" variant="ghost" className="shrink-0 gap-1" onClick={() => toggle(cl.id)}>
                  <Check className="size-3.5" />
                  {isSelected ? (ar ? "تم التحديد" : "Selected") : (ar ? "تحديد" : "Select")}
                </Button>
              </div>

              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-lg border border-border/50 bg-muted/20 p-3 max-h-32 overflow-auto">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">EN</div>
                  <p className="text-xs leading-relaxed whitespace-pre-wrap">{cl.contentEn.slice(0, 600)}</p>
                </div>
                <div className="rounded-lg border border-border/50 bg-muted/20 p-3 max-h-32 overflow-auto" dir="rtl">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">AR</div>
                  <p className="text-xs leading-relaxed whitespace-pre-wrap">{cl.contentAr.slice(0, 600)}</p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {(nextCursor || cursorStack.length > 1) && (
        <div className="flex justify-between items-center pt-2">
          <Button variant="outline" size="sm" disabled={cursorStack.length <= 1} onClick={handlePrevPage}>
            {ar ? "السابق" : "Previous"}
          </Button>
          <Button variant="outline" size="sm" disabled={!nextCursor} onClick={handleNextPage}>
            {ar ? "التالي" : "Next"}
          </Button>
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>{tr("clause_create_title", locale)}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium">{tr("clause_field_category", locale)}</label>
                <select
                  value={draftCat}
                  onChange={(e) => setDraftCat(e.target.value)}
                  className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  {CATEGORY_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                  <option value="GENERAL">GENERAL</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium">{tr("clause_field_title_en", locale)}</label>
                <Input value={draftTitleEn} onChange={(e) => setDraftTitleEn(e.target.value)} className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium">{tr("clause_field_title_ar", locale)}</label>
                <Input value={draftTitleAr} onChange={(e) => setDraftTitleAr(e.target.value)} className="mt-1" dir="rtl" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium">{tr("clause_field_content_en", locale)} *</label>
              <textarea
                value={draftEn}
                onChange={(e) => setDraftEn(e.target.value)}
                rows={4}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="English clause text..."
              />
            </div>
            <div>
              <label className="text-xs font-medium" dir="rtl">
                {tr("clause_field_content_ar", locale)} *
              </label>
              <textarea
                value={draftAr}
                onChange={(e) => setDraftAr(e.target.value)}
                rows={4}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                dir="rtl"
                placeholder="نص البند بالعربية..."
              />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="ghost" onClick={() => setShowCreate(false)}>
                {tr("clause_cancel", locale)}
              </Button>
              <Button
                disabled={createMutation.isPending || !draftEn.trim() || !draftAr.trim()}
                onClick={() => createMutation.mutate()}
                className="gap-1"
              >
                {createMutation.isPending && <Loader2 className="size-4 animate-spin" />}
                {tr("clause_save", locale)}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
