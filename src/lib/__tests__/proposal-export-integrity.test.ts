import { describe, expect, test } from "bun:test";
import {
  compileProposalLayoutDocument,
  generateProposalLayoutPdf,
  renderProposalLayoutHTML,
  type ProposalSnapshot,
} from "@/lib/proposal-layout-export";
import type { ProposalModuleSnapshot } from "@/lib/proposal-layouts";
import { inspectBilingualHtml } from "@/lib/bilingual-pdf";

function moduleSnapshot(
  key: ProposalModuleSnapshot["key"],
  title: { en: string; ar: string },
  blocks: ProposalModuleSnapshot["blocks"]
): ProposalModuleSnapshot {
  return {
    key,
    title,
    requiredBlockKeys: blocks.map((block) => block.key),
    blocks,
  };
}

function snapshotFixture(): ProposalSnapshot {
  return {
    schemaVersion: 1,
    snapshotId: "proposal-snapshot:integrity-001",
    version: 2,
    intent: "ADDENDUM",
    languageMode: "BILINGUAL",
    projectTitle: {
      en: "Cloud migration tender",
      ar: "مناقصة ترحيل السحابة",
    },
    bidderName: { en: "Riyadh Systems", ar: "أنظمة الرياض" },
    tenderReference: "ETM-2026-42",
    brand: { primaryColor: "#0F4C5C" },
    sources: [
      {
        id: "SRC-TENDER",
        kind: "TENDER",
        title: { en: "Tender record", ar: "سجل المناقصة" },
      },
    ],
    modules: [
      moduleSnapshot("cover", { en: "Cover", ar: "الغلاف" }, [
        {
          type: "NARRATIVE",
          key: "cover.statement",
          title: { en: "Submission", ar: "التقديم" },
          body: {
            en: "Response summary for the addendum.",
            ar: "ملخص الاستجابة للملحق.",
          },
          sourceRequired: true,
          sourceRefs: ["SRC-TENDER"],
        },
      ]),
      moduleSnapshot(
        "document-control",
        { en: "Document control", ar: "ضبط الوثيقة" },
        [
          {
            type: "TABLE",
            key: "control.revisions",
            title: { en: "Revision register", ar: "سجل المراجعات" },
            columns: [
              { key: "revision", label: { en: "Revision", ar: "المراجعة" } },
              { key: "status", label: { en: "Status", ar: "الحالة" } },
            ],
            rows: [
              {
                key: "rev-1",
                cells: {
                  revision: { en: "1", ar: "1" },
                  status: { en: "Reviewed", ar: "تمت المراجعة" },
                },
              },
            ],
            sourceRequired: true,
            sourceRefs: ["SRC-TENDER"],
          },
        ]
      ),
      moduleSnapshot(
        "commercial-boq-handoff",
        { en: "Commercial handoff", ar: "التسليم التجاري" },
        [
          {
            type: "COMMERCIAL_HANDOFF",
            key: "commercial.boq",
            title: { en: "Bill of quantities", ar: "جدول الكميات" },
            instruction: {
              en: "Amounts pending the pricing committee.",
              ar: "المبالغ بانتظار لجنة التسعير.",
            },
            pricingStatus: "USER_ENTRY_REQUIRED",
            entries: [],
            sourceRequired: false,
            sourceRefs: [],
          },
        ]
      ),
      moduleSnapshot(
        "assumptions-dependencies-deviations",
        { en: "Assumptions", ar: "الافتراضات" },
        [
          {
            type: "BULLET_LIST",
            key: "assumptions.items",
            title: { en: "Assumptions", ar: "الافتراضات" },
            items: [
              {
                en: "The authority supplies approved access.",
                ar: "توفر الجهة صلاحيات الوصول المعتمدة.",
              },
            ],
            sourceRequired: true,
            sourceRefs: ["SRC-TENDER"],
          },
        ]
      ),
      moduleSnapshot(
        "appendices-evidence-validation",
        { en: "Evidence appendix", ar: "ملحق الأدلة" },
        [
          {
            type: "EVIDENCE_REGISTER",
            key: "evidence.register",
            title: { en: "Evidence register", ar: "سجل الأدلة" },
            entries: [
              {
                key: "authorization",
                label: { en: "Signed authorization", ar: "التفويض الموقع" },
                status: "VERIFIED",
                sourceRefs: ["SRC-TENDER"],
              },
              {
                key: "iso",
                label: { en: "ISO 27001", ar: "آيزو 27001" },
                status: "PENDING",
                sourceRefs: ["SRC-TENDER"],
              },
            ],
            sourceRequired: true,
            sourceRefs: ["SRC-TENDER"],
          },
        ]
      ),
    ],
  };
}

