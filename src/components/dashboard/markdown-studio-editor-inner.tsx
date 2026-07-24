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
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { markdownToHtml } from "@/lib/markdown";

type BrandColors = {
  primaryColor?: string;
  accentColor?: string;
};

type LetterheadPreview = {
  companyName: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  accentColor?: string | null;
  tagline?: string | null;
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
 * Rich markdown studio (MDXEditor) + branded live preview.
 * Must be loaded with next/dynamic ssr:false from the parent.
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
        headingColor: brand?.primaryColor ?? "#1E3A8A",
        accentColor: brand?.accentColor ?? "#0EA5E9",
      }),
    [markdown, brand?.primaryColor, brand?.accentColor]
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
          className="min-h-[420px] overflow-y-auto bg-muted/20"
          dir={resolvedDir}
        >
          <div className="p-4">
            {letterhead ? (
              <div
                className="mb-[18px] flex items-center justify-between gap-3 rounded-lg px-3.5 py-2.5 text-white"
                style={{
                  background: `linear-gradient(90deg, ${letterhead.primaryColor ?? "#1E3A8A"}, ${letterhead.secondaryColor ?? "#0F172A"})`,
                  borderBottom: `3px solid ${letterhead.accentColor ?? "#0EA5E9"}`,
                }}
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  {letterhead.logoUrl ? (
                    <img
                      src={letterhead.logoUrl}
                      alt=""
                      className="h-7 max-w-[120px] rounded bg-white/15 px-1.5 py-0.5 object-contain"
                    />
                  ) : null}
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-bold">
                      {letterhead.companyName}
                    </div>
                    {letterhead.tagline ? (
                      <div className="truncate text-[10px] opacity-90">
                        {letterhead.tagline}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="shrink-0 text-[9px] uppercase tracking-[0.04em] opacity-85">
                  {ar ? "ورق رسمي" : "Official letterhead"}
                </div>
              </div>
            ) : null}
            <div
              className="text-sm"
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
