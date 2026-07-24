/**
 * Browser-safe policy for serving and previewing private workspace uploads.
 *
 * Uploaded bytes are untrusted even when their filename looks harmless. Only
 * raster images and PDFs receive an inline-capable media type. Markup formats
 * are delivered as inert bytes/text and never selected for executable preview.
 */

export type StoredFilePreviewKind = "pdf" | "image" | "text" | "binary";

export type StoredFileResponsePolicy = {
  readonly contentType: string;
  readonly forceDownload: boolean;
  readonly fileName: string;
  readonly headers: Readonly<Record<string, string>>;
};

/** Generated HTML may retain its origin for parent-driven print, never script. */
export const GENERATED_HTML_PREVIEW_SANDBOX =
  "allow-same-origin allow-modals" as const;
/** PDF/blob previews receive no optional sandbox capabilities. */
export const PDF_PREVIEW_SANDBOX = "" as const;

const RESPONSE_MEDIA_TYPES: Readonly<Record<string, string>> = Object.freeze({
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".csv": "text/plain; charset=utf-8",
  ".json": "text/plain; charset=utf-8",
  ".html": "text/plain; charset=utf-8",
  ".htm": "text/plain; charset=utf-8",
  ".svg": "application/octet-stream",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx":
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".pptx":
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
});

const INLINE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".pdf",
  ".txt",
  ".md",
  ".csv",
  ".json",
]);
const RASTER_IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
]);

function extensionOf(value: string): string {
  const withoutQuery = value.split(/[?#]/, 1)[0].toLowerCase();
  const slash = Math.max(
    withoutQuery.lastIndexOf("/"),
    withoutQuery.lastIndexOf("\\")
  );
  const dot = withoutQuery.lastIndexOf(".");
  return dot > slash ? withoutQuery.slice(dot) : "";
}

function baseName(value: string): string {
  const parts = value.split(/[\\/]/);
  return parts.at(-1) || "download";
}

/** Header-safe filename. Unicode is retained for the RFC 5987 parameter. */
export function sanitizeDownloadFilename(value: string): string {
  const sanitized = baseName(value)
    .replace(/[\u0000-\u001F\u007F"\\]/g, "_")
    .trim()
    .slice(0, 180);
  return sanitized || "download";
}

function encodedFilename(value: string): string {
  return encodeURIComponent(value).replace(
    /['()*]/g,
    (character) =>
      `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function contentDisposition(fileName: string): string {
  const asciiFallback =
    fileName
      .replace(/[^\x20-\x7E]/g, "_")
      .replace(/["\\]/g, "_")
      .slice(0, 180) || "download";
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodedFilename(
    fileName
  )}`;
}

/**
 * Classify preview behavior using both persisted MIME metadata and filename.
 * HTML is intentionally treated as source text; SVG is intentionally binary.
 */
export function classifyStoredFilePreviewKind(
  mimeType: string | null | undefined,
  fileName: string
): StoredFilePreviewKind {
  const mime = (mimeType || "").trim().toLowerCase();
  const extension = extensionOf(fileName);
  if (mime === "application/pdf" || extension === ".pdf") return "pdf";
  if (
    RASTER_IMAGE_EXTENSIONS.has(extension) &&
    (mime === "" ||
      mime === "application/octet-stream" ||
      mime === RESPONSE_MEDIA_TYPES[extension])
  ) {
    return "image";
  }
  if (
    mime === "text/html" ||
    extension === ".html" ||
    extension === ".htm" ||
    mime.startsWith("text/") ||
    [".txt", ".md", ".csv", ".json"].includes(extension)
  ) {
    return "text";
  }
  return "binary";
}

/** Build fail-closed headers from the canonical storage key, never user MIME. */
export function createStoredFileResponsePolicy(
  storagePath: string,
  requestedName: string | null,
  downloadRequested: boolean
): StoredFileResponsePolicy {
  const extension = extensionOf(storagePath);
  const fileName = sanitizeDownloadFilename(
    requestedName || baseName(storagePath)
  );
  const contentType =
    RESPONSE_MEDIA_TYPES[extension] ?? "application/octet-stream";
  const forceDownload =
    downloadRequested || !INLINE_EXTENSIONS.has(extension);
  const headers: Record<string, string> = {
    "Content-Type": contentType,
    "Cache-Control": "private, no-store",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  };
  if (forceDownload) {
    headers["Content-Disposition"] = contentDisposition(fileName);
  }
  return { contentType, forceDownload, fileName, headers };
}
