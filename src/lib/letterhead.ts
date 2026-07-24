/**
 * Client letterhead helpers — apply workspace BrandProfile to HTML/PDF chrome.
 */

export type LetterheadBrand = {
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
  const key = (fontFamily || "IBM Plex Sans Arabic").trim();
  return FONT_STACKS[key] ?? `'${key.replace(/'/g, "")}', 'IBM Plex Sans Arabic', Arial, sans-serif`;
}

export function googleFontsHref(fontFamily?: string | null): string {
  const key = (fontFamily || "IBM Plex Sans Arabic").trim();
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
  return `FF${hex.replace(/^#/, "").toUpperCase()}`;
}

export function officeColor(hex?: string | null, fallback = "#1E3A8A"): string {
  return (hex ?? fallback).replace(/^#/, "").toUpperCase();
}

export function resolveOfficeFontFace(fontFamily?: string | null): string {
  const key = (fontFamily || "IBM Plex Sans Arabic").trim();
  return FONT_STACKS[key] ? key : "Arial";
}

export function letterheadCompanyName(
  locale: "ar" | "en",
  brand: LetterheadBrand | null | undefined,
  company?: LetterheadCompany | null
): string {
  if (locale === "ar") {
    return (
      company?.nameAr ||
      company?.name ||
      brand?.taglineAr ||
      brand?.tagline ||
      "أراب كلاو"
    );
  }
  return company?.name || brand?.tagline || "ArabClue";
}

export function pdfHeaderTemplate(opts: {
  companyName: string;
  etimadRef?: string | null;
  primaryColor?: string | null;
}): string {
  const color = opts.primaryColor || "#1E3A8A";
  const ref = opts.etimadRef ? ` · ${escapeAttr(opts.etimadRef)}` : "";
  return `<div style="font-size:8px;width:100%;padding:0 12mm;color:${escapeAttr(color)};font-family:Arial,sans-serif;display:flex;justify-content:space-between;"><span>${escapeAttr(opts.companyName)}${ref}</span><span style="color:#94a3b8">Letterhead</span></div>`;
}

export function pdfFooterTemplate(opts: {
  companyName: string;
  primaryColor?: string | null;
}): string {
  const color = opts.primaryColor || "#64748b";
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
}): string {
  const primary = opts.brand?.primaryColor ?? "#1E3A8A";
  const secondary = opts.brand?.secondaryColor ?? "#0F172A";
  const accent = opts.brand?.accentColor ?? "#0EA5E9";
  const logo = opts.brand?.logoUrl
    ? `<img src="${escapeAttr(opts.brand.logoUrl)}" alt="" style="height:28px;max-width:120px;object-fit:contain;background:rgba(255,255,255,.15);padding:2px 6px;border-radius:4px" />`
    : "";
  const tag =
    opts.locale === "ar"
      ? opts.brand?.taglineAr || opts.brand?.tagline || ""
      : opts.brand?.tagline || opts.brand?.taglineAr || "";
  return `<div class="letterhead-bar" style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 14px;margin-bottom:18px;border-radius:8px;background:linear-gradient(90deg,${primary},${secondary});color:#fff;border-bottom:3px solid ${accent}">
    <div style="display:flex;align-items:center;gap:10px">${logo}<div><div style="font-weight:700;font-size:13px">${escapeAttr(opts.companyName)}</div>${tag ? `<div style="font-size:10px;opacity:.9">${escapeAttr(tag)}</div>` : ""}</div></div>
    <div style="font-size:9px;opacity:.85;letter-spacing:.04em;text-transform:uppercase">${opts.locale === "ar" ? "ورق رسمي" : "Official letterhead"}</div>
  </div>`;
}