describe("proposal export integrity and approval chrome", () => {
  test("chrome exposes the real snapshot hash as integrity with an offline payload", () => {
    const compilation = compileProposalLayoutDocument(snapshotFixture());
    if (compilation.status !== "READY") throw new Error("expected READY");
    const { chrome, metadata } = compilation;

    expect(chrome.integrity.hash).toBe(metadata.snapshotHash);
    expect(chrome.integrity.qrPayload).toBe(
      `arabclue:proposal:${metadata.snapshotId}:${metadata.snapshotHash}`
    );
    expect(chrome.integrity.qrPayload).not.toMatch(/https?:/u);
    expect(chrome.signatureBlock).toBe(true);
    expect(chrome.running.title.en).toBe("Cloud migration tender");
    expect(chrome.running.tenderReference).toBe("ETM-2026-42");
    expect(chrome.running.generatedOn).toBe(chrome.cover.dateLabel?.en);
  });

  test("rendered HTML carries cover, QR, hash prefix, chips, notice, and signature block", () => {
    const compilation = compileProposalLayoutDocument(snapshotFixture());
    if (compilation.status !== "READY") throw new Error("expected READY");
    const html = renderProposalLayoutHTML(compilation);
    const prefix = compilation.metadata.snapshotHash
      .replace(/^sha256:/u, "")
      .slice(0, 12);
    const grouped = `${prefix.slice(0, 4)} ${prefix.slice(4, 8)} ${prefix.slice(8, 12)}`;

    expect(html).toContain("data-bilingual-cover");
    expect(html).toContain('<svg class="bilingual-integrity__qr"');
    expect(html).toContain(grouped);
    expect(html).toContain("Snapshot hash");
    expect(html).toContain("بصمة اللقطة");
    expect(html).toContain("data-bilingual-signature");
    // Evidence status cells are whole-cell emphasis, i.e. status chips.
    expect(html).toContain("<td");
    expect(html).toMatch(/<td[^>]*><strong>Verified<\/strong><\/td>/u);
    expect(html).toMatch(/<td[^>]*><strong>موثق<\/strong><\/td>/u);
    // Pending user entry is a whole-paragraph notice.
    expect(html).toMatch(
      /<p[^>]*><strong>Pricing status: User entry required<\/strong><\/p>/u
    );
    // Hashes stay complete in the control ledger (technical terms, not chips).
    expect(html).toContain(compilation.metadata.snapshotHash);
    expect(html).toContain(compilation.metadata.planHash);
    expect(html).toMatch(
      /bilingual-value--technical-term[^>]*>sha256:/u
    );
    expect(inspectBilingualHtml(html).valid).toBe(true);
  });

  test("callers can switch the approval block and integrity off", () => {
    const compilation = compileProposalLayoutDocument(snapshotFixture());
    if (compilation.status !== "READY") throw new Error("expected READY");
    const html = renderProposalLayoutHTML(compilation, {
      signatureBlock: false,
      integrity: { hash: "" },
    });
    expect(html).not.toContain("data-bilingual-signature");
    expect(html).not.toContain('<svg class="bilingual-integrity__qr"');
    expect(html).not.toContain('<bdi class="bilingual-integrity__prefix"');
    expect(html).toContain("data-bilingual-cover");
  });

  test.skipIf(process.env.PLAYWRIGHT_CHROMIUM !== "1")(
    "PDF artifact keeps the cover sheet first and stays within the paginator",
    async () => {
      const compilation = compileProposalLayoutDocument(snapshotFixture(), {
        channel: "PDF",
      });
      if (compilation.status !== "READY") throw new Error("expected READY");
      const artifact = await generateProposalLayoutPdf(compilation);
      expect(artifact.pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
      expect(artifact.html.indexOf("data-bilingual-cover")).toBeLessThan(
        artifact.html.indexOf('data-fragment-id="document-title"')
      );
      expect(artifact.html).toContain('<svg class="bilingual-integrity__qr"');
    },
    120_000
  );
});
