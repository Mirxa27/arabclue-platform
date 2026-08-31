/**
 * Production Markdown for proposal documents.
 * Supports GFM-ish headings, lists, tables, bold/italic, HR, blockquotes, code.
 *
 * The scan is separate from rendering because there is more than one output
 * format. `markdownToHtml` feeds the editor preview and the PDF; `markdownToDocx`
 * feeds the Word deliverable. If each scanned for itself, teaching one of them a
 * new construct would silently leave the other rendering it as a paragraph — and
 * the two files are supposed to be the same document.
 */

import {
  DEFAULT_DOCUMENT_BRAND_COLORS,
  normalizeDocumentBrandColor,
} from "./brand-policy";

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type MarkdownBlock =
  | { kind: "heading"; level: 1 | 2 | 3 | 4; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "table"; header: string[]; rows: string[][] }
  | { kind: "quote"; text: string }
  | { kind: "code"; text: string }
  | { kind: "rule" };

/**
 * Split a document into blocks. Inline markers (`**`, `*`, backticks) are left
 * in the text: HTML escapes them, DOCX turns them into runs, and picking one
 * representation here would impose it on the other renderer.
 */
export function markdownBlocks(md: string): MarkdownBlock[] {
  const lines = (md || "").replace(/\r\n/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];

  // The open block, if the previous line started one that this line may extend.
  let list: { ordered: boolean; items: string[] } | null = null;
  let table: { header: string[]; rows: string[][] } | null = null;
  let code: string[] | null = null;

  const closeList = () => {
    if (list) blocks.push({ kind: "list", ...list });
    list = null;
  };
  const closeTable = () => {
    if (table) blocks.push({ kind: "table", ...table });
    table = null;
  };
  const closeBoth = () => {
    closeList();
    closeTable();
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (line.startsWith("```")) {
      if (code) {
        blocks.push({ kind: "code", text: code.join("\n") });
        code = null;
      } else {
        closeBoth();
        code = [];
      }
      continue;
    }
    if (code) {
      // Verbatim: leading whitespace is part of the code.
      code.push(raw);
      continue;
    }

    if (!line.trim()) {
      closeBoth();
      continue;
    }

    if (/^---+$/.test(line.trim()) || /^\*\*\*+$/.test(line.trim())) {
      closeBoth();
      blocks.push({ kind: "rule" });
      continue;
    }

    const h = line.match(/^(#{1,4})\s+(.+)$/);
    if (h) {
      closeBoth();
      blocks.push({
        kind: "heading",
        level: h[1].length as 1 | 2 | 3 | 4,
        text: h[2],
      });
      continue;
    }

    if (/^>\s?/.test(line)) {
      closeBoth();
      blocks.push({ kind: "quote", text: line.replace(/^>\s?/, "") });
      continue;
    }

    if (/^\|.+\|$/.test(line.trim())) {
      closeList();
      const cells = line
        .trim()
        .slice(1, -1)
        .split("|")
        .map((c) => c.trim());
      // An alignment row carries no content, but it does confirm a table.
      if (cells.every((c) => /^:?-+:?$/.test(c))) continue;
      if (table) table.rows.push(cells);
      else table = { header: cells, rows: [] };
      continue;
    }

    const ul = line.match(/^[-*+]\s+(.+)$/);
    const ol = ul ? null : line.match(/^\d+\.\s+(.+)$/);
    if (ul || ol) {
      closeTable();
      const ordered = !ul;
      // Switching marker type is a new list, not a continuation.
      if (list && list.ordered !== ordered) closeList();
      const text = (ul ?? ol)![1];
      if (list) list.items.push(text);
      else list = { ordered, items: [text] };
      continue;
    }

    closeBoth();
    blocks.push({ kind: "paragraph", text: line });
  }

  closeBoth();
  // An unterminated fence is still content the author wrote.
  if (code) blocks.push({ kind: "code", text: code.join("\n") });
  return blocks;
}

export function markdownToHtml(md: string, opts?: { headingColor?: string; accentColor?: string }): string {
  // Normalized here, not at the call sites: these two are the only values that
  // land in attribute position, and everything else this function emits is
  // escaped. A caller that forwards a persisted brand colour untouched — the
  // live editor preview does — would otherwise let a value containing `"` close
  // the style attribute and hang an event handler off every heading.
  const primary = normalizeDocumentBrandColor(
    opts?.headingColor,
    DEFAULT_DOCUMENT_BRAND_COLORS.primaryColor
  );
  const accent = normalizeDocumentBrandColor(
    opts?.accentColor,
    DEFAULT_DOCUMENT_BRAND_COLORS.accentColor
  );

  const inline = (text: string) =>
    escapeHtml(text)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/__(.+?)__/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>")
      .replace(/`([^`]+)`/g, '<code style="background:#f1f5f9;padding:1px 5px;border-radius:4px;font-size:0.92em">$1</code>');

  const headingStyles: Record<number, string> = {
    1: `font-size:22px;margin:28px 0 12px;color:${primary}`,
    2: `font-size:17px;margin:24px 0 10px;color:${primary};border-bottom:2px solid ${accent};padding-bottom:4px`,
    3: `font-size:14px;margin:18px 0 8px;color:${primary}`,
    4: `font-size:13px;margin:14px 0 6px;color:${primary}`,
  };

  const out: string[] = [];
  for (const b of markdownBlocks(md)) {
    switch (b.kind) {
      case "heading":
        out.push(
          `<h${b.level} style="${headingStyles[b.level]}">${inline(b.text)}</h${b.level}>`
        );
        break;
      case "paragraph":
        out.push(`<p style="margin:8px 0;line-height:1.7">${inline(b.text)}</p>`);
        break;
      case "quote":
        out.push(
          `<blockquote style="border-inline-start:3px solid ${accent};margin:12px 0;padding:8px 14px;background:#f8fafc;color:#334155">${inline(b.text)}</blockquote>`
        );
        break;
      case "rule":
        out.push('<hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0" />');
        break;
      case "code":
        out.push(
          `<pre style="background:#0f172a;color:#e2e8f0;padding:12px 14px;border-radius:8px;overflow:auto;font-size:11px;line-height:1.5"><code>${escapeHtml(b.text)}</code></pre>`
        );
        break;
      case "list": {
        const tag = b.ordered ? "ol" : "ul";
        out.push(`<${tag} style="padding-inline-start:22px;margin:8px 0">`);
        for (const item of b.items) {
          out.push(`<li style="margin:4px 0">${inline(item)}</li>`);
        }
        out.push(`</${tag}>`);
        break;
      }
      case "table": {
        out.push(
          '<table style="border-collapse:collapse;width:100%;margin:12px 0;font-size:11px"><tbody>'
        );
        out.push(
          "<tr>" +
            b.header
              .map(
                (c) =>
                  `<th style="border:1px solid #e2e8f0;padding:7px 10px;background:#f1f5f9;text-align:start;font-weight:700">${inline(c)}</th>`
              )
              .join("") +
            "</tr>"
        );
        for (const row of b.rows) {
          out.push(
            "<tr>" +
              row
                .map(
                  (c) =>
                    `<td style="border:1px solid #e2e8f0;padding:6px 10px;text-align:start">${inline(c)}</td>`
                )
                .join("") +
              "</tr>"
          );
        }
        out.push("</tbody></table>");
        break;
      }
    }
  }
  return out.join("\n");
}
