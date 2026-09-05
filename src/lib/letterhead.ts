import {
  isPlaceholderCompanyName,
  resolveBidderDisplayName,
} from "@/lib/text-quality";
import { designTokens } from "./design-tokens";
import {
  DEFAULT_DOCUMENT_BRAND_COLORS,
  normalizeDocumentBrandColor,
  normalizeDocumentBrandFont,
  safeBrandLogoUrlForDocument,
} from "./brand-policy";
import {
  buildPdfFooterTemplate,
  buildPdfHeaderTemplate,
} from "./pdf/document-chrome";

/**
 * Client letterhead helpers — apply workspace BrandProfile to HTML/PDF chrome.
 *
 * Refactored to use the universal design token system for consistency.
 *
 * @see src/lib/design-tokens.ts
 */

export type LetterheadBrand = {
  workspaceId?: string | null;
  logoUrl?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  accentColor?: string | null;
  fontFamily?: string | null;
  tagline?: string | null;
  taglineAr?: string | null;
};

export type LetterheadCompany = {
  name?: string | null;
  nameAr?: string | null;
  crNumber?: string | null;
  vatNumber?: string | null;
};

const FONT_STACKS: Record<string, string> = {
  "IBM Plex Sans Arabic":
    "'IBM Plex Sans Arabic', 'IBM Plex Sans', 'Segoe UI', Arial, sans-serif",
  "IBM Plex Sans":
    "'IBM Plex Sans', 'IBM Plex Sans Arabic', 'Segoe UI', Arial, sans-serif",
  "Space Grotesk":
    "'Space Grotesk', 'IBM Plex Sans Arabic', 'Segoe UI', Arial, sans-serif",
  Cairo: "'Cairo', 'IBM Plex Sans Arabic', 'Segoe UI', Arial, sans-serif",
  Tajawal: "'Tajawal', 'IBM Plex Sans Arabic', 'Segoe UI', Arial, sans-serif",
  Inter: "'Inter', 'IBM Plex Sans Arabic', 'Segoe UI', Arial, sans-serif",
};

export function resolveBrandFontStack(fontFamily?: string | null): string {
  const key = normalizeDocumentBrandFont(fontFamily);
  return FONT_STACKS[key];
}

export function googleFontsHref(fontFamily?: string | null): string {
  const key = normalizeDocumentBrandFont(fontFamily);
  const families = new Set([
    "IBM+Plex+Sans+Arabic:wght@400;500;600;700",
    "IBM+Plex+Sans:wght@400;500;600;700",
  ]);
  if (key === "Space Grotesk") families.add("Space+Grotesk:wght@400;600;700");
  if (key === "Cairo") families.add("Cairo:wght@400;600;700");
  if (key === "Tajawal") families.add("Tajawal:wght@400;500;700");
  if (key === "Inter") families.add("Inter:wght@400;500;600;700");
  return `https://fonts.googleapis.com/css2?${[...families]
    .map((f) => `family=${f}`)
    .join("&")}&display=swap`;
}

export function brandArgb(hex: string): string {
  const candidate = /^[0-9A-Fa-f]{6}$/.test(hex.trim())
    ? `#${hex.trim()}`
    : hex;
  return `FF${normalizeDocumentBrandColor(
    candidate,
    DEFAULT_DOCUMENT_BRAND_COLORS.primaryColor
  ).slice(1)}`;
}

export function officeColor(hex?: string | null, fallback = "#1E3A8A"): string {
  return normalizeDocumentBrandColor(hex, fallback).slice(1);
}

export function resolveOfficeFontFace(fontFamily?: string | null): string {
  return normalizeDocumentBrandFont(fontFamily);
}

export function letterheadCompanyName(
  locale: "ar" | "en",
  brand: LetterheadBrand | null | undefined,
  company?: LetterheadCompany | null
): string {
  return resolveBidderDisplayName(locale, brand, company);
}

/** Secondary line under company — omit platform/placeholder taglines. */
export function letterheadTagline(
  locale: "ar" | "en",
  brand: LetterheadBrand | null | undefined
): string | null {
  const raw =
    locale === "ar"
      ? brand?.taglineAr || brand?.tagline
      : brand?.tagline || brand?.taglineAr;
  if (!raw || isPlaceholderCompanyName(raw)) return null;
  return raw.trim();
}

