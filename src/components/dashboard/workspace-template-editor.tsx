"use client";

import { useMemo, useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { FileStack, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useLocale } from "@/lib/store";
import { tr } from "@/lib/i18n";
import { apiJson } from "@/lib/api-client";
import type { WorkspaceTemplateSummary } from "@/lib/contract-template-authoring";
import { ErrorState } from "@/components/patterns";

type TemplateListResponse = {
  templates: WorkspaceTemplateSummary[];
  nextCursor: string | null;
};

type VersionListResponse = {
  versions: Array<{
    id: string;
    version: string;
    canonicalHash: string;
    createdAt: string;
    changeNote?: string | null;
  }>;
  nextCursor: string | null;
};

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function WorkspaceTemplateEditor() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [key, setKey] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [titleAr, setTitleAr] = useState("");
  const [sectionTitleEn, setSectionTitleEn] = useState("Preamble");
  const [sectionTitleAr, setSectionTitleAr] = useState("التمهيد");
  const [sectionBodyEn, setSectionBodyEn] = useState(
    "This agreement sets out the parties' obligations."
  );
  const [sectionBodyAr, setSectionBodyAr] = useState(
    "تحدد هذه الاتفاقية التزامات الأطراف."
  );
  const [changeNote, setChangeNote] = useState("");

  const listQuery = useInfiniteQuery({
    queryKey: ["workspace-templates"],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ limit: "20" });
      if (pageParam) params.set("cursor", pageParam);
      return apiJson<TemplateListResponse>(
        `/api/contracts/workspace-templates?${params}`
      );
    },
    getNextPageParam: (last) => last.nextCursor,
  });

  const templates = useMemo(
    () => listQuery.data?.pages.flatMap((page) => page.templates) ?? [],
    [listQuery.data]
  );

  const selected = templates.find((item) => item.id === selectedId) ?? null;

  const versionsQuery = useQuery({
    queryKey: ["workspace-template-versions", selectedId],
    enabled: Boolean(selectedId),
    queryFn: () =>
      apiJson<VersionListResponse>(
        `/api/contracts/workspace-templates/${selectedId}/versions?limit=20`
      ),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const templateKey = slugify(key || titleEn);
      return apiJson<{ template: WorkspaceTemplateSummary }>(
        "/api/contracts/workspace-templates",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            key: templateKey,
            titleAr: titleAr.trim(),
            titleEn: titleEn.trim(),
            sections: [
              {
                key: "preamble",
                titleAr: sectionTitleAr.trim(),
                titleEn: sectionTitleEn.trim(),
                contentAr: [{ type: "TEXT", value: sectionBodyAr.trim() }],
                contentEn: [{ type: "TEXT", value: sectionBodyEn.trim() }],
              },
            ],
            variables: [],
            clauseBindings: [],
          }),
        }
      );
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-templates"] });
      setSelectedId(result.template.id);
      setShowCreate(false);
      toast({ title: tr("template_create_action", locale) });
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error("No template selected");
      return apiJson<{ template: WorkspaceTemplateSummary }>(
        `/api/contracts/workspace-templates/${selectedId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            titleAr: titleAr.trim() || selected?.titleAr,
            titleEn: titleEn.trim() || selected?.titleEn,
            sections: [
              {
                key: "preamble",
                titleAr: sectionTitleAr.trim(),
                titleEn: sectionTitleEn.trim(),
                contentAr: [{ type: "TEXT", value: sectionBodyAr.trim() }],
                contentEn: [{ type: "TEXT", value: sectionBodyEn.trim() }],
              },
            ],
            variables: [],
            clauseBindings: [],
            changeNote: changeNote.trim() || undefined,
          }),
        }
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-templates"] });
      void queryClient.invalidateQueries({
        queryKey: ["workspace-template-versions", selectedId],
      });
      setChangeNote("");
      toast({ title: tr("template_update_action", locale) });
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: "destructive" });
    },
  });

  const retireMutation = useMutation({
    mutationFn: async (id: string) =>
      apiJson(`/api/contracts/workspace-templates/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-templates"] });
      setSelectedId(null);
      toast({ title: tr("template_retire_action", locale) });
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: "destructive" });
    },
  });

  function selectTemplate(template: WorkspaceTemplateSummary) {
    setSelectedId(template.id);
    setShowCreate(false);
    setKey(template.key);
    setTitleEn(template.titleEn);
    setTitleAr(template.titleAr);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <aside className="rounded-xl border bg-card p-3 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">
            {tr("template_editor_title", locale)}
          </h3>
          <Button
            size="sm"
            variant="outline"
            className="gap-1"
            onClick={() => {
              setShowCreate(true);
              setSelectedId(null);
              setKey("");
              setTitleEn("");
              setTitleAr("");
            }}
          >
            <Plus className="size-3.5" />
            {tr("template_create_action", locale)}
          </Button>
        </div>

        {listQuery.isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : listQuery.isError ? (
          <ErrorState
            message={
              ar
                ? "تعذر تحميل قوالب مساحة العمل"
                : "Could not load workspace templates"
            }
            onRetry={() => void listQuery.refetch()}
            retryLabel={ar ? "إعادة المحاولة" : "Retry"}
            className="py-4"
          />
        ) : templates.length === 0 ? (
          <p className="text-xs text-muted-foreground py-6 text-center">
            {ar ? "لا توجد قوالب مساحة عمل بعد" : "No workspace templates yet"}
          </p>
        ) : (
          <ul className="space-y-1 max-h-[60dvh] overflow-y-auto">
            {templates.map((template) => (
              <li key={template.id}>
                <button
                  type="button"
                  onClick={() => selectTemplate(template)}
                  className={`w-full rounded-lg border px-3 py-2 text-start text-sm transition-colors ${
                    selectedId === template.id
                      ? "border-primary bg-primary/10"
                      : "border-transparent hover:bg-muted/60"
                  }`}
                >
                  <div className="font-medium truncate">
                    {ar ? template.titleAr : template.titleEn}
                  </div>
                  <div className="text-[10px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                    <span className="font-mono">{template.key}</span>
                    <Badge variant="outline" className="text-[9px]">
                      {template.lifecycle}
                    </Badge>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}

        {listQuery.hasNextPage && (
          <Button
            size="sm"
            variant="ghost"
            className="w-full"
            disabled={listQuery.isFetchingNextPage}
            onClick={() => void listQuery.fetchNextPage()}
          >
            {listQuery.isFetchingNextPage ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : ar ? (
              "تحميل المزيد"
            ) : (
              "Load more"
            )}
          </Button>
        )}
      </aside>

      <section className="rounded-xl border bg-card p-4 space-y-4">
        {!showCreate && !selected ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
            <FileStack className="size-10 opacity-40" />
            <p className="text-sm">
              {ar
                ? "اختر قالباً أو أنشئ قالباً جديداً"
                : "Select a template or create a new one"}
            </p>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              {showCreate && (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="tpl-key">{ar ? "مفتاح القالب" : "Template key"}</Label>
                  <Input
                    id="tpl-key"
                    dir="ltr"
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    placeholder="services-agreement"
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="tpl-title-en">Title (EN)</Label>
                <Input
                  id="tpl-title-en"
                  dir="ltr"
                  value={titleEn}
                  onChange={(e) => setTitleEn(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tpl-title-ar">العنوان (AR)</Label>
                <Input
                  id="tpl-title-ar"
                  dir="rtl"
                  value={titleAr}
                  onChange={(e) => setTitleAr(e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{tr("template_section_title", locale)} (EN)</Label>
                <Input
                  dir="ltr"
                  value={sectionTitleEn}
                  onChange={(e) => setSectionTitleEn(e.target.value)}
                />
                <Textarea
                  dir="ltr"
                  rows={5}
                  value={sectionBodyEn}
                  onChange={(e) => setSectionBodyEn(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{tr("template_section_title", locale)} (AR)</Label>
                <Input
                  dir="rtl"
                  value={sectionTitleAr}
                  onChange={(e) => setSectionTitleAr(e.target.value)}
                />
                <Textarea
                  dir="rtl"
                  rows={5}
                  value={sectionBodyAr}
                  onChange={(e) => setSectionBodyAr(e.target.value)}
                />
              </div>
            </div>

            {!showCreate && (
              <div className="space-y-1.5">
                <Label htmlFor="tpl-note">
                  {ar ? "ملاحظة التغيير" : "Change note"}
                </Label>
                <Input
                  id="tpl-note"
                  value={changeNote}
                  onChange={(e) => setChangeNote(e.target.value)}
                  maxLength={1000}
                />
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {showCreate ? (
                <Button
                  className="gap-1.5"
                  disabled={
                    createMutation.isPending ||
                    !titleEn.trim() ||
                    !titleAr.trim() ||
                    !sectionBodyEn.trim() ||
                    !sectionBodyAr.trim()
                  }
                  onClick={() => createMutation.mutate()}
                >
                  {createMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Plus className="size-4" />
                  )}
                  {tr("template_create_action", locale)}
                </Button>
              ) : (
                <>
                  <Button
                    className="gap-1.5"
                    disabled={
                      updateMutation.isPending ||
                      !sectionBodyEn.trim() ||
                      !sectionBodyAr.trim()
                    }
                    onClick={() => updateMutation.mutate()}
                  >
                    {updateMutation.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : null}
                    {tr("template_update_action", locale)}
                  </Button>
                  {selected && selected.lifecycle !== "RETIRED" && (
                    <Button
                      variant="destructive"
                      className="gap-1.5"
                      disabled={retireMutation.isPending}
                      onClick={() => retireMutation.mutate(selected.id)}
                    >
                      <Trash2 className="size-4" />
                      {tr("template_retire_action", locale)}
                    </Button>
                  )}
                </>
              )}
            </div>

            {selected && (
              <div className="border-t pt-4 space-y-2">
                <h4 className="text-sm font-semibold">
                  {tr("template_history_title", locale)}
                </h4>
                {versionsQuery.isLoading ? (
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                ) : (
                  <ul className="space-y-1.5 text-xs">
                    {(versionsQuery.data?.versions ?? []).map((version) => (
                      <li
                        key={version.id}
                        className="rounded-md border px-3 py-2 flex items-center justify-between gap-2"
                      >
                        <span>
                          {tr("template_version_number", locale, {
                            version: version.version,
                          })}
                        </span>
                        <span className="text-muted-foreground font-mono truncate max-w-[40%]">
                          {version.canonicalHash.slice(0, 12) || "—"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
