"use client";

import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocale, useUI } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Loader2,
  Save,
  Eye,
  Download,
  Plus,
  CheckCircle2,
  AlertCircle,
  LayoutGrid,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  type ProposalSection,
  type ProposalMetadata,
  type ValidationSummary,
  type SectionType,
} from "@/lib/proposal-builder-types";
import {
  getDefaultSections,
  validateProposalSections,
  getAvailableSectionTypes,
  getSectionLabel,
  sectionsToPrintableHtml,
} from "@/lib/proposal-builder-engine";
import { consumePendingProposalBuilderDraft } from "@/lib/proposal-builder-draft";
import { saveBlob } from "@/lib/download-artifact";
import { ProposalBuilderSections } from "./proposal-builder-sections";
import { ProposalBuilderPreview } from "./proposal-builder-preview";
import { ProposalBuilderToolbar } from "./proposal-builder-toolbar";
import { CollaborationComments } from "./collaboration-comments";
import { CollaborationPresenceBar } from "./collaboration-presence";

type BuilderMode = "edit" | "preview" | "split";

export function ProposalBuilder() {
  const { locale } = useLocale();
  const ar = locale === "ar";
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { activeProjectId } = useUI();

  const [mode, setMode] = useState<BuilderMode>("split");
  const [sections, setSections] = useState<ProposalSection[]>(getDefaultSections());
  const [metadata, setMetadata] = useState<ProposalMetadata>({
    title: { ar: "", en: "" },
    projectId: activeProjectId || "",
    workspaceId: "",
    locale: locale as "ar" | "en",
    version: 1,
  });
  const [isDirty, setIsDirty] = useState(false);
  const [validationSummary, setValidationSummary] = useState<ValidationSummary | null>(null);
  const [selectedSectionKey, setSelectedSectionKey] = useState<string | null>(null);
  const [draftBanner, setDraftBanner] = useState<string | null>(null);
  const [hydratedFromHandoff, setHydratedFromHandoff] = useState(false);

  // Marketplace / blank handoff (sessionStorage) — runs once on mount.
  useEffect(() => {
    const draft = consumePendingProposalBuilderDraft();
    if (!draft) return;
    setSections(draft.sections);
    setMetadata((prev) => ({
      ...prev,
      proposalId: draft.proposalId ?? prev.proposalId,
      title: draft.title,
      projectId: draft.projectId || activeProjectId || prev.projectId,
    }));
    setIsDirty(!draft.proposalId);
    setSelectedSectionKey(draft.sections[0]?.sectionKey ?? null);
    setHydratedFromHandoff(true);
    setDraftBanner(
      draft.proposalId
        ? ar
          ? "تم تحميل مسودة القالب المحفوظة"
          : "Loaded saved template draft"
        : ar
          ? "مسودة قالب جاهزة — اختر مشروعاً ثم احفظ"
          : "Template draft ready — select a project, then save"
    );
  }, [activeProjectId, ar]);

  // Keep projectId in sync when the workspace selection changes.
  useEffect(() => {
    if (!activeProjectId) return;
    setMetadata((prev) =>
      prev.projectId === activeProjectId
        ? prev
        : { ...prev, projectId: activeProjectId }
    );
  }, [activeProjectId]);

  // Load proposal if editing
  const { data: proposalData, isLoading: isLoadingProposal } = useQuery({
    queryKey: ["proposal-builder", metadata.proposalId],
    queryFn: async () => {
      if (!metadata.proposalId) return null;
      const res = await fetch(`/api/proposals/builder?id=${metadata.proposalId}`);
      if (!res.ok) throw new Error("Failed to load proposal");
      return res.json();
    },
    enabled: !!metadata.proposalId && !hydratedFromHandoff,
  });

  useEffect(() => {
    if (proposalData?.ok) {
      setSections(proposalData.sections);
      setMetadata(proposalData.metadata);
      setIsDirty(false);
    }
  }, [proposalData]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/proposals/builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposalId: metadata.proposalId,
          sections,
          metadata,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        proposalId?: string;
        version?: number;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(body.error || `Save failed (${res.status})`);
      }
      return body;
    },
    onSuccess: (data) => {
      if (data.ok) {
        setMetadata((prev) => ({
          ...prev,
          proposalId: data.proposalId,
          version: data.version ?? prev.version,
        }));
        setIsDirty(false);
        setDraftBanner(null);
        queryClient.invalidateQueries({ queryKey: ["proposal-builder"] });
        toast({
          title: ar ? "تم الحفظ" : "Saved",
          description: ar ? "تم حفظ العرض بنجاح" : "Proposal saved successfully",
        });
      }
    },
    onError: (err) => {
      toast({
        title: ar ? "خطأ" : "Error",
        description:
          err instanceof Error
            ? err.message
            : ar
              ? "فشل حفظ العرض"
              : "Failed to save proposal",
        variant: "destructive",
      });
    },
  });

  const handleExportHtml = useCallback(() => {
    const html = sectionsToPrintableHtml(
      sections,
      { title: metadata.title },
      (locale === "ar" ? "ar" : "en")
    );
    const slug =
      (metadata.title.en || metadata.title.ar || "proposal")
        .toLowerCase()
        .replace(/[^a-z0-9]+/gi, "-")
        .replace(/^-|-$/g, "") || "proposal";
    saveBlob(new Blob([html], { type: "text/html;charset=utf-8" }), `${slug}.html`);
    toast({
      title: ar ? "تم التصدير" : "Exported",
      description: ar
        ? "ملف HTML جاهز للطباعة أو المراجعة"
        : "HTML file ready for print or review",
    });
  }, [sections, metadata.title, locale, ar, toast]);

  // Validate sections
  const handleValidate = useCallback(() => {
    const summary = validateProposalSections(sections);
    setValidationSummary(summary);
    if (summary.criticalErrors.length > 0) {
      toast({
        title: ar ? "أخطاء" : "Errors",
        description: `${summary.criticalErrors.length} ${ar ? "أخطاء يجب إصلاحها" : "errors need to be fixed"}`,
        variant: "destructive",
      });
    } else {
      toast({
        title: ar ? "صالح" : "Valid",
        description: ar ? `النتيجة: ${summary.overallScore}%` : `Score: ${summary.overallScore}%`,
      });
    }
  }, [sections, ar, toast]);

  // Add section
  const handleAddSection = useCallback((type: SectionType) => {
    const newSection = {
      id: crypto.randomUUID(),
      sectionKey: `${type}-${Date.now().toString(36)}`,
      sectionType: type,
      sortOrder: sections.length,
      title: { ar: getSectionLabel(type, "ar"), en: getSectionLabel(type, "en") },
      content: { ar: "", en: "" },
      metadata: {},
      isRequired: false,
      isVisible: true,
    };
    setSections((prev) => [...prev, newSection]);
    setIsDirty(true);
    setSelectedSectionKey(newSection.sectionKey);
  }, [sections.length]);

  // Update section
  const handleUpdateSection = useCallback((sectionKey: string, updates: Partial<ProposalSection>) => {
    setSections((prev) =>
      prev.map((s) => (s.sectionKey === sectionKey ? { ...s, ...updates } : s))
    );
    setIsDirty(true);
  }, []);

  // Delete section
  const handleDeleteSection = useCallback((sectionKey: string) => {
    setSections((prev) => prev.filter((s) => s.sectionKey !== sectionKey));
    if (selectedSectionKey === sectionKey) {
      setSelectedSectionKey(null);
    }
    setIsDirty(true);
  }, [selectedSectionKey]);

  // Reorder sections
  const handleReorder = useCallback((fromIndex: number, toIndex: number) => {
    setSections((prev) => {
      const result = [...prev];
      const [moved] = result.splice(fromIndex, 1);
      result.splice(toIndex, 0, moved);
      return result.map((s, i) => ({ ...s, sortOrder: i }));
    });
    setIsDirty(true);
  }, []);

  const selectedSection = sections.find((s) => s.sectionKey === selectedSectionKey);
  const availableTypes = getAvailableSectionTypes();

  if (isLoadingProposal) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-10rem)] flex-col gap-4">
      {draftBanner ? (
        <div
          className="flex items-start justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm"
          role="status"
        >
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
            <div>
              <p className="font-medium">{draftBanner}</p>
              {!metadata.projectId ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {ar
                    ? "افتح المشاريع واختر مشروعاً نشطاً قبل الحفظ."
                    : "Open Projects and select an active project before saving."}
                </p>
              ) : null}
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="shrink-0"
            onClick={() => setDraftBanner(null)}
          >
            {ar ? "إخفاء" : "Dismiss"}
          </Button>
        </div>
      ) : null}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ProposalBuilderToolbar
          locale={locale}
          mode={mode}
          onModeChange={setMode}
          isDirty={isDirty}
          isSaving={saveMutation.isPending}
          onSave={() => {
            if (!metadata.projectId) {
              toast({
                title: ar ? "مطلوب مشروع" : "Project required",
                description: ar
                  ? "اختر مشروعاً نشطاً من قائمة المشاريع ثم أعد الحفظ."
                  : "Select an active project from Projects, then save again.",
                variant: "destructive",
              });
              return;
            }
            saveMutation.mutate();
          }}
          onValidate={handleValidate}
          onExportHtml={handleExportHtml}
          validationSummary={validationSummary}
          metadata={metadata}
          onMetadataChange={setMetadata}
        />
        {metadata.proposalId && metadata.workspaceId ? (
          <CollaborationPresenceBar
            proposalId={metadata.proposalId}
            workspaceId={metadata.workspaceId}
            locale={locale}
          />
        ) : null}
      </div>

      {/* Main content area */}
      <div className="flex min-h-0 flex-1 gap-4">
        {/* Section list (left panel) */}
        <div
          className={cn(
            "flex flex-col gap-3 overflow-hidden rounded-xl border border-border/60 bg-background/60 backdrop-blur-xl",
            mode === "preview" ? "hidden" : "w-80 shrink-0"
          )}
        >
          <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
            <h3 className="text-sm font-semibold">
              {ar ? "الأقسام" : "Sections"}
            </h3>
            <Badge variant="outline" className="text-[10px]">
              {sections.length}
            </Badge>
          </div>

          <ProposalBuilderSections
            locale={locale}
            sections={sections}
            selectedSectionKey={selectedSectionKey}
            onSelectSection={setSelectedSectionKey}
            onReorder={handleReorder}
            onDelete={handleDeleteSection}
          />

          {/* Add section button */}
          <div className="border-t border-border/50 p-3">
            <div className="grid grid-cols-3 gap-1.5">
              {availableTypes.map((type) => (
                <Button
                  key={type}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-auto flex-col gap-1 py-2 text-[10px]"
                  onClick={() => handleAddSection(type)}
                >
                  <Plus className="size-3" />
                  <span className="line-clamp-1">{getSectionLabel(type, locale as "ar" | "en")}</span>
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* Editor / Preview area */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/60 bg-background/60 backdrop-blur-xl">
          {mode === "edit" && selectedSection ? (
            <SectionEditor
              locale={locale}
              section={selectedSection}
              onUpdate={(updates) => handleUpdateSection(selectedSection.sectionKey, updates)}
            />
          ) : mode === "preview" ? (
            <ProposalBuilderPreview
              locale={locale}
              sections={sections}
              metadata={metadata}
            />
          ) : (
            // Split mode
            <div className="grid min-h-0 flex-1 grid-cols-2 gap-0">
              <div className="overflow-auto border-e border-border/50">
                {selectedSection ? (
                  <SectionEditor
                    locale={locale}
                    section={selectedSection}
                    onUpdate={(updates) => handleUpdateSection(selectedSection.sectionKey, updates)}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    {ar ? "اختر قسماً للتحرير" : "Select a section to edit"}
                  </div>
                )}
              </div>
              <div className="overflow-auto">
                <ProposalBuilderPreview
                  locale={locale}
                  sections={sections}
                  metadata={metadata}
                />
              </div>
            </div>
          )}
        </div>

        {/* Collaboration (saved proposals only) */}
        {metadata.proposalId && mode !== "preview" ? (
          <div className="flex w-80 shrink-0 flex-col overflow-hidden rounded-xl border border-border/60 bg-background/60 backdrop-blur-xl">
            <CollaborationComments
              proposalId={metadata.proposalId}
              sectionKey={selectedSectionKey ?? undefined}
              locale={locale}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

// =============================================================================
// Section Editor Component
// =============================================================================

function SectionEditor({
  locale,
  section,
  onUpdate,
}: {
  locale: string;
  section: ProposalSection;
  onUpdate: (updates: Partial<ProposalSection>) => void;
}) {
  const ar = locale === "ar";
  const [activeLocale, setActiveLocale] = useState<"ar" | "en">(locale as "ar" | "en");

  return (
    <div className="flex h-full flex-col">
      {/* Section header */}
      <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
        <div className="flex items-center gap-2">
          <FileText className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">
            {section.title[activeLocale] || getSectionLabel(section.sectionType, activeLocale as "ar" | "en")}
          </span>
          {section.isRequired && (
            <Badge variant="destructive" className="text-[9px]">
              {ar ? "مطلوب" : "Required"}
            </Badge>
          )}
        </div>
        <div className="flex gap-1">
          <Button
            type="button"
            variant={activeLocale === "ar" ? "default" : "ghost"}
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => setActiveLocale("ar")}
          >
            عربي
          </Button>
          <Button
            type="button"
            variant={activeLocale === "en" ? "default" : "ghost"}
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => setActiveLocale("en")}
          >
            EN
          </Button>
        </div>
      </div>

      {/* Title input */}
      <div className="border-b border-border/30 px-4 py-2">
        <input
          type="text"
          value={section.title[activeLocale]}
          onChange={(e) =>
            onUpdate({ title: { ...section.title, [activeLocale]: e.target.value } })
          }
          placeholder={ar ? "عنوان القسم" : "Section title"}
          className="w-full bg-transparent text-sm font-medium outline-none placeholder:text-muted-foreground/50"
          dir={activeLocale === "ar" ? "rtl" : "ltr"}
        />
      </div>

      {/* Content editor */}
      <div className="flex-1 overflow-hidden p-4">
        <textarea
          value={section.content[activeLocale]}
          onChange={(e) =>
            onUpdate({ content: { ...section.content, [activeLocale]: e.target.value } })
          }
          placeholder={ar ? "اكتب محتوى القسم هنا (يدعم Markdown)..." : "Write section content here (Markdown supported)..."}
          className="h-full w-full resize-none bg-transparent font-mono text-sm outline-none placeholder:text-muted-foreground/50"
          dir={activeLocale === "ar" ? "rtl" : "ltr"}
        />
      </div>

      {/* Section settings */}
      <div className="flex items-center justify-between border-t border-border/50 px-4 py-2">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={section.isRequired}
            onChange={(e) => onUpdate({ isRequired: e.target.checked })}
            className="rounded border-border"
          />
          {ar ? "قسم مطلوب" : "Required section"}
        </label>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={section.isVisible}
            onChange={(e) => onUpdate({ isVisible: e.target.checked })}
            className="rounded border-border"
          />
          {ar ? "مرئي" : "Visible"}
        </label>
      </div>
    </div>
  );
}