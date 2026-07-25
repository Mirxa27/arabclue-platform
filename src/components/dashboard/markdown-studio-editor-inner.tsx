"use client";

import {
  MDXEditor,
  headingsPlugin,
  listsPlugin,
  quotePlugin,
  thematicBreakPlugin,
  markdownShortcutPlugin,
  linkPlugin,
  tablePlugin,
  codeBlockPlugin,
  toolbarPlugin,
  UndoRedo,
  BoldItalicUnderlineToggles,
  BlockTypeSelect,
  ListsToggle,
  CreateLink,
  InsertTable,
  CodeToggle,
  Separator,
} from "@mdxeditor/editor";
import "@mdxeditor/editor/style.css";
import { useMemo, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { markdownToHtml } from "@/lib/markdown";
import {
  letterheadBarHtml,
  type LetterheadBrand,
} from "@/lib/letterhead";

type BrandColors = {
  primaryColor?: string;
  accentColor?: string;
};

type LetterheadPreview = {
  brand: LetterheadBrand | null | undefined;
  companyName: string;
};

type Props = {
  markdown: string;
  onChange: (md: string) => void;
  locale: "ar" | "en";
  dir?: "rtl" | "ltr";
  className?: string;
  splitPreview?: boolean;
  brand?: BrandColors;
  letterhead?: LetterheadPreview;
  readOnly?: boolean;
};

/**
 * Rich markdown studio (MDXEditor) + branded live draft preview.
 * Must be loaded with next/dynamic ssr:false from the parent.
 * Live pane approximates letterhead + body; official PDF/print uses
 * DocumentPreviewFrame after save.
 */
export function MarkdownStudioEditorInner({
  markdown,
  onChange,
  locale,
  dir,
  className,
  splitPreview = true,
  brand,
  letterhead,
  readOnly,
}: Props) {
  const ar = locale === "ar";
  const resolvedDir = dir ?? (ar ? "rtl" : "ltr");
  const primary = brand?.primaryColor ?? "#1E3A8A";
  const accent = brand?.accentColor ?? "#0EA5E9";

  const plugins = useMemo(
    () => [
      headingsPlugin(),
      listsPlugin(),
      quotePlugin(),
      thematicBreakPlugin(),
      markdownShortcutPlugin(),
      linkPlugin(),
      tablePlugin(),
      codeBlockPlugin({ defaultCodeBlockLanguage: "txt" }),
      toolbarPlugin({
        toolbarContents: () => (
          <>
            <UndoRedo />
            <Separator />
            <BoldItalicUnderlineToggles />
            <Separator />
            <BlockTypeSelect />
            <Separator />
            <ListsToggle />
            <CreateLink />
            <InsertTable />
            <Separator />
            <CodeToggle />
          </>
        ),
      }),
    ],
    []
  );

  const previewHtml = useMemo(
    () =>
      markdownToHtml(markdown, {
        headingColor: primary,
        accentColor: accent,
      }),
    [markdown, primary, accent]
  );

  const letterheadHtml = useMemo(
    () =>
      letterhead
        ? letterheadBarHtml({
            brand: letterhead.brand,
            companyName: letterhead.companyName,
            locale,
          })
        : null,
    [letterhead, locale]
  );

  return (
    <div
      className={cn(
        "grid min-h-[420px] h-full overflow-hidden rounded-md border",
        splitPreview ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1",
        className
      )}
      dir={resolvedDir}
    >
      <div
        className={cn(
          "min-h-[420px] overflow-y-auto bg-background [&_.mdxeditor]:min-h-[420px] [&_.mdxeditor]:rounded-none [&_.mdxeditor]:border-0 [&_.mdxeditor]:shadow-none",
          splitPreview && "lg:border-e"
        )}
      >
        <MDXEditor
          markdown={markdown}
          onChange={onChange}
          readOnly={readOnly}
          contentEditableClassName={cn(
            "prose prose-sm max-w-none px-3 py-2 dark:prose-invert min-h-[380px]",
            ar && "text-right"
          )}
          plugins={plugins}
        />
      </div>
      {splitPreview ? (
        <div
          className="min-h-[420px] overflow-y-auto bg-slate-100/90 dark:bg-slate-950/40"
          dir={resolvedDir}
        >
          <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border/50 bg-muted/80 px-3 py-1.5 backdrop-blur text-[10px] font-medium text-muted-foreground">
            <span>
              {ar ? "معاينة مسودة مباشرة" : "Live draft preview"}
            </span>
            <span className="rounded-full border border-border/60 bg-background/80 px-2 py-0.5">
              {ar ? "احفظ لـ PDF الرسمي" : "Save for official PDF"}
            </span>
          </div>
          <div className="p-4 sm:p-6">
            <div
              className="mx-auto max-w-[720px] overflow-hidden rounded-sm border border-slate-200/90 bg-white text-slate-900 shadow-[0_18px_45px_rgba(15,23,42,0.14)] ring-1 ring-black/5"
              style={
                {
                  ["--studio-primary"]: primary,
                  ["--studio-accent"]: accent,
                } as CSSProperties
              }
            >
              <div className="px-6 pt-5 pb-2 sm:px-8">
                {letterheadHtml ? (
                  <div dangerouslySetInnerHTML={{ __html: letterheadHtml }} />
                ) : null}
              </div>
              <div
                className={cn(
                  "studio-live-preview px-6 pb-8 sm:px-8 text-[13px] leading-relaxed",
                  "[&_h1]:text-[1.45rem] [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-2",
                  "[&_h2]:text-[1.2rem] [&_h2]:font-semibold [&_h2]:mt-4 [&_h2]:mb-2",
                  "[&_h3]:text-[1.05rem] [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1.5",
                  "[&_p]:my-2 [&_ul]:my-2 [&_ol]:my-2 [&_li]:my-0.5",
                  "[&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-slate-200 [&_td]:p-1.5 [&_th]:border [&_th]:border-slate-200 [&_th]:p-1.5 [&_th]:bg-slate-50",
                  "[&_a]:underline [&_blockquote]:border-s-2 [&_blockquote]:border-[var(--studio-accent)] [&_blockquote]:ps-3 [&_blockquote]:text-slate-600",
                  ar && "text-right"
                )}
                style={{ color: "#0f172a" }}
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
