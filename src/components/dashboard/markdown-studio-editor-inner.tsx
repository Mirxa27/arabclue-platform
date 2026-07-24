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

type Props = {
  markdown: string;
  onChange: (md: string) => void;
  locale: "ar" | "en";
  dir?: "rtl" | "ltr";
  className?: string;
  splitPreview?: boolean;
  brand?: BrandColors;
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
          className="min-h-[420px] overflow-y-auto p-4 text-sm bg-muted/20"
          dir={resolvedDir}
          dangerouslySetInnerHTML={{ __html: previewHtml }}
        />
      ) : null}
    </div>
  );
}
