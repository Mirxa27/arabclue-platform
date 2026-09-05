/**
 * Shared document chrome helpers for generated HTML and PDF artifacts.
 *
 * - Integrity display: a short, honest hash prefix and an offline QR code that
 *   encodes an `arabclue:` payload supplied by the caller. Nothing here invents
 *   URLs, hashes, or verification services; it only renders what it is given.
 * - Chromium header/footer templates: running project title, tender reference,
 *   lifecycle status, generation date, page X of Y, and the integrity prefix.
 *
 * This module is dependency-light on purpose so both the layout engine and the
 * PDF adapter can import it without creating a cycle.
 */

import QRCode from "qrcode";

const HEX_HASH_PATTERN = /^(?:sha256:)?([0-9a-fA-F]{16,128})$/u;
const SAFE_QR_PAYLOAD_PATTERN = /^[\x21-\x7E]{1,512}$/u;
const INTEGRITY_PREFIX_LENGTH = 12;

export interface IntegrityDisplay {
  /** Lower-case hex prefix shown to readers, grouped for legibility. */
  readonly prefix: string;
  /** Algorithm label when the hash carried one (e.g. `sha256`). */
  readonly algorithm: string | null;
}

/**
 * Reduce a full content hash to the prefix printed on covers and footers.
 * Returns null for anything that is not a plausible hex digest so callers
 * never print garbage as an integrity claim.
 */
export function describeIntegrityHash(
  hash: string | null | undefined,
): IntegrityDisplay | null {
  const trimmed = hash?.trim();
  if (!trimmed) return null;
  const match = HEX_HASH_PATTERN.exec(trimmed);
  if (!match) return null;
  const hex = (match[1] ?? "").toLowerCase();
  const prefix = hex.slice(0, INTEGRITY_PREFIX_LENGTH);
  return {
    prefix: `${prefix.slice(0, 4)} ${prefix.slice(4, 8)} ${prefix.slice(8, 12)}`.trim(),
    algorithm: trimmed.toLowerCase().startsWith("sha256:") ? "sha256" : null,
  };
}

/** Payloads must be short, printable ASCII so the QR stays scannable offline. */
export function isSafeIntegrityQrPayload(payload: string): boolean {
  return SAFE_QR_PAYLOAD_PATTERN.test(payload);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export interface IntegrityQrOptions {
  /** Rendered size; any CSS length. Defaults to 16mm. */
  readonly size?: string;
  /** Accessible label; the payload is never exposed as visible text here. */
  readonly ariaLabel?: string;
  /** Module colour; defaults to near-black ink so it prints crisply. */
  readonly ink?: string;
}

/**
 * Render an inline SVG QR code synchronously. The SVG has no ids, scripts,
 * external references, or raster data, so it is safe inside the escaped HTML
 * document and inside Chromium's PDF pipeline.
 */
export function renderIntegrityQrSvg(
  payload: string,
  options: IntegrityQrOptions = {},
): string {
  if (!isSafeIntegrityQrPayload(payload)) {
    throw new RangeError(
      "Integrity QR payloads must be 1-512 printable ASCII characters.",
    );
  }
  const symbol = QRCode.create(payload, { errorCorrectionLevel: "M" });
  const size = symbol.modules.size;
  const quietZone = 2;
  const viewBox = size + quietZone * 2;
  const segments: string[] = [];
  for (let row = 0; row < size; row += 1) {
    let runStart = -1;
    for (let column = 0; column <= size; column += 1) {
      const dark = column < size && symbol.modules.get(row, column) === 1;
      if (dark && runStart < 0) runStart = column;
      if (!dark && runStart >= 0) {
        segments.push(
          `M${String(runStart + quietZone)} ${String(
            row + quietZone,
          )}h${String(column - runStart)}v1h-${String(column - runStart)}z`,
        );
        runStart = -1;
      }
    }
  }
  const cssSize = options.size ?? "16mm";
  const label = options.ariaLabel ?? "Integrity QR code";
  const ink = options.ink ?? "#0F172A";
  return `<svg class="bilingual-integrity__qr" role="img" aria-label="${escapeXml(
    label,
  )}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(
    viewBox,
  )} ${String(viewBox)}" width="${escapeXml(cssSize)}" height="${escapeXml(
    cssSize,
  )}" shape-rendering="crispEdges"><rect width="${String(viewBox)}" height="${String(
    viewBox,
  )}" fill="#FFFFFF"/><path fill="${escapeXml(ink)}" d="${segments.join("")}"/></svg>`;
}

// ---------------------------------------------------------------------------
// Chromium running header / footer templates
// ---------------------------------------------------------------------------

export interface PdfRunningChromeOptions {
  /** Running title, usually the English project title. */
  readonly title: string;
  /** Secondary running title, usually the Arabic project title. */
  readonly titleSecondary?: string | null;
  readonly tenderReference?: string | null;
  /** Human-readable status label, e.g. "DRAFT" or "AUTHORITATIVE". */
  readonly statusLabel?: string | null;
  /** Arabic status label rendered next to the Latin one. */
  readonly statusLabelSecondary?: string | null;
  /** ISO date (YYYY-MM-DD) or already formatted label. */
  readonly generatedOn?: string | null;
  /** Full or prefixed content hash; only a verified prefix is printed. */
  readonly integrityHash?: string | null;
  /** Brand primary colour (validated hex) used for the status accent. */
  readonly accentColor?: string | null;
  /**
   * Horizontal page margin the template should align with (any CSS length
   * accepted by Chromium). Defaults to the premium 18mm inline margin.
   */
  readonly inlineMargin?: string | null;
}

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/u;
const TEMPLATE_FONT_STACK =
  "'IBM Plex Sans','Noto Sans','Segoe UI',Arial,sans-serif";
const TEMPLATE_ARABIC_FONT_STACK =
  "'IBM Plex Sans Arabic','Noto Sans Arabic','Segoe UI',Tahoma,Arial,sans-serif";

function escapeHtml(value: string): string {
  return escapeXml(value);
}

function truncate(value: string, maximum: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maximum) return trimmed;
  return `${trimmed.slice(0, Math.max(0, maximum - 1)).trimEnd()}…`;
}

