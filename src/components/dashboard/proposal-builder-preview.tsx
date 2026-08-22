"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { FileText, Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ProposalSection, ProposalMetadata } from "@/lib/proposal-builder-types";
import { getSectionLabel } from "@/lib/proposal-builder-engine";
import { markdownToHtml } from "@/lib/markdown";
import { useState } from "react";

type PreviewMode = "ar" | "en" | "bilingual";

export function ProposalBuilderPreview({
  locale,
  sections,
  metadata,
}: {
  locale: string;
  sections: ProposalSection[];
  metadata: ProposalMetadata;
}) {
  const ar = locale === "ar";
  const [previewMode, setPreviewMode] = useState<PreviewMode>(locale as "ar" | "en");

  const visibleSections = useMemo(
    () => sections.filter((s) => s.isVisible).sort((a, b) => a.sortOrder - b.sortOrder),
    [sections]
  );

  const totalWords = useMemo(() => {
    return visibleSections.reduce((sum, s) => {
      const arWords = s.content.ar.trim().split(/\s+/).filter(Boolean).length;
      const enWords = s.content.en.trim().split(/\s+/).filter(Boolean).length;
      return sum + arWords + enWords;
    }, 0);
  }, [visibleSections]);

  const estimatedPages = Math.max(1, Math.ceil(totalWords / 300));

  return (
    <div className="flex h-full flex-col">
      {/* Preview header */}
      <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
        <div className="flex items-center gap-2">
          <FileText className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">
            {ar ? "معاينة مباشرة" : "Live Preview"}
          </span>
          <Badge variant="outline" className="text-[10px]">
            {estimatedPages} {ar ? "صفحة" : "pages"}
          </Badge>
        </div>
        <div className="flex gap-1">
          <Button
            type="button"
            variant={previewMode === "ar" ? "default" : "ghost"}
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => setPreviewMode("ar")}
          >
            {ar ? "عربي" : "Arabic"}
          </Button>
          <Button
            type="button"
            variant={previewMode === "en" ? "default" : "ghost"}
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => setPreviewMode("en")}
          >
            {ar ? "إنجليزي" : "EN"}
          </Button>
          <Button
            type="button"
            variant={previewMode === "bilingual" ? "default" : "ghost"}
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => setPreviewMode("bilingual")}
          >
            <Languages className="size-3" />
            {ar ? "ثنائي" : "Bi"}
          </Button>
        </div>
      </div>

      {/* Preview content */}
      <div className="flex-1 overflow-y-auto bg-muted/20 p-6">
        <div className="mx-auto max-w-3xl">
          {/* Document header */}
          <div className="mb-8 rounded-xl border border-border/60 bg-background p-8 shadow-sm">
            <h1
              className="text-2xl font-bold tracking-tight"
              dir={previewMode === "ar" ? "rtl" : "ltr"}
            >
              {metadata.title[previewMode === "bilingual" ? "ar" : previewMode] ||
                (ar ? "عرض بدون عنوان" : "Untitled Proposal")}
            </h1>
            {previewMode === "bilingual" && metadata.title.en && (
              <h2 className="mt-2 text-lg text-muted-foreground" dir="ltr">
                {metadata.title.en}
              </h2>
            )}
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span>{ar ? "الإصدار" : "Version"} {metadata.version}</span>
              <span>•</span>
              <span>{visibleSections.length} {ar ? "أقسام" : "sections"}</span>
              <span>•</span>
              <span>{totalWords} {ar ? "كلمة" : "words"}</span>
            </div>
          </div>

          {/* Sections */}
          <div className="space-y-6">
            {visibleSections.map((section) => (
              <PreviewSection
                key={section.sectionKey}
                section={section}
                previewMode={previewMode}
                locale={locale}
              />
            ))}
          </div>

          {/* Empty state */}
          {visibleSections.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <FileText className="size-12 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">
                {ar ? "لا توجد أقسام مرئية للمعاينة" : "No visible sections to preview"}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PreviewSection({
  section,
  previewMode,
  locale,
}: {
  section: ProposalSection;
  previewMode: PreviewMode;
  locale: string;
}) {
  const ar = locale === "ar";
  const showAr = previewMode === "ar" || previewMode === "bilingual";
  const showEn = previewMode === "en" || previewMode === "bilingual";

  const hasArContent = section.content.ar.trim().length > 0;
  const hasEnContent = section.content.en.trim().length > 0;

  return (
    <section className="rounded-xl border border-border/60 bg-background p-6 shadow-sm">
      {/* Section header */}
      <div className="mb-4 flex items-center gap-2 border-b border-border/30 pb-3">
        <Badge variant="outline" className="text-[10px]">
          {getSectionLabel(section.sectionType, locale as "ar" | "en")}
        </Badge>
        {section.isRequired && (
          <Badge variant="destructive" className="text-[9px]">
            {ar ? "مطلوب" : "Required"}
          </Badge>
        )}
      </div>

      {/* Bilingual layout */}
      {previewMode === "bilingual" ? (
        <div className="grid gap-6 md:grid-cols-2">
          {/* Arabic column */}
          <div dir="rtl" className="space-y-3">
            <h3 className="text-lg font-semibold">{section.title.ar || "—"}</h3>
            {hasArContent ? (
              <div className="prose prose-sm max-w-none dark:prose-invert">
                <MarkdownPreview content={section.content.ar} />
              </div>
            ) : (
              <p className="text-sm italic text-muted-foreground/50">
                {ar ? "لا يوجد محتوى عربي" : "No Arabic content"}
              </p>
            )}
          </div>

          {/* English column */}
          <div dir="ltr" className="space-y-3">
            <h3 className="text-lg font-semibold">{section.title.en || "—"}</h3>
            {hasEnContent ? (
              <div className="prose prose-sm max-w-none dark:prose-invert">
                <MarkdownPreview content={section.content.en} />
              </div>
            ) : (
              <p className="text-sm italic text-muted-foreground/50">
                {ar ? "لا يوجد محتوى إنجليزي" : "No English content"}
              </p>
            )}
          </div>
        </div>
      ) : (
        /* Single language layout */
        <div dir={previewMode === "ar" ? "rtl" : "ltr"} className="space-y-3">
          <h3 className="text-lg font-semibold">
            {section.title[previewMode] || getSectionLabel(section.sectionType, previewMode)}
          </h3>
          {(previewMode === "ar" ? hasArContent : hasEnContent) ? (
            <div className="prose prose-sm max-w-none dark:prose-invert">
              <MarkdownPreview content={section.content[previewMode]} />
            </div>
          ) : (
            <p className="text-sm italic text-muted-foreground/50">
              {previewMode === "ar"
                ? ar ? "لا يوجد محتوى عربي" : "No Arabic content"
                : ar ? "لا يوجد محتوى إنجليزي" : "No English content"}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Markdown preview for a proposal section.
 *
 * Renders through the shared `markdownToHtml`, which escapes every span of user
 * content before emitting markup. Section content is authored by other
 * workspace members, generated by the agent pipeline from uploaded tender
 * documents, and can arrive from marketplace templates, so it is untrusted
 * input. Presentation is applied with arbitrary-variant classes on the wrapper —
 * matching `markdown-studio-editor-inner` — rather than by hand-building tags.
 */
function MarkdownPreview({ content }: { content: string }) {
  const html = useMemo(() => markdownToHtml(content), [content]);

  return (
    <div
      className={cn(
        "text-sm leading-relaxed",
        "[&_h1]:text-xl [&_h1]:font-bold [&_h1]:mt-6 [&_h1]:mb-4",
        "[&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-5 [&_h2]:mb-3",
        "[&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-2",
        "[&_p]:mb-3 [&_ul]:mb-3 [&_ol]:mb-3 [&_li]:ms-4",
        "[&_table]:w-full [&_table]:border-collapse [&_table]:mb-3",
        "[&_td]:border [&_td]:border-border/50 [&_td]:px-2 [&_td]:py-1",
        "[&_th]:border [&_th]:border-border/50 [&_th]:px-2 [&_th]:py-1"
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}