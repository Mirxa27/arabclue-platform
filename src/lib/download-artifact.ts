"use client";

import { z } from "zod";
import { selectApiFailureMessage } from "@/lib/api-failure-message";

export const downloadFormatSchema = z.enum([
  "pdf",
  "html",
  "zip",
  "manifest",
  "xlsx-matrix",
  "xlsx-boq",
  "slides",
  "pptx",
  "docx",
]);

export type ArtifactDownloadFormat = z.infer<typeof downloadFormatSchema>;

export type ArtifactDownloadResult =
  | { ok: true; blob: Blob; filename: string; contentType: string }
  | {
      ok: false;
      status: number;
      error: string;
      code?: string;
      /** Validation-gate issue codes, when the route attached its report. */
      issues?: string[];
    };

/** Minimal artifact shape for format resolution (UI + tests). */
export type ArtifactFormatInput = {
  type: string;
  filename: string;
  downloadPath?: string | null;
};

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

function formatFromDownloadPath(
  downloadPath: string | null | undefined
): ArtifactDownloadFormat | null {
  if (!downloadPath?.includes("format=")) return null;
  const fmt = downloadPath.split("format=")[1]?.split("&")[0];
  const parsed = downloadFormatSchema.safeParse(fmt);
  return parsed.success ? parsed.data : null;
}

/**
 * Map a proposal artifact metadata row to a download format.
 * Prefer explicit `downloadPath?format=` over type heuristics so PPTX
 * artifacts are not misrouted to HTML slides.
 */
export function resolveArtifactDownloadFormat(
  a: ArtifactFormatInput
): ArtifactDownloadFormat {
  const fromPath = formatFromDownloadPath(a.downloadPath);
  if (fromPath) return fromPath;

  if (a.type === "ZIP") return "zip";
  if (a.type === "PDF") return "pdf";
  if (a.type === "PPTX") return "pptx";
  if (a.type === "DOCX") return "docx";
  if (a.filename.includes("Compliance")) return "xlsx-matrix";
  if (a.filename.includes("BoQ")) return "xlsx-boq";
  if (a.type === "HTML" || a.filename.includes("Slides")) return "slides";
  return "zip";
}

export function buildProposalDownloadUrl(opts: {
  proposalId: string;
  format: ArtifactDownloadFormat;
  locale?: "ar" | "en";
}): string {
  const format = downloadFormatSchema.parse(opts.format);
  const params = new URLSearchParams({ format });
  if (opts.locale === "ar" || opts.locale === "en") {
    params.set("locale", opts.locale);
  }
  return `/api/proposals/${encodeURIComponent(opts.proposalId)}/download?${params}`;
}

/**
 * Authenticated download of /api/proposals/:id/download?format=…
 * Surfaces JSON validation/approval errors instead of saving them as files.
 */
export async function downloadProposalArtifact(opts: {
  proposalId: string;
  format: ArtifactDownloadFormat;
  fallbackName?: string;
  locale?: "ar" | "en";
}): Promise<ArtifactDownloadResult> {
  const format = downloadFormatSchema.parse(opts.format);
  const url = buildProposalDownloadUrl({
    proposalId: opts.proposalId,
    format,
    locale: opts.locale,
  });

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
      let issues: string[] | undefined;
      if (contentType.includes("application/json")) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: unknown;
          code?: string;
          message?: unknown;
          validation?: { issues?: Array<{ code?: string }> } | null;
        };
        // Bilingual bodies first; a legacy string body still reads.
        error =
          selectApiFailureMessage(data, opts.locale ?? "ar") ??
          (typeof data.error === "string" ? data.error : null) ??
          (typeof data.message === "string" ? data.message : null) ??
          error;
        code = data.code;
        const codes = (data.validation?.issues ?? [])
          .map((i) => i?.code)
          .filter((c): c is string => typeof c === "string");
        if (codes.length) issues = [...new Set(codes)];
      } else {
        const text = await res.text().catch(() => "");
        if (text.trim()) error = text.slice(0, 280);
      }
      return { ok: false, status: res.status, error, code, issues };
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
