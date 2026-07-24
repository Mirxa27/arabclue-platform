"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import type { LetterheadBrand } from "@/lib/letterhead";

const Inner = dynamic(
  () =>
    import("./markdown-studio-editor-inner").then(
      (m) => m.MarkdownStudioEditorInner
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[320px] items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading editor…
      </div>
    ),
  }
);

export type MarkdownStudioEditorProps = {
  markdown: string;
  onChange: (md: string) => void;
  locale: "ar" | "en";
  dir?: "rtl" | "ltr";
  className?: string;
  splitPreview?: boolean;
  brand?: { primaryColor?: string; accentColor?: string };
  letterhead?: {
    brand: LetterheadBrand | null | undefined;
    companyName: string;
  };
  readOnly?: boolean;
};

export function MarkdownStudioEditor(props: MarkdownStudioEditorProps) {
  return <Inner {...props} />;
}
