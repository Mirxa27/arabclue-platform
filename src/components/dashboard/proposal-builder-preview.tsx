"use client";

import { useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { FileText, Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ProposalSection, ProposalMetadata } from "@/lib/proposal-builder-types";
import { getSectionLabel } from "@/lib/proposal-builder-engine";
import { markdownToHtml } from "@/lib/markdown";

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
  const [previewMode, setPreviewMode] = useState<PreviewMode>(ar ? "ar" : "en");
  const paperRef = useRef<HTMLElement>(null);

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
    <div className="flex h-full min-w-0 flex-col" dir={ar ? "rtl" : "ltr"}>
      {/* Preview header */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-background px-4 py-3">
        <div className="flex items-center gap-2">
          <FileText className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">
            {ar ? "معاينة مباشرة" : "Live Preview"}
          </span>
          <span className="text-xs tabular-nums text-muted-foreground">
            {estimatedPages} {ar ? "صفحات تقديرية" : "estimated pages"}
          </span>
        </div>
        <div className="flex rounded-md border border-border/60 p-0.5" role="group" aria-label={ar ? "لغة المستند" : "Document language"}>
          <Button
            type="button"
            variant={previewMode === "ar" ? "default" : "ghost"}
            size="sm"
            className="h-9 px-3 text-xs"
            aria-pressed={previewMode === "ar"}
            onClick={() => setPreviewMode("ar")}
          >
            {ar ? "عربي" : "Arabic"}
          </Button>
          <Button
            type="button"
            variant={previewMode === "en" ? "default" : "ghost"}
            size="sm"
            className="h-9 px-3 text-xs"
            aria-pressed={previewMode === "en"}
            onClick={() => setPreviewMode("en")}
          >
            {ar ? "إنجليزي" : "EN"}
          </Button>
          <Button
            type="button"
            variant={previewMode === "bilingual" ? "default" : "ghost"}
            size="sm"
            className="h-9 gap-1.5 px-3 text-xs"
            aria-pressed={previewMode === "bilingual"}
            onClick={() => setPreviewMode("bilingual")}
          >
            <Languages className="size-3" />
            {ar ? "ثنائي اللغة" : "Bilingual"}
          </Button>
        </div>
      </div>

      {visibleSections.length > 0 ? (
        <nav aria-label={ar ? "أقسام المستند" : "Document sections"} className="flex shrink-0 items-center gap-3 border-b border-border/60 bg-muted/20 px-4 py-2">
          <select
            aria-label={ar ? "الانتقال إلى القسم" : "Go to section"}
            defaultValue=""
            className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring"
            onChange={(event) => {
              paperRef.current?.querySelector<HTMLElement>(`[data-preview-section="${Number(event.target.value)}"]`)?.scrollIntoView({ block: "start", behavior: "auto" });
            }}
          >
            <option value="" disabled>{ar ? "المحتويات" : "Contents"}</option>
            {visibleSections.map((section, index) => (
              <option key={section.sectionKey} value={index}>
                {index + 1}. {section.title[ar ? "ar" : "en"] || getSectionLabel(section.sectionType, ar ? "ar" : "en")}
              </option>
            ))}
          </select>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{totalWords.toLocaleString(ar ? "ar-SA" : "en-US")} {ar ? "كلمة" : "words"}</span>
        </nav>
      ) : null}

      {/* Preview content */}
      <div className="min-h-0 flex-1 overflow-auto bg-muted/40 p-0 sm:p-6">
        <article ref={paperRef} aria-label={ar ? "معاينة محتوى المستند" : "Document content preview"} className="@container mx-auto min-h-full w-full max-w-[1100px] bg-white px-5 py-8 text-zinc-900 shadow-sm ring-1 ring-zinc-200 [color-scheme:light] sm:px-10 sm:py-12">
          {/* Document header */}
          <header className="mb-8 border-b-2 border-primary pb-8">
            <p className="mb-4 text-xs font-medium uppercase tracking-normal text-zinc-500">{ar ? "مسودة العرض" : "Proposal draft"}</p>
            <h1
              className="break-words text-2xl font-semibold leading-snug tracking-normal [overflow-wrap:anywhere] sm:text-3xl"
              dir={previewMode === "en" ? "ltr" : "rtl"}
              lang={previewMode === "en" ? "en" : "ar"}
            >
              {metadata.title[previewMode === "bilingual" ? "ar" : previewMode] ||
                (ar ? "عرض بدون عنوان" : "Untitled Proposal")}
            </h1>
            {previewMode === "bilingual" && metadata.title.en && (
              <h2 className="mt-3 break-words text-xl leading-snug text-zinc-600 [overflow-wrap:anywhere]" dir="ltr" lang="en">
                {metadata.title.en}
              </h2>
            )}
            <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-xs text-zinc-500">
              <span>{ar ? "الإصدار" : "Version"} {metadata.version}</span>
              <span>{visibleSections.length} {ar ? "أقسام" : "sections"}</span>
            </div>
          </header>

          {/* Sections */}
          <div>
            {visibleSections.map((section, index) => (
              <PreviewSection
                key={section.sectionKey}
                index={index}
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
        </article>
      </div>
    </div>
  );
}

function PreviewSection({
  index,
  section,
  previewMode,
  locale,
}: {
  index: number;
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
    <section data-preview-section={index} className="scroll-mt-6 border-t border-zinc-200 py-8 first:border-t-0 first:pt-0">
      {/* Section header */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium tabular-nums text-zinc-400">{String(index + 1).padStart(2, "0")}</span>
        <Badge variant="outline" className="border-zinc-200 text-xs text-zinc-600">
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
        <div className="grid grid-cols-1 gap-8 @min-[640px]:grid-cols-2">
          {/* Arabic column */}
          <div dir="rtl" lang="ar" className="min-w-0 space-y-4 [overflow-wrap:anywhere]">
            <h3 className="text-xl font-semibold leading-snug">{section.title.ar || "—"}</h3>
            {hasArContent ? (
              <div className="min-w-0">
                <MarkdownPreview content={section.content.ar} />
              </div>
            ) : (
              <p className="text-sm italic text-muted-foreground/50">
                {ar ? "لا يوجد محتوى عربي" : "No Arabic content"}
              </p>
            )}
          </div>

          {/* English column */}
          <div dir="ltr" lang="en" className="min-w-0 space-y-4 [overflow-wrap:anywhere]">
            <h3 className="text-xl font-semibold leading-snug">{section.title.en || "—"}</h3>
            {hasEnContent ? (
              <div className="min-w-0">
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
        <div dir={previewMode === "ar" ? "rtl" : "ltr"} lang={previewMode} className="min-w-0 space-y-4 [overflow-wrap:anywhere]">
          <h3 className="text-xl font-semibold leading-snug">
            {section.title[previewMode] || getSectionLabel(section.sectionType, previewMode)}
          </h3>
          {(previewMode === "ar" ? hasArContent : hasEnContent) ? (
            <div className="min-w-0">
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
        "min-w-0 text-sm leading-7 text-zinc-700 [overflow-wrap:anywhere]",
        "[&_h1]:text-xl [&_h1]:font-bold [&_h1]:mt-6 [&_h1]:mb-4",
        "[&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-5 [&_h2]:mb-3",
        "[&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-2",
        "[&_p]:mb-3 [&_ul]:mb-3 [&_ol]:mb-3 [&_li]:ms-4",
        "[&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_table]:border-collapse [&_table]:my-5",
        "[&_td]:border [&_td]:border-zinc-200 [&_td]:px-3 [&_td]:py-2 [&_td]:align-top [&_td]:text-zinc-700",
        "[&_th]:border [&_th]:border-zinc-200 [&_th]:bg-zinc-50 [&_th]:px-3 [&_th]:py-2 [&_th]:text-start [&_th]:text-zinc-900",
        "[&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-zinc-50 [&_pre]:p-4 [&_pre]:text-xs [&_blockquote]:border-s-2 [&_blockquote]:border-primary [&_blockquote]:ps-4"
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}