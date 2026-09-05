/**
 * Plan feature slugs live in `SubscriptionPlan.featuresJson` (seeded from
 * DEFAULT_PLANS in constants.ts) and were never read anywhere, so the
 * PDF-only Starter and the PPTX/XLSX Pro that the pricing page sells were the
 * same product. This is the one place that turns a slug list into a yes/no.
 */

export const EXPORT_FEATURE_SLUGS = {
  pdfOnly: "pdf_export",
  office: "pptx_pdf_xlsx_export",
  all: "all_exports",
} as const;

export function parsePlanFeatures(
  featuresJson: string | null | undefined
): string[] {
  if (!featuresJson) return [];
  try {
    const parsed: unknown = JSON.parse(featuresJson);
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string")
      : [];
  } catch {
    return [];
  }
}

/** Formats that are a rendering of the proposal rather than a deliverable. */
const ALWAYS_ALLOWED = new Set(["html", "manifest"]);
/** Office formats the Pro tier sells; the bid-package ZIP bundles all of them. */
const OFFICE_FORMATS = new Set([
  "xlsx",
  "xlsx-matrix",
  "xlsx-boq",
  "pptx",
  "slides",
  "zip",
]);

/**
 * Whether a plan may download `format`. Unknown formats are refused, so a new
 * format has to be classified here before it can be sold or given away.
 */
export function exportFormatAllowed(
  features: readonly string[],
  format: string
): boolean {
  if (ALWAYS_ALLOWED.has(format)) return true;
  if (features.includes(EXPORT_FEATURE_SLUGS.all)) return true;
  const office = features.includes(EXPORT_FEATURE_SLUGS.office);
  if (format === "pdf") {
    return office || features.includes(EXPORT_FEATURE_SLUGS.pdfOnly);
  }
  if (OFFICE_FORMATS.has(format)) return office;
  // docx and anything not classified above stay Enterprise (`all_exports`).
  return false;
}

/** The cheapest plan name that unlocks `format`, for the upgrade prompt. */
export function planThatUnlocks(format: string): "PRO" | "ENTERPRISE" {
  return format === "docx" ? "ENTERPRISE" : "PRO";
}
