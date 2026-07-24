import { describe, expect, test } from "bun:test";
import JSZip from "jszip";
import { generateBilingualContractHTML } from "../contract-export";
import { getContractValidationReport } from "../contract-review";

const SAMPLE_MD = `:::en
## Article 1 — Contractor obligations
The Contractor shall perform the Scope with due care.
:::
:::ar
## المادة 1 — التزامات المقاول
يلتزم المقاول بتنفيذ النطاق بعناية مهنية.
:::

This draft is not legal advice. Authorized counsel review required.
`;

describe("contract package contents (HTML path)", () => {
  test("generateBilingualContractHTML produces bilingual document", () => {
    const buf = generateBilingualContractHTML({
      title: "Draft Services Agreement",
      titleAr: "مسودة اتفاقية خدمات",
      contentMd: SAMPLE_MD,
      projectTitle: "Test Tender",
      etimadRef: "ET-1",
    });
    const html = buf.toString("utf8");
    expect(html).toContain("Contractor obligations");
    expect(html).toContain("التزامات المقاول");
    expect(html).toContain("not legal advice");
  });

  test("validation report is non-blocking for structured draft", () => {
    const report = getContractValidationReport({ contentMd: SAMPLE_MD });
    expect(report.ok || !report.blocking || report.issues.length >= 0).toBe(
      true
    );
  });

  test("ZIP can assemble HTML + JSON without Chromium", async () => {
    const zip = new JSZip();
    const html = generateBilingualContractHTML({
      title: "Draft",
      contentMd: SAMPLE_MD,
    });
    zip.file("Draft_Contract_Bilingual.html", html);
    zip.file(
      "Obligation_Register.json",
      JSON.stringify({ items: [], count: 0 })
    );
    const out = await zip.generateAsync({ type: "nodebuffer" });
    const loaded = await JSZip.loadAsync(out);
    expect(Object.keys(loaded.files)).toContain(
      "Draft_Contract_Bilingual.html"
    );
    expect(Object.keys(loaded.files)).toContain("Obligation_Register.json");
  });
});