/**
 * Running PDF header for letterhead documents: company (start), tender
 * reference (end), closed by a hairline. Shares the chrome builder used by
 * structured proposals so every PDF the platform emits reads as one family.
 */
export function pdfHeaderTemplate(opts: {
  companyName: string;
  etimadRef?: string | null;
  primaryColor?: string | null;
  /** Optional Arabic company line rendered under the Latin one. */
  companyNameAr?: string | null;
  /** Horizontal PDF margin to align with; defaults to 18mm. */
  inlineMargin?: string | null;
}): string {
  const color = normalizeDocumentBrandColor(
    opts.primaryColor,
    designTokens.colors.primary[600]
  );
  return buildPdfHeaderTemplate({
    title: opts.companyName,
    titleSecondary: opts.companyNameAr ?? null,
    tenderReference: opts.etimadRef ?? null,
    accentColor: color,
    inlineMargin: opts.inlineMargin ?? null,
  });
}

/**
 * Running PDF footer for letterhead documents: optional status pill and
 * generation date, real "Page X of Y" counters, optional integrity prefix.
 */
export function pdfFooterTemplate(opts: {
  companyName: string;
  primaryColor?: string | null;
  statusLabel?: string | null;
  statusLabelAr?: string | null;
  generatedOn?: string | null;
  integrityHash?: string | null;
  inlineMargin?: string | null;
}): string {
  const color = normalizeDocumentBrandColor(
    opts.primaryColor,
    designTokens.colors.primary[600]
  );
  return buildPdfFooterTemplate({
    title: opts.companyName,
    statusLabel: opts.statusLabel ?? null,
    statusLabelSecondary: opts.statusLabelAr ?? null,
    generatedOn: opts.generatedOn ?? null,
    integrityHash: opts.integrityHash ?? null,
    accentColor: color,
    inlineMargin: opts.inlineMargin ?? null,
  });
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function letterheadBarHtml(opts: {
  brand: LetterheadBrand | null | undefined;
  companyName: string;
  locale: "ar" | "en";
  trustedEmbeddedLogo?: boolean;
}): string {
  const primary = normalizeDocumentBrandColor(
    opts.brand?.primaryColor,
    designTokens.colors.primary[600]
  );
  const secondary = normalizeDocumentBrandColor(
    opts.brand?.secondaryColor,
    designTokens.colors.secondary[900]
  );
  const accent = normalizeDocumentBrandColor(
    opts.brand?.accentColor,
    designTokens.colors.accent[600]
  );
  const logoUrl = safeBrandLogoUrlForDocument(
    opts.brand?.logoUrl,
    opts.brand?.workspaceId ?? "invalid-workspace",
    { allowEmbedded: opts.trustedEmbeddedLogo }
  );
  const logo = logoUrl
    ? `<img src="${escapeAttr(logoUrl)}" alt="" style="height:28px;max-width:120px;object-fit:contain;background:rgba(255,255,255,.15);padding:2px 6px;border-radius:4px" />`
    : "";
  const tagRaw =
    opts.locale === "ar"
      ? opts.brand?.taglineAr || opts.brand?.tagline || ""
      : opts.brand?.tagline || opts.brand?.taglineAr || "";
  const tag =
    tagRaw && !isPlaceholderCompanyName(tagRaw) && tagRaw !== opts.companyName
      ? tagRaw
      : "";
  const label = opts.locale === "ar" ? "ورق رسمي" : "Official letterhead";
  return `<div class="letterhead-bar" style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px 11px;margin-bottom:22px;border-radius:2px;background:linear-gradient(90deg,${primary},${secondary});color:#fff;border-top:3px solid ${accent}">
    <div style="display:flex;align-items:center;gap:12px">${logo}<div><div style="font-weight:650;font-size:13px;letter-spacing:-0.005em">${escapeAttr(opts.companyName)}</div>${tag ? `<div style="font-size:10px;opacity:.88;margin-top:2px">${escapeAttr(tag)}</div>` : ""}</div></div>
    <div style="font-size:8.5px;opacity:.85;letter-spacing:${opts.locale === "ar" ? "0" : ".14em"};text-transform:uppercase;font-weight:600">${label}</div>
  </div>`;
}
