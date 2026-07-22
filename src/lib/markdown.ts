/**
 * Production Markdown → HTML for proposal PDFs and editor preview.
 * Supports GFM-ish headings, lists, tables, bold/italic, HR, blockquotes, code.
 */

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function markdownToHtml(md: string, opts?: { headingColor?: string; accentColor?: string }): string {
  const primary = opts?.headingColor ?? "#1E3A8A";
  const accent = opts?.accentColor ?? "#0EA5E9";
  const lines = (md || "").replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let inUl = false;
  let inOl = false;
  let inTable = false;
  let inCode = false;
  let codeBuf: string[] = [];

  const closeLists = () => {
    if (inUl) {
      out.push("</ul>");
      inUl = false;
    }
    if (inOl) {
      out.push("</ol>");
      inOl = false;
    }
  };
  const closeTable = () => {
    if (inTable) {
      out.push("</tbody></table>");
      inTable = false;
    }
  };

  const inline = (text: string) =>
    escapeHtml(text)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/__(.+?)__/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>")
      .replace(/`([^`]+)`/g, '<code style="background:#f1f5f9;padding:1px 5px;border-radius:4px;font-size:0.92em">$1</code>');

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trimEnd();

    if (line.startsWith("```")) {
      if (inCode) {
        out.push(
          `<pre style="background:#0f172a;color:#e2e8f0;padding:12px 14px;border-radius:8px;overflow:auto;font-size:11px;line-height:1.5"><code>${escapeHtml(codeBuf.join("\n"))}</code></pre>`
        );
        codeBuf = [];
        inCode = false;
      } else {
        closeLists();
        closeTable();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeBuf.push(raw);
      continue;
    }

    if (!line.trim()) {
      closeLists();
      closeTable();
      continue;
    }

    if (/^---+$/.test(line.trim()) || /^\*\*\*+$/.test(line.trim())) {
      closeLists();
      closeTable();
      out.push('<hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0" />');
      continue;
    }

    const h = line.match(/^(#{1,4})\s+(.+)$/);
    if (h) {
      closeLists();
      closeTable();
      const level = h[1].length;
      const styles: Record<number, string> = {
        1: `font-size:22px;margin:28px 0 12px;color:${primary}`,
        2: `font-size:17px;margin:24px 0 10px;color:${primary};border-bottom:2px solid ${accent};padding-bottom:4px`,
        3: `font-size:14px;margin:18px 0 8px;color:${primary}`,
        4: `font-size:13px;margin:14px 0 6px;color:${primary}`,
      };
      out.push(`<h${level} style="${styles[level]}">${inline(h[2])}</h${level}>`);
      continue;
    }

    if (/^>\s?/.test(line)) {
      closeLists();
      closeTable();
      out.push(
        `<blockquote style="border-inline-start:3px solid ${accent};margin:12px 0;padding:8px 14px;background:#f8fafc;color:#334155">${inline(line.replace(/^>\s?/, ""))}</blockquote>`
      );
      continue;
    }

    if (/^\|.+\|$/.test(line.trim())) {
      closeLists();
      const cells = line
        .trim()
        .slice(1, -1)
        .split("|")
        .map((c) => c.trim());
      // skip separator row
      if (cells.every((c) => /^:?-+:?$/.test(c))) continue;
      if (!inTable) {
        out.push(
          '<table style="border-collapse:collapse;width:100%;margin:12px 0;font-size:11px"><tbody>'
        );
        inTable = true;
        out.push(
          "<tr>" +
            cells
              .map(
                (c) =>
                  `<th style="border:1px solid #e2e8f0;padding:7px 10px;background:#f1f5f9;text-align:start;font-weight:700">${inline(c)}</th>`
              )
              .join("") +
            "</tr>"
        );
      } else {
        out.push(
          "<tr>" +
            cells
              .map(
                (c) =>
                  `<td style="border:1px solid #e2e8f0;padding:6px 10px;text-align:start">${inline(c)}</td>`
              )
              .join("") +
            "</tr>"
        );
      }
      continue;
    }

    const ul = line.match(/^[-*+]\s+(.+)$/);
    if (ul) {
      closeTable();
      if (inOl) {
        out.push("</ol>");
        inOl = false;
      }
      if (!inUl) {
        out.push('<ul style="padding-inline-start:22px;margin:8px 0">');
        inUl = true;
      }
      out.push(`<li style="margin:4px 0">${inline(ul[1])}</li>`);
      continue;
    }

    const ol = line.match(/^\d+\.\s+(.+)$/);
    if (ol) {
      closeTable();
      if (inUl) {
        out.push("</ul>");
        inUl = false;
      }
      if (!inOl) {
        out.push('<ol style="padding-inline-start:22px;margin:8px 0">');
        inOl = true;
      }
      out.push(`<li style="margin:4px 0">${inline(ol[1])}</li>`);
      continue;
    }

    closeLists();
    closeTable();
    out.push(`<p style="margin:8px 0;line-height:1.7">${inline(line)}</p>`);
  }

  closeLists();
  closeTable();
  if (inCode) {
    out.push(
      `<pre style="background:#0f172a;color:#e2e8f0;padding:12px 14px;border-radius:8px"><code>${escapeHtml(codeBuf.join("\n"))}</code></pre>`
    );
  }
  return out.join("\n");
}
