import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { LocalizedNode } from "./types";

export interface BilingualTableColumn {
  key: string;
  header: LocalizedNode;
  width?: string;
  numeric?: boolean;
}

export interface BilingualTableCell {
  en: ReactNode;
  ar: ReactNode;
}

export interface BilingualTableRow {
  key: string;
  cells: Record<string, BilingualTableCell>;
}

export interface BilingualTableProps {
  columns: readonly BilingualTableColumn[];
  rows: readonly BilingualTableRow[];
  caption?: LocalizedNode;
  className?: string;
  emptyState?: LocalizedNode;
}

const EMPTY_STATE: LocalizedNode = {
  en: "No rows",
  ar: "لا توجد صفوف",
};

/**
 * One semantic table containing mirrored language halves. A shared `<tr>`
 * keeps each English/Arabic record at exactly the same height and allows
 * Chromium to repeat the bilingual `<thead>` on page breaks.
 */
export function BilingualTable({
  columns,
  rows,
  caption,
  className,
  emptyState = EMPTY_STATE,
}: BilingualTableProps) {
  const reversedColumns = [...columns].reverse();
  const columnCount = Math.max(columns.length * 2, 1);

  return (
    <div className={cn("bilingual-table-wrap", className)}>
      <table className="bilingual-table">
        {caption ? (
          <caption>
            <span lang="en" dir="ltr">
              {caption.en}
            </span>
            <span aria-hidden="true"> · </span>
            <span lang="ar" dir="rtl">
              {caption.ar}
            </span>
          </caption>
        ) : null}
        <colgroup>
          {columns.map((column) => (
            <col
              key={`en-${column.key}`}
              style={
                column.width
                  ? ({ width: column.width } as CSSProperties)
                  : undefined
              }
            />
          ))}
          {reversedColumns.map((column) => (
            <col
              key={`ar-${column.key}`}
              style={
                column.width
                  ? ({ width: column.width } as CSSProperties)
                  : undefined
              }
            />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={`en-${column.key}`}
                lang="en"
                dir="ltr"
                scope="col"
                className={column.numeric ? "bilingual-table__numeric" : undefined}
              >
                {column.header.en}
              </th>
            ))}
            {reversedColumns.map((column, index) => (
              <th
                key={`ar-${column.key}`}
                lang="ar"
                dir="rtl"
                scope="col"
                className={cn(
                  index === 0 && "bilingual-table__language-divider",
                  column.numeric && "bilingual-table__numeric"
                )}
              >
                {column.header.ar}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length > 0 ? (
            rows.map((row) => (
              <tr key={row.key} data-alignment-key={row.key}>
                {columns.map((column) => (
                  <td
                    key={`en-${column.key}`}
                    lang="en"
                    dir="ltr"
                    className={
                      column.numeric ? "bilingual-table__numeric" : undefined
                    }
                  >
                    {row.cells[column.key]?.en}
                  </td>
                ))}
                {reversedColumns.map((column, index) => (
                  <td
                    key={`ar-${column.key}`}
                    lang="ar"
                    dir="rtl"
                    className={cn(
                      index === 0 && "bilingual-table__language-divider",
                      column.numeric && "bilingual-table__numeric"
                    )}
                  >
                    {row.cells[column.key]?.ar}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columnCount} className="bilingual-table__empty">
                <span lang="en" dir="ltr">
                  {emptyState.en}
                </span>
                <span aria-hidden="true"> · </span>
                <span lang="ar" dir="rtl">
                  {emptyState.ar}
                </span>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

