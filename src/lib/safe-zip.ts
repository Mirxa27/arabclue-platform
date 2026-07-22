/**
 * Safe ZIP extraction — prevents ZIP-slip path traversal and decompression bombs.
 */

import JSZip from "jszip";

export const ZIP_LIMITS = {
  maxEntries: 200,
  maxEntryBytes: 25 * 1024 * 1024,
  maxTotalUncompressedBytes: 80 * 1024 * 1024,
  maxCompressionRatio: 100,
  allowedExtensions: [
    ".pdf",
    ".docx",
    ".doc",
    ".xlsx",
    ".xls",
    ".pptx",
    ".ppt",
    ".txt",
    ".md",
    ".csv",
    ".json",
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".gif",
  ],
} as const;

export type SafeZipEntry = {
  name: string;
  bytes: Buffer;
  sizeBytes: number;
};

export type SafeZipResult = {
  entries: SafeZipEntry[];
  skipped: { name: string; reason: string }[];
  totalUncompressedBytes: number;
};

export function isZipSlip(entryName: string): boolean {
  const normalized = entryName.replace(/\\/g, "/");
  if (normalized.includes("\0")) return true;
  // Absolute paths (Unix or Windows)
  if (normalized.startsWith("/") || /^[a-zA-Z]:/.test(normalized)) return true;
  const segments = normalized.split("/");
  if (segments.some((s) => s === "..")) return true;
  // Normalize and reject any escape above the archive root
  const parts: string[] = [];
  for (const seg of segments) {
    if (!seg || seg === ".") continue;
    if (seg === "..") return true;
    parts.push(seg);
  }
  return false;
}

function hasAllowedExtension(name: string): boolean {
  const lower = name.toLowerCase();
  return ZIP_LIMITS.allowedExtensions.some((ext) => lower.endsWith(ext));
}

/**
 * Extract text-bearing entries from a ZIP package safely.
 * Never writes paths from the archive; returns in-memory buffers only.
 */
export async function extractSafeZip(
  bytes: Buffer,
  opts?: Partial<typeof ZIP_LIMITS>
): Promise<SafeZipResult> {
  const limits = { ...ZIP_LIMITS, ...opts };
  const zip = await JSZip.loadAsync(bytes);
  const entries: SafeZipEntry[] = [];
  const skipped: { name: string; reason: string }[] = [];
  let totalUncompressedBytes = 0;
  let entryCount = 0;

  const names = Object.keys(zip.files);
  for (const name of names) {
    const file = zip.files[name];
    if (!file || file.dir) continue;

    entryCount += 1;
    if (entryCount > limits.maxEntries) {
      skipped.push({ name, reason: "max_entries_exceeded" });
      continue;
    }

    if (isZipSlip(name)) {
      skipped.push({ name, reason: "zip_slip" });
      continue;
    }

    // Skip macOS / metadata noise
    if (name.startsWith("__MACOSX/") || name.endsWith(".DS_Store")) {
      skipped.push({ name, reason: "metadata" });
      continue;
    }

    if (!hasAllowedExtension(name)) {
      skipped.push({ name, reason: "extension_not_allowed" });
      continue;
    }

    // Compressed size heuristic when available
    const compressed = (file as { _data?: { compressedSize?: number } })._data
      ?.compressedSize;
    const uncompressedHint = (file as { _data?: { uncompressedSize?: number } })
      ._data?.uncompressedSize;
    if (
      compressed != null &&
      uncompressedHint != null &&
      compressed > 0 &&
      uncompressedHint / compressed > limits.maxCompressionRatio
    ) {
      skipped.push({ name, reason: "compression_ratio" });
      continue;
    }

    const content = await file.async("nodebuffer");
    if (content.length > limits.maxEntryBytes) {
      skipped.push({ name, reason: "entry_too_large" });
      continue;
    }

    totalUncompressedBytes += content.length;
    if (totalUncompressedBytes > limits.maxTotalUncompressedBytes) {
      skipped.push({ name, reason: "total_uncompressed_limit" });
      break;
    }

    // Use basename only — never preserve archive directory layout on disk
    const base = name.split("/").pop() || name;
    entries.push({
      name: base,
      bytes: content,
      sizeBytes: content.length,
    });
  }

  return { entries, skipped, totalUncompressedBytes };
}

export function isZipBuffer(bytes: Buffer, name: string, mimeType: string): boolean {
  const lower = name.toLowerCase();
  if (lower.endsWith(".zip") || mimeType.includes("zip")) return true;
  // PK\x03\x04 local file header
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  );
}

/** Allowed upload extensions / MIME families for tender packages. */
export const UPLOAD_ALLOWLIST = {
  extensions: [
    ...ZIP_LIMITS.allowedExtensions,
    ".zip",
  ],
  mimePrefixes: [
    "application/pdf",
    "application/zip",
    "application/x-zip-compressed",
    "application/vnd.openxmlformats",
    "application/msword",
    "application/vnd.ms-",
    "text/",
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
    "application/octet-stream", // validated by extension when present
  ],
} as const;

export function validateUploadAllowlist(
  originalName: string,
  mimeType: string
): { ok: true } | { ok: false; reason: string } {
  const lower = originalName.toLowerCase();
  const extOk = UPLOAD_ALLOWLIST.extensions.some((e) => lower.endsWith(e));
  if (!extOk) {
    return { ok: false, reason: "extension_not_allowed" };
  }
  const mime = (mimeType || "").toLowerCase();
  if (
    mime &&
    mime !== "application/octet-stream" &&
    !UPLOAD_ALLOWLIST.mimePrefixes.some((p) => mime.startsWith(p))
  ) {
    return { ok: false, reason: "mime_not_allowed" };
  }
  return { ok: true };
}