function safeAccent(color: string | null | undefined): string {
  return color && HEX_COLOR.test(color.trim()) ? color.trim() : "#173F5F";
}

const CSS_LENGTH = /^(?:\d+(?:\.\d+)?|\.\d+)(?:px|in|cm|mm|pt)$/u;

function safeInlineMargin(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed && CSS_LENGTH.test(trimmed) ? trimmed : "18mm";
}

/**
 * Running header: project title (both scripts when supplied) on the start
 * side, tender reference on the end side, closed by a hairline. Chromium
 * renders templates in an isolated document, so styles are inline and sized
 * in pt for print stability.
 */
export function buildPdfHeaderTemplate(
  options: PdfRunningChromeOptions,
): string {
  const accent = safeAccent(options.accentColor);
  const inlineMargin = safeInlineMargin(options.inlineMargin);
  const title = escapeHtml(truncate(options.title, 96));
  const secondary = options.titleSecondary?.trim()
    ? `<span dir="rtl" lang="ar" style="font-family:${TEMPLATE_ARABIC_FONT_STACK};color:#334155;">${escapeHtml(
        truncate(options.titleSecondary, 72),
      )}</span>`
    : "";
  const reference = options.tenderReference?.trim()
    ? `<span style="font-variant-numeric:tabular-nums;letter-spacing:0.04em;color:#334155;">${escapeHtml(
        truncate(options.tenderReference, 48),
      )}</span>`
    : "";
  return `<div style="box-sizing:border-box;width:100%;padding:0 ${inlineMargin} 1.2mm;font-family:${TEMPLATE_FONT_STACK};font-size:7pt;line-height:1.35;color:#475569;"><div style="border-bottom:0.3pt solid #CBD5E1;padding-bottom:1.2mm;font-family:${TEMPLATE_FONT_STACK};font-size:7pt;line-height:1.35;color:#475569;display:flex;justify-content:space-between;align-items:flex-end;gap:6mm;">
  <span style="display:flex;flex-direction:column;gap:0.4mm;min-width:0;">
    <span style="font-weight:600;color:${accent};letter-spacing:0.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${title}</span>
    ${secondary}
  </span>
  ${reference}
</div></div>`;
}

/**
 * Running footer: lifecycle status + generation date (start), page X of Y
 * (centre), integrity prefix (end). Page counters use Chromium's template
 * classes so the numbers are real, never guessed.
 */
export function buildPdfFooterTemplate(
  options: PdfRunningChromeOptions,
): string {
  const accent = safeAccent(options.accentColor);
  const inlineMargin = safeInlineMargin(options.inlineMargin);
  const integrity = describeIntegrityHash(options.integrityHash);
  const status = options.statusLabel?.trim()
    ? `<span style="display:inline-block;padding:0.3mm 1.6mm;border:0.4pt solid ${accent};border-radius:1px;color:${accent};font-size:6pt;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;">${escapeHtml(
        truncate(options.statusLabel, 32),
      )}</span>`
    : "";
  const statusSecondary = options.statusLabelSecondary?.trim()
    ? `<span dir="rtl" lang="ar" style="font-family:${TEMPLATE_ARABIC_FONT_STACK};color:#475569;">${escapeHtml(
        truncate(options.statusLabelSecondary, 32),
      )}</span>`
    : "";
  // Without a lifecycle status the footer carries the document identity
  // (letterhead company) so every page still names its author.
  const identity = options.statusLabel?.trim()
    ? ""
    : `<span style="font-weight:600;color:#334155;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(
        truncate(options.title, 64),
      )}</span>`;
  const generated = options.generatedOn?.trim()
    ? `<span style="font-variant-numeric:tabular-nums;color:#64748B;">${escapeHtml(
        truncate(options.generatedOn, 32),
      )}</span>`
    : "";
  const integrityCell = integrity
    ? `<span style="display:flex;align-items:center;gap:1.5mm;font-variant-numeric:tabular-nums;color:#64748B;"><span style="letter-spacing:0.08em;text-transform:uppercase;font-size:6pt;">${
        integrity.algorithm ?? "hash"
      }</span><span style="font-family:'IBM Plex Mono','SFMono-Regular',Menlo,Consolas,monospace;color:#334155;">${escapeHtml(
        integrity.prefix,
      )}</span></span>`
    : `<span></span>`;
  return `<div style="box-sizing:border-box;width:100%;padding:0 ${inlineMargin};font-family:${TEMPLATE_FONT_STACK};font-size:7pt;line-height:1.35;color:#475569;"><div style="border-top:0.3pt solid #CBD5E1;padding-top:1.2mm;display:flex;justify-content:space-between;align-items:center;gap:6mm;">
  <span style="display:flex;align-items:center;gap:2.2mm;min-width:0;">
    ${status}
    ${statusSecondary}
    ${identity}
    ${generated}
  </span>
  <span style="display:flex;align-items:baseline;gap:1.2mm;font-variant-numeric:tabular-nums;color:#334155;">
    <span>Page</span><span class="pageNumber" style="font-weight:600;"></span><span>of</span><span class="totalPages" style="font-weight:600;"></span>
    <span dir="rtl" lang="ar" style="font-family:${TEMPLATE_ARABIC_FONT_STACK};color:#64748B;margin-inline-start:1.5mm;">صفحة</span>
  </span>
  ${integrityCell}
</div></div>`;
}
