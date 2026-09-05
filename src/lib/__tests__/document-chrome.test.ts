import { describe, expect, test } from "bun:test";
import {
  buildPdfFooterTemplate,
  buildPdfHeaderTemplate,
  describeIntegrityHash,
  isSafeIntegrityQrPayload,
  renderIntegrityQrSvg,
} from "../pdf/document-chrome";

const HASH =
  "sha256:33edc451436342785338c69cc4f3d9090eeed3bd47c48b04d3e0bcd2bb9f13b1";

describe("integrity hash display", () => {
  test("prints a grouped lower-case prefix and the algorithm", () => {
    expect(describeIntegrityHash(HASH)).toEqual({
      prefix: "33ed c451 4363",
      algorithm: "sha256",
    });
    expect(describeIntegrityHash("ABCDEF0123456789ABCDEF")).toEqual({
      prefix: "abcd ef01 2345",
      algorithm: null,
    });
  });

  test("refuses anything that is not a hex digest", () => {
    for (const candidate of [
      "",
      "   ",
      "not-a-hash",
      "sha256:",
      "sha1:abcdef0123456789",
      "<script>alert(1)</script>",
      null,
      undefined,
    ]) {
      expect(describeIntegrityHash(candidate)).toBeNull();
    }
  });
});

describe("integrity QR code", () => {
  const payload = `arabclue:proposal:snapshot-001:${HASH}`;

  test("renders a deterministic inline SVG without ids, scripts, or rasters", () => {
    const first = renderIntegrityQrSvg(payload);
    const second = renderIntegrityQrSvg(payload);

    expect(first).toBe(second);
    expect(first.startsWith("<svg")).toBe(true);
    expect(first).toContain('role="img"');
    expect(first).toContain("<path");
    expect(first).not.toContain(" id=");
    expect(first).not.toContain("<script");
    expect(first).not.toContain("<image");
    expect(first).not.toContain("href=");
    expect(first).not.toContain(payload);
  });

  test("escapes the accessible label and honours the requested size", () => {
    const svg = renderIntegrityQrSvg(payload, {
      size: "12mm",
      ariaLabel: 'Code "x" <y>',
    });
    expect(svg).toContain('width="12mm"');
    expect(svg).toContain("aria-label=\"Code &quot;x&quot; &lt;y&gt;\"");
  });

  test("rejects payloads that are empty, non-ASCII, or oversized", () => {
    expect(isSafeIntegrityQrPayload("arabclue:proposal:a:b")).toBe(true);
    expect(isSafeIntegrityQrPayload("")).toBe(false);
    expect(isSafeIntegrityQrPayload("with space")).toBe(false);
    expect(isSafeIntegrityQrPayload("عربي")).toBe(false);
    expect(isSafeIntegrityQrPayload("x".repeat(513))).toBe(false);
    expect(() => renderIntegrityQrSvg("bad payload")).toThrow(RangeError);
  });
});

describe("running PDF chrome templates", () => {
  const running = {
    title: "Managed Cloud Services",
    titleSecondary: "خدمات السحابة المُدارة",
    tenderReference: "ETM-2026-000417",
    statusLabel: "Draft",
    statusLabelSecondary: "مسودة",
    generatedOn: "2026-09-05",
    integrityHash: HASH,
    accentColor: "#0F4C5C",
    inlineMargin: "18mm",
  };

  test("header carries both titles and the tender reference", () => {
    const header = buildPdfHeaderTemplate(running);
    expect(header).toContain("Managed Cloud Services");
    expect(header).toContain("خدمات السحابة المُدارة");
    expect(header).toContain("ETM-2026-000417");
    expect(header).toContain("#0F4C5C");
    expect(header).toContain("padding:0 18mm");
    expect(header).not.toContain("Bleed");
    expect(header).not.toContain("sRGB");
  });

  test("footer carries status, date, real page counters, and the hash prefix", () => {
    const footer = buildPdfFooterTemplate(running);
    expect(footer).toContain("Draft");
    expect(footer).toContain("مسودة");
    expect(footer).toContain("2026-09-05");
    expect(footer).toContain('class="pageNumber"');
    expect(footer).toContain('class="totalPages"');
    expect(footer).toContain("33ed c451 4363");
    expect(footer).not.toContain(HASH);
    expect(footer).not.toContain("Managed Cloud Services");
  });

  test("footer names the document when no lifecycle status is supplied", () => {
    const footer = buildPdfFooterTemplate({
      title: "Acme Co",
      integrityHash: "not a hash",
    });
    expect(footer).toContain("Acme Co");
    expect(footer).not.toContain("hash</span>");
    expect(footer).toContain("<span></span>");
  });

  test("escapes hostile text and ignores unsafe colours and margins", () => {
    const header = buildPdfHeaderTemplate({
      title: `<img src=x onerror=alert(1)> & "quotes"`,
      tenderReference: "</div><script>alert(2)</script>",
      accentColor: "red; } body { display:none",
      inlineMargin: "12mm; color: red",
    });
    expect(header).not.toContain("<img");
    expect(header).not.toContain("<script");
    expect(header).toContain("&lt;img");
    expect(header).toContain("&amp;");
    expect(header).toContain("#173F5F");
    expect(header).not.toContain("display:none");
    expect(header).toContain("padding:0 18mm");
  });

  test("truncates runaway titles so the running header stays one line", () => {
    const header = buildPdfHeaderTemplate({ title: "T".repeat(300) });
    expect(header).toContain("…");
    expect(header).not.toContain("T".repeat(120));
  });
});
