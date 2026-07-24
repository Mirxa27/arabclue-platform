import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  normalizeColumnRatio,
  type BilingualContinuation,
  type BilingualLayoutMode,
  type LocalizedNode,
} from "./types";

export interface BilingualSectionProps {
  alignmentKey: string;
  english: ReactNode;
  arabic: ReactNode;
  title?: LocalizedNode;
  /**
   * Sections sit below the document-level BilingualHeader, which owns the
   * single h1. Restricting this to h2-h6 prevents duplicate document headings.
   */
  headingLevel?: 2 | 3 | 4 | 5 | 6;
  layout?: BilingualLayoutMode;
  columnRatio?: readonly [number, number];
  continuation?: BilingualContinuation;
  className?: string;
  keepWithNext?: boolean;
}

const HEADING_TAGS = {
  2: "h2",
  3: "h3",
  4: "h4",
  5: "h5",
  6: "h6",
} as const;

/**
 * A semantic alignment row. Parallel mode uses one grid row so the browser
 * naturally gives both language cells the same height in HTML and PDF.
 */
export function BilingualSection({
  alignmentKey,
  english,
  arabic,
  title,
  headingLevel = 2,
  layout = "parallel",
  columnRatio,
  continuation,
  className,
  keepWithNext = false,
}: BilingualSectionProps) {
  const Heading = HEADING_TAGS[headingLevel];
  const [englishRatio, arabicRatio] = normalizeColumnRatio(columnRatio);
  const headingId = `bilingual-${alignmentKey.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  const style = {
    "--bilingual-en-ratio": `${englishRatio}fr`,
    "--bilingual-ar-ratio": `${arabicRatio}fr`,
  } as CSSProperties;

  return (
    <section
      className={cn(
        "bilingual-section",
        `bilingual-section--${layout}`,
        keepWithNext && "bilingual-keep-with-next",
        className
      )}
      data-alignment-key={alignmentKey}
      data-fragment={continuation?.fragment}
      data-fragment-count={continuation?.totalFragments}
      aria-labelledby={title ? headingId : undefined}
      style={style}
    >
      {title ? (
        <header className="bilingual-section__heading" id={headingId}>
          <Heading lang="en" dir="ltr" className="bilingual-section__title-en">
            {title.en}
          </Heading>
          <Heading lang="ar" dir="rtl" className="bilingual-section__title-ar">
            {title.ar}
          </Heading>
        </header>
      ) : null}

      {continuation ? (
        <p className="bilingual-continuation" aria-label="Continued section">
          <span lang="en" dir="ltr">
            Continued ({continuation.fragment}/{continuation.totalFragments})
          </span>
          <span lang="ar" dir="rtl">
            تابع ({continuation.fragment}/{continuation.totalFragments})
          </span>
        </p>
      ) : null}

      <div className="bilingual-section__pair">
        <div className="bilingual-cell bilingual-cell--en" lang="en" dir="ltr">
          {english}
        </div>
        <div className="bilingual-cell bilingual-cell--ar" lang="ar" dir="rtl">
          {arabic}
        </div>
      </div>
    </section>
  );
}
