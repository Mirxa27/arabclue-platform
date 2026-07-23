/**
 * Beautiful bilingual (EN|AR) legal contract HTML / PDF export.
 * Client-safe HTML builder; PDF uses Playwright (server-only).
 */

import { parseContractArticles } from "./contract-format";
import { LEGAL_DISCLAIMER } from "./procurement-rules";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildBilingualContractHTML(opts: {
  title: string;
  titleAr?: string | null;
  contentMd: string;
  projectTitle?: string;
  etimadRef?: string | null;
  forPrint?: boolean;
}): string {
  const articles = parseContractArticles(opts.contentMd);
  const titleEn = escapeHtml(opts.title);
  const titleAr = escapeHtml(opts.titleAr || opts.title);
  const project = escapeHtml(opts.projectTitle || "");
  const ref = escapeHtml(opts.etimadRef || "—");

  const articlesHtml =
    articles.length > 0
      ? articles
          .map(
            (a) => `
      <article class="art">
        <header>
          <span class="num">${String(a.number).padStart(2, "0")}</span>
          <div>
            <h2>${escapeHtml(a.titleAr)}</h2>
            <p class="sub">${escapeHtml(a.titleEn)}</p>
          </div>
        </header>
        <div class="cols">
          <div class="col en" lang="en" dir="ltr">
            <span class="lang">English</span>
            <p>${escapeHtml(a.bodyEn)}</p>
          </div>
          <div class="col ar" lang="ar" dir="rtl">
            <span class="lang">العربية</span>
            <p>${escapeHtml(a.bodyAr)}</p>
          </div>
        </div>
      </article>`
          )
          .join("\n")
      : `<pre class="fallback">${escapeHtml(opts.contentMd)}</pre>`;

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${titleAr} · ${titleEn}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;600;700&family=Space+Grotesk:wght@400;600;700&display=swap" rel="stylesheet" />
<style>
  :root {
    --ink: #0c1222;
    --muted: #5b6478;
    --line: #d8dee9;
    --accent: #0f766e;
    --paper: #f7f8fb;
    --panel: #ffffff;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    color: var(--ink);
    background:
      radial-gradient(ellipse 80% 50% at 0% 0%, rgba(15,118,110,0.08), transparent),
      radial-gradient(ellipse 60% 40% at 100% 0%, rgba(30,58,138,0.06), transparent),
      var(--paper);
    font-family: "Space Grotesk", system-ui, sans-serif;
  }
  .wrap { max-width: 980px; margin: 0 auto; padding: 36px 28px 64px; }
  .mast {
    border-bottom: 2px solid var(--ink);
    padding-bottom: 20px;
    margin-bottom: 28px;
  }
  .brand {
    font-size: 11px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--accent);
    font-weight: 700;
  }
  h1 {
    font-family: "IBM Plex Sans Arabic", sans-serif;
    font-size: 28px;
    margin: 10px 0 4px;
    line-height: 1.25;
  }
  .title-en { color: var(--muted); font-size: 14px; margin: 0; }
  .meta {
    display: flex; flex-wrap: wrap; gap: 10px 18px;
    margin-top: 14px; font-size: 12px; color: var(--muted);
  }
  .badge {
    display: inline-block;
    border: 1px solid #d97706;
    color: #92400e;
    background: #fffbeb;
    padding: 4px 10px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 700;
  }
  .art {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 12px;
    margin: 0 0 16px;
    overflow: hidden;
    break-inside: avoid;
  }
  .art header {
    display: flex; gap: 12px; align-items: center;
    padding: 12px 16px;
    border-bottom: 1px solid var(--line);
    background: #f1f5f9;
  }
  .num {
    width: 34px; height: 34px; border-radius: 999px;
    display: grid; place-items: center;
    background: rgba(15,118,110,0.12); color: var(--accent);
    font-weight: 700; font-size: 12px;
  }
  .art h2 {
    font-family: "IBM Plex Sans Arabic", sans-serif;
    font-size: 15px; margin: 0;
  }
  .art .sub { margin: 2px 0 0; font-size: 11px; color: var(--muted); }
  .cols { display: grid; grid-template-columns: 1fr 1fr; }
  .col { padding: 14px 16px; }
  .col.en { border-right: 1px solid var(--line); }
  .lang {
    display: block; font-size: 10px; letter-spacing: 0.16em;
    text-transform: uppercase; color: var(--muted); font-weight: 700;
    margin-bottom: 8px;
  }
  .col p {
    margin: 0; font-size: 12.5px; line-height: 1.75; white-space: pre-wrap;
  }
  .col.ar p {
    font-family: "IBM Plex Sans Arabic", sans-serif;
    line-height: 1.9;
  }
  .disclaimer {
    margin-top: 28px; padding: 14px 16px;
    border: 1px dashed #d97706; border-radius: 10px;
    background: #fffbeb; color: #78350f; font-size: 11px; line-height: 1.6;
  }
  .fallback {
    white-space: pre-wrap; font-size: 12px; background: #fff;
    border: 1px solid var(--line); padding: 16px; border-radius: 10px;
  }
  @media print {
    body { background: #fff; }
    .art { break-inside: avoid; }
  }
  @media (max-width: 720px) {
    .cols { grid-template-columns: 1fr; }
    .col.en { border-right: 0; border-bottom: 1px solid var(--line); }
  }
</style>
</head>
<body>
  <div class="wrap">
    <header class="mast">
      <div class="brand">ArabClue · أراب كلاو</div>
      <h1>${titleAr}</h1>
      <p class="title-en">${titleEn}</p>
      <div class="meta">
        <span class="badge">Draft — not legal advice · مسودة — ليست استشارة قانونية</span>
        ${project ? `<span>Project: ${project}</span>` : ""}
        <span>Ref: ${ref}</span>
      </div>
    </header>
    ${articlesHtml}
    <aside class="disclaimer">
      ${escapeHtml(LEGAL_DISCLAIMER)}
      <br /><br />
      مسودات العقود والتعليقات التنظيمية أدوات صياغة مساعدة، وليست استشارة قانونية. يلزم مراجعة واعتماد قانوني بشري معتمد قبل التوقيع. لا يقين قانوني بنسبة 100%.
    </aside>
  </div>
</body>
</html>`;
}

export function generateBilingualContractHTML(opts: {
  title: string;
  titleAr?: string | null;
  contentMd: string;
  projectTitle?: string;
  etimadRef?: string | null;
}): Buffer {
  return Buffer.from(
    buildBilingualContractHTML({ ...opts, forPrint: false }),
    "utf8"
  );
}

export async function generateBilingualContractPDF(opts: {
  title: string;
  titleAr?: string | null;
  contentMd: string;
  projectTitle?: string;
  etimadRef?: string | null;
}): Promise<Buffer> {
  const html = buildBilingualContractHTML({ ...opts, forPrint: true });
  const { htmlToPdf, PdfGenerationError } = await import("./pdf/html-to-pdf");
  try {
    return await htmlToPdf(html, {
      format: "A4",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: `<div style="font-size:8px;width:100%;text-align:center;color:#94a3b8;padding:0 12mm;">ArabClue · Draft Contract · مسودة عقد</div>`,
      footerTemplate: `<div style="font-size:8px;width:100%;text-align:center;color:#94a3b8;padding:0 12mm;"><span class="pageNumber"></span> / <span class="totalPages"></span> · Not legal advice</div>`,
      margin: { top: "16mm", bottom: "18mm", left: "10mm", right: "10mm" },
      waitMs: 400,
    });
  } catch (err) {
    if (err instanceof PdfGenerationError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw new PdfGenerationError(
      `Contract PDF generation failed (Playwright/Chromium unavailable): ${message}`,
      { cause: err }
    );
  }
}
