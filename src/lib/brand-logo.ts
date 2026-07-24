/**
 * Brand values cross two security boundaries:
 *
 * 1. persisted workspace data is interpolated into document HTML/CSS; and
 * 2. a persisted logo path is read by the server before Chromium renders a PDF.
 *
 * Keep the allow-lists and the render-time fallbacks here so API validation and
 * every document renderer share the same policy. Render-time normalization is
 * intentional defence in depth for rows created before the API schema existed.
 */

import path from "node:path";
import { assertWorkspaceStoragePath } from "./storage";
import {
  extractWorkspaceLogoStoragePath,
  normalizeBrandForDocument,
  type BrandWithLogo,
} from "./brand-policy";
export {
  DEFAULT_DOCUMENT_BRAND_COLORS,
  DEFAULT_DOCUMENT_BRAND_FONT,
  DOCUMENT_BRAND_FONT_FAMILIES,
  normalizeBrandForDocument,
  normalizeDocumentBrandColor,
  normalizeDocumentBrandFont,
  safeBrandLogoUrlForDocument,
} from "./brand-policy";
export type {
  BrandWithLogo,
  DocumentBrandFontFamily,
} from "./brand-policy";

const MAX_LOGO_BYTES = 8 * 1024 * 1024;
const MAX_LOGO_PIXELS = 25_000_000;
const MAX_LOGO_DIMENSION = 10_000;

export type BrandLogoResult<T extends BrandWithLogo> = {
  brand: T | null;
  inlined: boolean;
  warning?: string;
};

export type ValidatedLogoImage = {
  readonly bytes: Buffer;
  readonly mimeType: "image/png" | "image/jpeg" | "image/webp";
  readonly width: number;
  readonly height: number;
};

/**
 * Extract a logo storage path only when the URL and path are scoped to the
 * supplied workspace. Remote, protocol-relative, data, absolute filesystem,
 * traversal, duplicate-query, and cross-workspace inputs return null.
 */
export function extractLogoStoragePath(
  logoUrl: string,
  workspaceId: string
): string | null {
  const candidate = extractWorkspaceLogoStoragePath(logoUrl, workspaceId);
  if (!candidate) return null;

  try {
    return assertWorkspaceStoragePath(candidate, workspaceId);
  } catch {
    return null;
  }
}

function detectLogoMime(bytes: Buffer): ValidatedLogoImage["mimeType"] | null {
  if (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    )
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

function mimeForExtension(
  storagePath: string
): ValidatedLogoImage["mimeType"] | null {
  switch (path.posix.extname(storagePath).toLowerCase()) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    default:
      return null;
  }
}

/**
 * Validate declared extension, magic bytes, decoded format and dimensions.
 * Re-encoding strips metadata and proves the complete image can be decoded.
 */
export async function validateAndNormalizeLogoImage(
  bytes: Buffer,
  storagePath: string
): Promise<ValidatedLogoImage> {
  if (bytes.length === 0 || bytes.length > MAX_LOGO_BYTES) {
    throw new Error("Logo must be between 1 byte and 8 MiB");
  }

  const extensionMime = mimeForExtension(storagePath);
  const magicMime = detectLogoMime(bytes);
  if (!extensionMime || !magicMime || extensionMime !== magicMime) {
    throw new Error("Logo type does not match an allowed PNG, JPEG, or WebP image");
  }

  const sharp = (await import("sharp")).default;
  const image = sharp(bytes, {
    failOn: "warning",
    limitInputPixels: MAX_LOGO_PIXELS,
  });
  const metadata = await image.metadata();
  const expectedFormat =
    magicMime === "image/jpeg"
      ? "jpeg"
      : magicMime === "image/png"
        ? "png"
        : "webp";
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  const pages = metadata.pages ?? 1;

  if (
    metadata.format !== expectedFormat ||
    pages !== 1 ||
    width < 1 ||
    height < 1 ||
    width > MAX_LOGO_DIMENSION ||
    height > MAX_LOGO_DIMENSION ||
    width * height > MAX_LOGO_PIXELS
  ) {
    throw new Error("Logo dimensions or decoded format are invalid");
  }

  const pipeline = image
    .rotate()
    .resize({
      width: 4096,
      height: 4096,
      fit: "inside",
      withoutEnlargement: true,
    });
  const normalized =
    magicMime === "image/png"
      ? await pipeline.png({ compressionLevel: 9 }).toBuffer()
      : magicMime === "image/jpeg"
        ? await pipeline.jpeg({ quality: 90 }).toBuffer()
        : await pipeline.webp({ quality: 90 }).toBuffer();

  if (normalized.length === 0 || normalized.length > MAX_LOGO_BYTES) {
    throw new Error("Normalized logo exceeds the 8 MiB limit");
  }

  return { bytes: normalized, mimeType: magicMime, width, height };
}

/**
 * Resolve and inline a workspace-local logo for PDF rendering.
 *
 * Unsafe or invalid values fail closed by removing the logo from the returned
 * brand copy. The original input object is never mutated.
 */
export async function inlineBrandLogoForPdf<T extends BrandWithLogo>(
  brand: T | null,
  workspaceId: string
): Promise<BrandLogoResult<T>> {
  const normalizedBrand = normalizeBrandForDocument(brand);
  if (!normalizedBrand?.logoUrl) {
    return { brand: normalizedBrand, inlined: false };
  }

  const storagePath = extractLogoStoragePath(
    normalizedBrand.logoUrl,
    workspaceId
  );
  if (!storagePath) {
    return {
      brand: { ...normalizedBrand, logoUrl: null },
      inlined: false,
      warning: "Logo rejected: expected a workspace-local uploaded image",
    };
  }

  try {
    const { readWorkspaceStoredFile } = await import("./storage");
    const bytes = await readWorkspaceStoredFile(storagePath, workspaceId);
    const validated = await validateAndNormalizeLogoImage(bytes, storagePath);
    return {
      brand: {
        ...normalizedBrand,
        logoUrl: `data:${validated.mimeType};base64,${validated.bytes.toString(
          "base64"
        )}`,
      },
      inlined: true,
    };
  } catch {
    // Do not expose filesystem, Blob, decoder, or tenant details to logs/callers.
    return {
      brand: { ...normalizedBrand, logoUrl: null },
      inlined: false,
      warning: "Logo rejected: file is missing or not a valid image",
    };
  }
}
