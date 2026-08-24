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
  etimadRef?: string | null;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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
  return `<!DOCTYPE html><html lang="${opts.locale}" dir="${dir}"><head><meta charset="utf-8"/><title>${escapeHtml(opts.title)}</title></head><body style="font-family:${font};margin:24px;color:#0F172A">${letterhead}<article>${opts.body}</article></body></html>`;
}

export function renderCoverLetterheadHtml(input: BrandedFrontMatterInput): string {
  const locale = input.locale === "ar" ? "ar" : "en";
  const companyName = letterheadCompanyName(locale, input.brand, input.company);
  const title = locale === "ar" ? "غلاف التقديم" : "Submission cover";
  const ref = input.etimadRef?.trim();
  const body = `
    <h1 style="font-size:22px;margin:24px 0 8px">${escapeHtml(input.projectTitle)}</h1>
    ${ref ? `<p style="font-size:13px;opacity:.75">${escapeHtml(ref)}</p>` : ""}
    <p style="font-size:14px;margin-top:24px">${escapeHtml(companyName)}</p>
  `;
  return shell({ locale, brand: input.brand, title, body, companyName });
}

export function renderSubmissionLetterHtml(input: BrandedFrontMatterInput): string {
  const locale = input.locale === "ar" ? "ar" : "en";
  const companyName = letterheadCompanyName(locale, input.brand, input.company);
  const title = locale === "ar" ? "خطاب التقديم" : "Submission letter";
  const ref = input.etimadRef?.trim();
  const body =
    locale === "ar"
      ? `<p>السادة لجنة التقييم،</p><p>نرفق مسودة عرضنا لمناقصة ${escapeHtml(input.projectTitle)}${ref ? ` (${escapeHtml(ref)})` : ""}.</p><p>هذا الخطاب معاينة على ورق الهوية وليس إيداعاً موقّعاً على منصة اعتماد.</p><p>${escapeHtml(companyName)}</p>`
      : `<p>Dear evaluation committee,</p><p>Please find our draft submission for ${escapeHtml(input.projectTitle)}${ref ? ` (${escapeHtml(ref)})` : ""}.</p><p>This letter is a branded preview, not a signed Etimad filing.</p><p>${escapeHtml(companyName)}</p>`;
  return shell({ locale, brand: input.brand, title, body, companyName });
}
