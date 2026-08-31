import { describe, expect, test } from "bun:test";
import {
  compileProposalLayoutDocument,
  exportProposalLayout,
  generateProposalLayoutPdf,
  renderProposalLayoutHTML,
  type ProposalSnapshot,
} from "@/lib/proposal-layout-export";
import type {
  ProposalModuleSnapshot,
} from "@/lib/proposal-layouts";

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
    snapshotId: "proposal-snapshot:chrome-001",
    version: 3,
    intent: "ADDENDUM",
    languageMode: "BILINGUAL",
    projectTitle: {
      en: "Cloud migration tender",
      ar: "مناقصة ترحيل السحابة",
    },
    bidderName: { en: "Riyadh Systems", ar: "أنظمة الرياض" },
    tenderReference: "ETM-2026-42",
    brand: {
      primaryColor: "#123456",
      secondaryColor: "#0A0A0A",
      accentColor: "#654321",
    },
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
            en: "Response summary for the cloud migration addendum.",
            ar: "ملخص الاستجابة لملحق ترحيل السحابة.",
          },
          sourceRequired: true,
          sourceRefs: ["SRC-TENDER"],
        },
        {
          type: "KPI",
          key: "cover.kpi-uptime",
          title: { en: "Uptime", ar: "الجاهزية" },
          label: { en: "Measured uptime", ar: "الجاهزية المقاسة" },
          value: "99.98%",
          asOf: null,
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
            ],
            sourceRequired: true,
            sourceRefs: ["SRC-TENDER"],
          },
        ]
      ),
    ],
  };
}

describe("proposal document chrome", () => {
  test("draft compilation derives branded cover, TOC, numbering, palette", () => {
    const compilation = compileProposalLayoutDocument(snapshotFixture());
    if (compilation.status !== "READY") throw new Error("expected READY");
    expect(compilation.metadata.lifecycle).toBe("DRAFT");
    expect(compilation.chrome.cover.tenderReference).toBe("ETM-2026-42");
    expect(compilation.chrome.tableOfContents).toBe(true);
    expect(compilation.chrome.sectionNumbering).toBe(true);
    expect(compilation.chrome.palette.primaryColor).toBe("#123456");

    const html = renderProposalLayoutHTML(compilation);
    expect(html).toContain("DRAFT — Cloud migration tender");
    expect(html).toContain("مسودة — مناقصة ترحيل السحابة");
    expect(html).toContain("data-bilingual-cover");
    expect(html).toContain("data-bilingual-toc");
    expect(html).toContain("--bilingual-primary: #123456;");
    expect(html).toContain("Print-ready draft");
  });

  test("FINAL compilation drops the draft marker from titles", () => {
    const compilation = compileProposalLayoutDocument(snapshotFixture(), {
      lifecycle: "FINAL",
    });
    if (compilation.status !== "READY") throw new Error("expected READY");
    expect(compilation.metadata.lifecycle).toBe("FINAL");
    const html = renderProposalLayoutHTML(compilation);
    expect(html).toContain(">Cloud migration tender<");
    expect(html).not.toContain("DRAFT — Cloud migration tender");
    expect(html).toContain("Authoritative export");
    expect(html).not.toContain("Print-ready draft");
  });

  test("caller can disable derived TOC without losing the rest", () => {
    const compilation = compileProposalLayoutDocument(snapshotFixture());
    if (compilation.status !== "READY") throw new Error("expected READY");
    const html = renderProposalLayoutHTML(compilation, {
      tableOfContents: false,
    });
    expect(html).not.toMatch(/<div data-bilingual-toc>/);
    expect(html).toContain("data-bilingual-cover");
  });

  test("KPI blocks render as stat cards, not plain paragraphs", () => {
    const compilation = compileProposalLayoutDocument(snapshotFixture());
    const html = renderProposalLayoutHTML(compilation);
    expect(html).toContain("bilingual-kpi-card");
    expect(html).toContain("99.98%");
    expect(html).toContain("Measured uptime");
    expect(html).toContain("الجاهزية المقاسة");
  });

  test(
    "PDF generation applies the same chrome end to end",
    { timeout: 120_000 },
    async () => {
      const compilation = compileProposalLayoutDocument(snapshotFixture(), {
        channel: "PDF",
      });
      if (compilation.status !== "READY") throw new Error("expected READY");
      const artifact = await generateProposalLayoutPdf(compilation);
      expect(artifact.pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
      expect(artifact.html).toContain("data-bilingual-cover");
      expect(artifact.html).toContain("--bilingual-primary: #123456;");
    }
  );

  test("export dispatcher threads lifecycle into artifact metadata", async () => {
    const draft = await exportProposalLayout(snapshotFixture(), {
      channel: "HTML",
    });
    expect(draft.metadata.lifecycle).toBe("DRAFT");
    const final = await exportProposalLayout(snapshotFixture(), {
      channel: "HTML",
      lifecycle: "FINAL",
    });
    expect(final.metadata.lifecycle).toBe("FINAL");
    expect(final.html).toContain("Authoritative export");
  });
});
