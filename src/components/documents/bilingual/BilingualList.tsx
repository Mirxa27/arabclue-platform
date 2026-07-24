import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface BilingualListItem {
  key: string;
  en: ReactNode;
  ar: ReactNode;
}

export interface BilingualListProps {
  items: readonly BilingualListItem[];
  ordered?: boolean;
  start?: number;
  className?: string;
  ariaLabel?: string;
}

/**
 * List pairs are rendered as shared rows so translated items never drift away
 * from one another. Number markers remain isolated from surrounding RTL text.
 */
export function BilingualList({
  items,
  ordered = false,
  start = 1,
  className,
  ariaLabel = "Bilingual list",
}: BilingualListProps) {
  return (
    <div
      className={cn(
        "bilingual-list",
        ordered && "bilingual-list--ordered",
        className
      )}
      role="list"
      aria-label={ariaLabel}
    >
      {items.map((item, index) => {
        const marker = ordered ? start + index : "•";

        return (
          <div
            className="bilingual-list__row"
            role="listitem"
            data-alignment-key={item.key}
            key={item.key}
          >
            <div className="bilingual-list__item" lang="en" dir="ltr">
              <bdi className="bilingual-list__marker">{marker}</bdi>
              <div>{item.en}</div>
            </div>
            <div className="bilingual-list__item" lang="ar" dir="rtl">
              <bdi className="bilingual-list__marker">{marker}</bdi>
              <div>{item.ar}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

