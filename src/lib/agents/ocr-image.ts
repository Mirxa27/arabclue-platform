/**
 * Image OCR via Tesseract.js (eng + ara) for Mission Control / document ingest.
 * Real offline OCR — no stubs. Optional sharp preprocess for better accuracy.
 */

import { sanitizeText } from "./ingestion";

const IMAGE_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "image/bmp",
  "image/tiff",
]);

export function isImageMime(mimeType: string, originalName: string): boolean {
  const lower = originalName.toLowerCase();
  if (IMAGE_MIME.has(mimeType.toLowerCase())) return true;
  return /\.(png|jpe?g|webp|gif|bmp|tiff?)$/i.test(lower);
}

async function preprocessForOcr(bytes: Buffer): Promise<Buffer> {
  try {
    const sharp = (await import("sharp")).default;
    return await sharp(bytes)
      .rotate()
      .grayscale()
      .normalize()
      .sharpen()
      .png()
      .toBuffer();
  } catch {
    return bytes;
  }
}

/**
 * Extract text from an image buffer using Tesseract eng+ara.
 * Returns empty string when OCR finds nothing usable.
 */
export async function extractTextFromImage(
  bytes: Buffer,
  mimeType: string,
  originalName: string
): Promise<string> {
  if (!isImageMime(mimeType, originalName)) return "";
  if (bytes.length < 32) return "";
  if (bytes.length > 25 * 1024 * 1024) {
    throw new Error("Image too large for OCR (max 25MB)");
  }

  const { createWorker } = await import("tesseract.js");
  const prepared = await preprocessForOcr(bytes);
  const worker = await createWorker(["eng", "ara"], 1, {
    logger: () => undefined,
  });
  try {
    const result = await worker.recognize(prepared);
    const text = sanitizeText(result.data.text || "");
    return text.trim();
  } finally {
    await worker.terminate().catch(() => undefined);
  }
}
