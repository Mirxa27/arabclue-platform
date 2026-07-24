import { cn } from "@/lib/utils";
import type { LocalizedNode } from "./types";

export interface BilingualFooterProps {
  company?: LocalizedNode;
  notice?: LocalizedNode;
  pageNumber?: number;
  totalPages?: number;
  useCssPageCounters?: boolean;
  className?: string;
}

export function BilingualFooter({
  company,
  notice,
  pageNumber,
  totalPages,
  useCssPageCounters = false,
  className,
}: BilingualFooterProps) {
  const explicitPage =
    pageNumber !== undefined && totalPages !== undefined ? (
      <bdi>
        {pageNumber} / {totalPages}
      </bdi>
    ) : null;

  return (
    <footer className={cn("bilingual-footer", className)}>
      <div className="bilingual-footer__side" lang="en" dir="ltr">
        {company?.en}
        {notice ? <small>{notice.en}</small> : null}
      </div>
      <div
        className="bilingual-footer__pagination"
        aria-label={
          explicitPage ? `Page ${pageNumber} of ${totalPages}` : "Page number"
        }
      >
        <span lang="en">Page</span>
        {useCssPageCounters ? (
          <bdi aria-hidden="true">
            <span className="bilingual-page-number" /> /{" "}
            <span className="bilingual-total-pages" />
          </bdi>
        ) : (
          explicitPage
        )}
        <span lang="ar" dir="rtl">
          صفحة
        </span>
      </div>
      <div className="bilingual-footer__side" lang="ar" dir="rtl">
        {company?.ar}
        {notice ? <small>{notice.ar}</small> : null}
      </div>
    </footer>
  );
}

