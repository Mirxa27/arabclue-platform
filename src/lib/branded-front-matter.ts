import {
  letterheadBarHtml,
  letterheadCompanyName,
  resolveBrandFontStack,
  type LetterheadBrand,
  type LetterheadCompany,
} from "@/lib/letterhead";

export type FrontMatterLocale = "ar" | "en";

export type BrandedFrontMatterInput = {
  locale: FrontMatterLocale;
  brand: LetterheadBrand | null;
  company?: LetterheadCompany | null;
  projectTitle: string;
  /** Optional Arabic tender title; used when locale is ar and non-empty after trim. */
  projectTitleAr?: string | null;
  etimadRef?: string | null;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Locale-aware project title for cover/letter body (no invented translation). */
export function resolveFrontMatterProjectTitle(input: {
  locale: FrontMatterLocale;
  projectTitle: string;
  projectTitleAr?: string | null;
}): string {
  if (input.locale === "ar") {
    const ar = (input.projectTitleAr ?? "").trim();
    if (ar) return ar;
  }
  return input.projectTitle;
}

const FRONT_MATTER_COPY = {
  cover: {
    title: { en: "Submission cover", ar: "غلاف التقديم" },
    kicker: { en: "Tender submission", ar: "تقديم عطاء" },
    reference: { en: "Tender reference", ar: "مرجع المنافسة" },
    bidder: { en: "Submitted by", ar: "مقدم العرض" },
    notice: {
      en: "Branded preview of the submission cover. It is not a signed Etimad filing.",
      ar: "معاينة على ورق الهوية لغلاف التقديم، وليست إيداعاً موقّعاً على منصة اعتماد.",
    },
  },
  letter: {
    title: { en: "Submission letter", ar: "خطاب التقديم" },
    kicker: { en: "Cover letter", ar: "خطاب تغطية" },
    subject: { en: "Subject", ar: "الموضوع" },
    signature: { en: "Authorised signatory", ar: "المفوّض بالتوقيع" },
    signatureHint: { en: "Name, title, signature and date", ar: "الاسم والمنصب والتوقيع والتاريخ" },
  },
} as const;

/**
 * Self-contained document shell for front-matter sheets. Fonts stay local
 * (no remote font requests); the body uses the same scale, ink, and hairline
 * vocabulary as the structured bilingual documents so the bid package reads
 * as one family.
 */
function shell(opts: {
  locale: FrontMatterLocale;
  brand: LetterheadBrand | null;
  title: string;
  body: string;
  companyName: string;
}): string {
  const dir = opts.locale === "ar" ? "rtl" : "ltr";
  const font = resolveBrandFontStack(opts.brand?.fontFamily);
  const letterhead = letterheadBarHtml({
    brand: opts.brand,
    companyName: opts.companyName,
    locale: opts.locale,
    trustedEmbeddedLogo: false,
  });
  const styles = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
html { font-size: 11pt; }
body {
  margin: 0;
  padding: 18mm 18mm 16mm;
  max-width: 210mm;
  font-family: ${font};
  font-size: 10.5pt;
  line-height: ${opts.locale === "ar" ? "1.7" : "1.5"};
  color: #0F172A;
  background: #FFFFFF;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
article { display: grid; gap: 7mm; }
.fm-kicker {
  margin: 0;
  font-size: 8pt;
  font-weight: 600;
  letter-spacing: ${opts.locale === "ar" ? "0" : "0.2em"};
  text-transform: uppercase;
  color: #475569;
}
.fm-title {
  margin: 0;
  font-size: 22pt;
  line-height: ${opts.locale === "ar" ? "1.4" : "1.2"};
  font-weight: 650;
  letter-spacing: ${opts.locale === "ar" ? "0" : "-0.015em"};
  color: #0F172A;
  text-wrap: balance;
  padding-bottom: 5mm;
  border-bottom: 2.5px solid ${normalizedBrandColor(opts.brand)};
}
.fm-meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 5mm 8mm; margin: 0; }
.fm-meta div { border-bottom: 0.5px solid #D9DEE5; padding-bottom: 2.5mm; }
.fm-meta dt {
  margin: 0 0 1mm;
  font-size: 7pt;
  font-weight: 600;
  letter-spacing: ${opts.locale === "ar" ? "0" : "0.16em"};
  text-transform: uppercase;
  color: #475569;
}
.fm-meta dd { margin: 0; font-size: 12pt; font-weight: 600; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.fm-notice {
  margin: 0;
  padding: 3mm 4.5mm;
  border-inline-start: 3px solid #94A3B8;
  background: #F6F8FA;
  color: #475569;
  font-size: 9pt;
  font-weight: 500;
}
.fm-letter p { margin: 0 0 3.5mm; }
.fm-subject { font-weight: 600; }
.fm-signature { margin-top: 12mm; display: grid; gap: 1.5mm; max-width: 80mm; }
.fm-signature .fm-signature-line { min-height: 14mm; border-bottom: 1px solid #94A3B8; }
.fm-signature span { font-size: 7pt; letter-spacing: ${opts.locale === "ar" ? "0" : "0.12em"}; text-transform: uppercase; color: #475569; }
@media print {
  body { padding: 0; max-width: none; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  .fm-notice, .fm-meta div { break-inside: avoid; }
}`;
  return `<!DOCTYPE html><html lang="${opts.locale}" dir="${dir}"><head><meta charset="utf-8"/><meta name="color-scheme" content="light"/><title>${escapeHtml(opts.title)}</title><style>${styles}</style></head><body>${letterhead}<article>${opts.body}</article></body></html>`;
}

const HEX_BRAND_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/u;

function normalizedBrandColor(brand: LetterheadBrand | null): string {
  const candidate = brand?.primaryColor?.trim();
  return candidate && HEX_BRAND_COLOR.test(candidate) ? candidate : "#0F766E";
}

export function renderCoverLetterheadHtml(input: BrandedFrontMatterInput): string {
  const locale = input.locale === "ar" ? "ar" : "en";
  const companyName = letterheadCompanyName(locale, input.brand, input.company);
  const projectTitle = resolveFrontMatterProjectTitle({
    locale,
    projectTitle: input.projectTitle,
    projectTitleAr: input.projectTitleAr,
  });
  const copy = FRONT_MATTER_COPY.cover;
  const title = copy.title[locale];
  const ref = input.etimadRef?.trim();
  const body = `
    <p class="fm-kicker">${escapeHtml(copy.kicker[locale])}</p>
    <h1 class="fm-title">${escapeHtml(projectTitle)}</h1>
    <dl class="fm-meta">
      ${ref ? `<div><dt>${escapeHtml(copy.reference[locale])}</dt><dd dir="ltr">${escapeHtml(ref)}</dd></div>` : ""}
      <div><dt>${escapeHtml(copy.bidder[locale])}</dt><dd>${escapeHtml(companyName)}</dd></div>
    </dl>
    <p class="fm-notice">${escapeHtml(copy.notice[locale])}</p>
  `;
  return shell({ locale, brand: input.brand, title, body, companyName });
}

export function renderSubmissionLetterHtml(input: BrandedFrontMatterInput): string {
  const locale = input.locale === "ar" ? "ar" : "en";
  const companyName = letterheadCompanyName(locale, input.brand, input.company);
  const projectTitle = resolveFrontMatterProjectTitle({
    locale,
    projectTitle: input.projectTitle,
    projectTitleAr: input.projectTitleAr,
  });
  const copy = FRONT_MATTER_COPY.letter;
  const title = copy.title[locale];
  const ref = input.etimadRef?.trim();
  const subject = `${escapeHtml(projectTitle)}${ref ? ` (${escapeHtml(ref)})` : ""}`;
  const letter =
    locale === "ar"
      ? `<p>السادة لجنة التقييم،</p><p>نرفق مسودة عرضنا لمناقصة ${escapeHtml(projectTitle)}${ref ? ` (${escapeHtml(ref)})` : ""}.</p><p>هذا الخطاب معاينة على ورق الهوية وليس إيداعاً موقّعاً على منصة اعتماد.</p><p>${escapeHtml(companyName)}</p>`
      : `<p>Dear evaluation committee,</p><p>Please find our draft submission for ${escapeHtml(projectTitle)}${ref ? ` (${escapeHtml(ref)})` : ""}.</p><p>This letter is a branded preview, not a signed Etimad filing.</p><p>${escapeHtml(companyName)}</p>`;
  const body = `
    <p class="fm-kicker">${escapeHtml(copy.kicker[locale])}</p>
    <h1 class="fm-title">${escapeHtml(title)}</h1>
    <div class="fm-letter">
      <p class="fm-subject">${escapeHtml(copy.subject[locale])}: ${subject}</p>
      ${letter}
      <div class="fm-signature"><span>${escapeHtml(copy.signature[locale])}</span><div class="fm-signature-line"></div><span>${escapeHtml(copy.signatureHint[locale])}</span></div>
    </div>
  `;
  return shell({ locale, brand: input.brand, title, body, companyName });
}
