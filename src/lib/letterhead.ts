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

export function pdfHeaderTemplate(opts: {
  companyName: string;
  etimadRef?: string | null;
  primaryColor?: string | null;
}): string {
  const color = normalizeDocumentBrandColor(
    opts.primaryColor,
    designTokens.colors.primary[600]
  );
  const ref = opts.etimadRef ? ` · ${escapeAttr(opts.etimadRef)}` : "";
  return `<div style="font-size:8px;width:100%;padding:0 12mm;color:${escapeAttr(color)};font-family:Arial,sans-serif;display:flex;justify-content:space-between;"><span>${escapeAttr(opts.companyName)}${ref}</span><span style="color:${designTokens.colors.secondary[400]}">Letterhead</span></div>`;
}

export function pdfFooterTemplate(opts: {
  companyName: string;
  primaryColor?: string | null;
}): string {
  const color = normalizeDocumentBrandColor(
    opts.primaryColor,
    designTokens.colors.secondary[500]
  );
  return `<div style="font-size:8px;width:100%;padding:0 12mm;color:${escapeAttr(color)};font-family:Arial,sans-serif;display:flex;justify-content:space-between;"><span>${escapeAttr(opts.companyName)}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`;
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
  return `<div class="letterhead-bar" style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 14px;margin-bottom:18px;border-radius:8px;background:linear-gradient(90deg,${primary},${secondary});color:#fff;border-bottom:3px solid ${accent}">
    <div style="display:flex;align-items:center;gap:10px">${logo}<div><div style="font-weight:700;font-size:13px">${escapeAttr(opts.companyName)}</div>${tag ? `<div style="font-size:10px;opacity:.9">${escapeAttr(tag)}</div>` : ""}</div></div>
    <div style="font-size:9px;opacity:.85;letter-spacing:.04em;text-transform:uppercase">${opts.locale === "ar" ? "ورق رسمي" : "Official letterhead"}</div>
  </div>`;
}
