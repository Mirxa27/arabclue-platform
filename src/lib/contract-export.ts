/**
 * Beautiful bilingual (EN|AR) legal contract HTML / PDF export.
 * Client-safe HTML builder; PDF uses Playwright (server-only).
 */

import { parseContractArticles } from "./contract-format";
import { LEGAL_DISCLAIMER } from "./procurement-rules";
import {
  googleFontsHref,
  letterheadBarHtml,
  letterheadCompanyName,
  pdfFooterTemplate,
  pdfHeaderTemplate,
  resolveBrandFontStack,
  type LetterheadBrand,
  type LetterheadCompany,
} from "./letterhead";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type ContractExportOpts = {
  title: string;
  titleAr?: string | null;
  contentMd: string;
  projectTitle?: string;
  etimadRef?: string | null;
  forPrint?: boolean;
  brand?: LetterheadBrand | null;
  company?: LetterheadCompany | null;
};

export function buildBilingualContractHTML(opts: ContractExportOpts): string {
  const articles = parseContractArticles(opts.contentMd);
  const titleEn = escapeHtml(opts.title);
  const titleAr = escapeHtml(opts.titleAr || opts.title);
  const project = escapeHtml(opts.projectTitle || "");
  const ref = escapeHtml(opts.etimadRef || "—");
  const primary = opts.brand?.primaryColor ?? "#0f766e";
  const secondary = opts.brand?.secondaryColor ?? "#0c1222";
  const accent = opts.brand?.accentColor ?? primary;
  const fontStack = resolveBrandFontStack(opts.brand?.fontFamily);
  const fontsHref = googleFontsHref(opts.brand?.fontFamily);
  const companyName = letterheadCompanyName("ar", opts.brand, opts.company);
  const companyNameEn = letterheadCompanyName("en", opts.brand, opts.company);
  const letterhead = letterheadBarHtml({
    brand: opts.brand,
    companyName,
    locale: "ar",
  });

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
<link href="${fontsHref}" rel="stylesheet" />
<style>
  :root {
    --ink: ${secondary};
    --muted: #5b6478;
    --line: #d8dee9;
    --accent: ${accent};
    --paper: #f7f8fb;
    --panel: #ffffff;
    --primary: ${primary};
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    color: var(--ink);
    background:
      radial-gradient(ellipse 80% 50% at 0% 0%, color-mix(in srgb, ${primary} 12%, transparent), transparent),
      radial-gradient(ellipse 60% 40% at 100% 0%, color-mix(in srgb, ${accent} 10%, transparent), transparent),
      var(--paper);
    font-family: ${fontStack};
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
    font-family: ${fontStack};
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
    padding: 18px 18px 16px;
    margin-bottom: 14px;
  }
  .art header { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 12px; }
  .num {
    font-weight: 700; color: var(--primary); font-size: 18px; min-width: 2ch;
  }
  .art h2 { margin: 0; font-size: 16px; }
  .sub { margin: 2px 0 0; font-size: 12px; color: var(--muted); }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 0; border-top: 1px solid var(--line); }
  .col { padding: 12px; }
  .col.en { border-right: 1px solid var(--line); }
  .lang { display: block; font-size: 10px; letter-spacing: .12em; text-transform: uppercase; color: var(--accent); margin-bottom: 6px; font-weight: 700; }
  .col p { margin: 0; font-size: 12.5px; line-height: 1.75; white-space: pre-wrap; }
  .disclaimer {
    margin-top: 28px; padding: 14px 16px; border-radius: 10px;
    background: #fffbeb; border: 1px solid #fcd34d; color: #92400e; font-size: 11px; line-height: 1.55;
  }
  .fallback { white-space: pre-wrap; font-size: 12px; }
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
    ${letterhead}
    <header class="mast">
      <div class="brand">${escapeHtml(companyNameEn)} · ${escapeHtml(companyName)}</div>
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

export function generateBilingualContractHTML(
  opts: Omit<ContractExportOpts, "forPrint">
): Buffer {
  return Buffer.from(
    buildBilingualContractHTML({ ...opts, forPrint: false }),
    "utf8"
  );
}

export async function generateBilingualContractPDF(
  opts: Omit<ContractExportOpts, "forPrint">
): Promise<Buffer> {
  const html = buildBilingualContractHTML({ ...opts, forPrint: true });
  const companyLabel = letterheadCompanyName("en", opts.brand, opts.company);
  const { htmlToPdf, PdfGenerationError } = await import("./pdf/html-to-pdf");
  try {
    return await htmlToPdf(html, {
      format: "A4",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: pdfHeaderTemplate({
        companyName: companyLabel,
        etimadRef: opts.etimadRef,
        primaryColor: opts.brand?.primaryColor ?? "#0f766e",
      }),
      footerTemplate: pdfFooterTemplate({
        companyName: companyLabel,
        primaryColor: opts.brand?.primaryColor ?? "#0f766e",
      }),
      margin: { top: "18mm", bottom: "18mm", left: "10mm", right: "10mm" },
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
