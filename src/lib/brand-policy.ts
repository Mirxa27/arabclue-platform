/**
 * Browser-safe brand value policy shared by previews and server renderers.
 * Keep this module free of Node/filesystem imports.
 */

export const DOCUMENT_BRAND_FONT_FAMILIES = [
  "IBM Plex Sans Arabic",
  "IBM Plex Sans",
  "Space Grotesk",
  "Cairo",
  "Tajawal",
  "Inter",
] as const;

export type DocumentBrandFontFamily =
  (typeof DOCUMENT_BRAND_FONT_FAMILIES)[number];

export const DEFAULT_DOCUMENT_BRAND_COLORS = Object.freeze({
  primaryColor: "#1E3A8A",
  secondaryColor: "#0F172A",
  accentColor: "#0EA5E9",
});

export const DEFAULT_DOCUMENT_BRAND_FONT: DocumentBrandFontFamily =
  "IBM Plex Sans Arabic";

const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;
const API_FILES_PATH = "/api/files";
const MAX_EMBEDDED_LOGO_BYTES = 8 * 1024 * 1024;
const NORMALIZED_DATA_LOGO_PATTERN =
  /^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/;
const WORKSPACE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const allowedFontFamilies = new Set<string>(DOCUMENT_BRAND_FONT_FAMILIES);

export type BrandWithLogo = {
  logoUrl?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  accentColor?: string | null;
  fontFamily?: string | null;
  tagline?: string | null;
  taglineAr?: string | null;
};

/** Return a canonical six-digit CSS color or a known-safe fallback. */
export function normalizeDocumentBrandColor(
  value: string | null | undefined,
  fallback: string
): string {
  const safeFallback = HEX_COLOR_PATTERN.test(fallback)
    ? fallback.toUpperCase()
    : DEFAULT_DOCUMENT_BRAND_COLORS.primaryColor;
  const candidate = value?.trim();
  return candidate && HEX_COLOR_PATTERN.test(candidate)
    ? candidate.toUpperCase()
    : safeFallback;
}

/** Return a known font family; persisted arbitrary CSS is never reflected. */
export function normalizeDocumentBrandFont(
  value: string | null | undefined
): DocumentBrandFontFamily {
  const candidate = value?.trim();
  return candidate && allowedFontFamilies.has(candidate)
    ? (candidate as DocumentBrandFontFamily)
    : DEFAULT_DOCUMENT_BRAND_FONT;
}

/** Normalize persisted style values at every document render boundary. */
export function normalizeBrandForDocument<T extends BrandWithLogo>(
  brand: T | null
): T | null {
  if (!brand) return null;
  return {
    ...brand,
    primaryColor: normalizeDocumentBrandColor(
      brand.primaryColor,
      DEFAULT_DOCUMENT_BRAND_COLORS.primaryColor
    ),
    secondaryColor: normalizeDocumentBrandColor(
      brand.secondaryColor,
      DEFAULT_DOCUMENT_BRAND_COLORS.secondaryColor
    ),
    accentColor: normalizeDocumentBrandColor(
      brand.accentColor,
      DEFAULT_DOCUMENT_BRAND_COLORS.accentColor
    ),
    fontFamily: normalizeDocumentBrandFont(brand.fontFamily),
  };
}

function isWorkspaceStorageKey(
  value: string,
  workspaceId: string
): boolean {
  if (!WORKSPACE_ID_PATTERN.test(workspaceId)) return false;
  if (
    !value ||
    value.startsWith("/") ||
    value.includes("\\") ||
    value.includes("\0") ||
    value.includes("?") ||
    value.includes("#") ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)
  ) {
    return false;
  }
  const segments = value.split("/");
  return (
    segments.length >= 3 &&
    segments[0] === "uploads" &&
    segments[1] === workspaceId &&
    segments.every(
      (segment) => Boolean(segment) && segment !== "." && segment !== ".."
    )
  );
}

/** Pure URL parser used by browser previews before any asset is reflected. */
export function extractWorkspaceLogoStoragePath(
  logoUrl: string,
  workspaceId: string
): string | null {
  if (
    !logoUrl.startsWith("/") ||
    logoUrl.startsWith("//") ||
    logoUrl.includes("\\") ||
    logoUrl.includes("\0")
  ) {
    return null;
  }

  try {
    const parsed = new URL(logoUrl, "https://arabclue.invalid");
    if (
      parsed.origin !== "https://arabclue.invalid" ||
      parsed.pathname !== API_FILES_PATH ||
      parsed.hash ||
      [...parsed.searchParams.keys()].some((key) => key !== "path")
    ) {
      return null;
    }
    const values = parsed.searchParams.getAll("path");
    const pathValue = values.length === 1 ? values[0] : null;
    return pathValue && isWorkspaceStorageKey(pathValue, workspaceId)
      ? pathValue
      : null;
  } catch {
    return null;
  }
}

/**
 * Select a logo URI for HTML output. Embedded data is an explicit internal
 * opt-in reserved for already decoded/re-encoded PDF assets.
 */
export function safeBrandLogoUrlForDocument(
  logoUrl: string | null | undefined,
  workspaceId: string,
  options: { readonly allowEmbedded?: boolean } = {}
): string | null {
  if (!logoUrl) return null;
  if (extractWorkspaceLogoStoragePath(logoUrl, workspaceId)) return logoUrl;
  if (!options.allowEmbedded) return null;

  const match = logoUrl.match(NORMALIZED_DATA_LOGO_PATTERN);
  if (!match) return null;
  const encoded = match[1];
  const estimatedBytes =
    Math.floor((encoded.length * 3) / 4) -
    (encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0);
  return estimatedBytes > 0 && estimatedBytes <= MAX_EMBEDDED_LOGO_BYTES
    ? logoUrl
    : null;
}
