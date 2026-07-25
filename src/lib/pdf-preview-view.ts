/** Chromium / Edge built-in PDF viewer hash fragments for blob: URLs. */
export type PdfPreviewZoom = "fitH" | "fitV" | "page";

export function pdfPreviewSrc(
  objectUrl: string,
  zoom: PdfPreviewZoom = "fitH"
): string {
  const bare = objectUrl.split("#", 1)[0] ?? objectUrl;
  if (zoom === "fitV") return `${bare}#view=FitV`;
  if (zoom === "page") return `${bare}#zoom=page-actual`;
  return `${bare}#view=FitH`;
}
