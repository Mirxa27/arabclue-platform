"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

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
    companyName: string;
    logoUrl?: string | null;
    primaryColor?: string | null;
    secondaryColor?: string | null;
    accentColor?: string | null;
    tagline?: string | null;
  };
  readOnly?: boolean;
};

export function MarkdownStudioEditor(props: MarkdownStudioEditorProps) {
  return <Inner {...props} />;
}
