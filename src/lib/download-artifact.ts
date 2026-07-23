"use client";

import { z } from "zod";

export const downloadFormatSchema = z.enum([
  "pdf",
  "html",
  "zip",
  "manifest",
  "xlsx-matrix",
  "xlsx-boq",
  "slides",
  "pptx",
]);

export type ArtifactDownloadFormat = z.infer<typeof downloadFormatSchema>;

export type ArtifactDownloadResult =
  | { ok: true; blob: Blob; filename: string; contentType: string }
  | { ok: false; status: number; error: string; code?: string };

function filenameFromDisposition(header: string | null, fallback: string) {
  if (!header) return fallback;
  const utf = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (utf?.[1]) {
    try {
      return decodeURIComponent(utf[1].trim());
    } catch {
      /* fall through */
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain?.[1]?.trim() || fallback;
}

/**
 * Authenticated download of /api/proposals/:id/download?format=…
 * Surfaces JSON validation/approval errors instead of saving them as files.
 */
export async function downloadProposalArtifact(opts: {
  proposalId: string;
  format: ArtifactDownloadFormat;
  fallbackName?: string;
}): Promise<ArtifactDownloadResult> {
  const format = downloadFormatSchema.parse(opts.format);
  const url = `/api/proposals/${encodeURIComponent(opts.proposalId)}/download?format=${format}`;

  try {
    const res = await fetch(url, {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/pdf,application/json,*/*" },
    });

    const contentType = res.headers.get("content-type") || "";
    if (!res.ok) {
      let error = `Download failed (${res.status})`;
      let code: string | undefined;
      if (contentType.includes("application/json")) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          code?: string;
          message?: string;
        };
        error = data.error || data.message || error;
        code = data.code;
      } else {
        const text = await res.text().catch(() => "");
        if (text.trim()) error = text.slice(0, 280);
      }
      return { ok: false, status: res.status, error, code };
    }

    // Guard: some gateways return 200 with JSON error bodies
    if (contentType.includes("application/json")) {
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
      };
      if (data.error) {
        return {
          ok: false,
          status: res.status,
          error: data.error,
          code: data.code,
        };
      }
    }

    const blob = await res.blob();
    const fallback =
      opts.fallbackName ||
      (format === "pdf"
        ? "document.pdf"
        : format === "html"
          ? "document.html"
          : `document.${format}`);
    const filename = filenameFromDisposition(
      res.headers.get("content-disposition"),
      fallback
    );
    return {
      ok: true,
      blob,
      filename,
      contentType: contentType || blob.type || "application/octet-stream",
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

/** Trigger a browser file save from a blob. */
export function saveBlob(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 2_000);
}
