/**
 * Resolve workspace brand logos into data-URLs for PDF rendering.
 * Relative `/api/files?path=…` URLs cannot be fetched by headless Chromium
 * without auth cookies — inline bytes server-side instead.
 */

export type BrandWithLogo = {
  logoUrl?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  accentColor?: string | null;
  fontFamily?: string | null;
  tagline?: string | null;
  taglineAr?: string | null;
};

export type BrandLogoResult<T extends BrandWithLogo> = {
  brand: T | null;
  inlined: boolean;
  warning?: string;
};

/**
 * If brand.logoUrl is a same-origin /api/files path, read storage and return
 * a data-URL brand copy. Failures return the original brand with a warning.
 */
export async function inlineBrandLogoForPdf<T extends BrandWithLogo>(
  brand: T | null
): Promise<BrandLogoResult<T>> {
  if (!brand?.logoUrl?.startsWith("/")) {
    return { brand, inlined: false };
  }

  try {
    const { readStoredFile, fileExists } = await import("./storage");
    const pathMatch = brand.logoUrl.match(/path=([^&]+)/);
    if (!pathMatch?.[1]) {
      return {
        brand,
        inlined: false,
        warning: "Logo URL missing path query — PDF may omit logo",
      };
    }
    const storagePath = decodeURIComponent(pathMatch[1]);
    if (!(await fileExists(storagePath))) {
      return {
        brand,
        inlined: false,
        warning: `Logo file not found at ${storagePath}`,
      };
    }
    const bytes = await readStoredFile(storagePath);
    const ext = storagePath.split(".").pop()?.toLowerCase() ?? "png";
    const mime =
      ext === "jpg" || ext === "jpeg"
        ? "image/jpeg"
        : ext === "webp"
          ? "image/webp"
          : ext === "svg"
            ? "image/svg+xml"
            : "image/png";
    return {
      brand: {
        ...brand,
        logoUrl: `data:${mime};base64,${bytes.toString("base64")}`,
      },
      inlined: true,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      brand,
      inlined: false,
      warning: `Logo inline failed: ${message}`,
    };
  }
}

/** Extract storage path from /api/files?path=… for unit tests. */
export function extractLogoStoragePath(logoUrl: string): string | null {
  const pathMatch = logoUrl.match(/path=([^&]+)/);
  if (!pathMatch?.[1]) return null;
  try {
    return decodeURIComponent(pathMatch[1]);
  } catch {
    return null;
  }
}
