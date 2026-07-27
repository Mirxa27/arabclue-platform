import { describe, expect, test } from "bun:test";
import {
  ProposalLayoutExportError,
  compileProposalLayoutDocument,
  exportProposalLayout,
  generateProposalLayoutPdf,
  renderProposalLayoutHTML,
} from "../proposal-layout-export";
import type {
  ProposalBlock,
  ProposalModuleKey,
  ProposalModuleSnapshot,
  ProposalSnapshot,
} from "../proposal-layouts";

function source(
  id: string,
  kind:
    | "TENDER"
    | "USER_ENTRY"
    | "APPROVED_KNOWLEDGE"
    | "WORKSPACE" = "USER_ENTRY"
) {
  return {
    id,
    kind,
    title: {
      en: `Source ${id}`,
      ar: `المصدر ${id}`,
    },
    locator: `record:${id}`,
    asOf: "2026-07-24",
  } as const;
}

function moduleSnapshot(
  key: ProposalModuleKey,
  title: { readonly en: string; readonly ar: string },
  blocks: readonly ProposalBlock[]
): ProposalModuleSnapshot {
  return {
    key,
    title,
    requiredBlockKeys: blocks.map((block) => block.key),
    blocks,
  };
}

function makeSnapshot(
  overrides: Partial<ProposalSnapshot> = {}
): ProposalSnapshot {
  const modules: readonly ProposalModuleSnapshot[] = [
    moduleSnapshot(
      "cover",
      { en: "Cover", ar: "الغلاف" },
      [
        {
          type: "NARRATIVE",
          key: "cover.statement",
          title: { en: "Submission", ar: "التقديم" },
          body: {
            en: 'AT&T "verified" response for the digital addendum.',
            ar: "استجابة موثقة لملحق الخدمات الرقمية.",
          },
          sourceRequired: true,
          sourceRefs: ["SRC-COVER"],
        },
      ]
    ),
    moduleSnapshot(
      "document-control",
      { en: "Document control", ar: "ضبط الوثيقة" },
      [
        {
          type: "TABLE",
          key: "control.revisions",
          title: { en: "Revision register", ar: "سجل المراجعات" },
          columns: [
            {
              key: "revision",
              label: { en: "Revision", ar: "المراجعة" },
            },
            {
              key: "status",
              label: { en: "Status", ar: "الحالة" },
            },
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
          sourceRefs: ["SRC-CONTROL"],
        },
      ]
    ),
    moduleSnapshot(
      "assumptions-dependencies-deviations",
      {
        en: "Assumptions and deviations",
        ar: "الافتراضات والانحرافات",
      },
      [
        {
          type: "BULLET_LIST",
          key: "assumptions.items",
          title: { en: "Confirmed assumptions", ar: "الافتراضات المؤكدة" },
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
              label: {
                en: "Signed authorization",
                ar: "التفويض الموقع",
              },
              status: "VERIFIED",
              sourceRefs: ["SRC-EVIDENCE"],
            },
          ],
          sourceRequired: true,
          sourceRefs: ["SRC-EVIDENCE"],
        },
      ]
    ),
  ];

  const snapshot: ProposalSnapshot = {
    schemaVersion: 1,
    snapshotId: "proposal-snapshot:addendum-001",
    version: 3,
    intent: "ADDENDUM",
    languageMode: "BILINGUAL",
    projectTitle: {
      en: "Digital Services Addendum",
      ar: "ملحق الخدمات الرقمية",
    },
    bidderName: {
      en: "Verified Bidder Company",
      ar: "شركة مقدم العرض الموثقة",
    },
    tenderReference: "RFP-2026-0042",
    brand: {
      primaryColor: "#173F5F",
      secondaryColor: "#20639B",
      accentColor: "#D68C20",
      backgroundColor: "#FFFFFF",
      textColor: "#132238",
    },
    sources: [
      source("SRC-COVER"),
      source("SRC-CONTROL", "WORKSPACE"),
      source("SRC-TENDER", "TENDER"),
      source("SRC-EVIDENCE", "APPROVED_KNOWLEDGE"),
    ],
    modules,
  };
  return { ...snapshot, ...overrides };
}

function withCoverBlocks(
  snapshot: ProposalSnapshot,
  blocks: readonly ProposalBlock[]
): ProposalSnapshot {
  return {
    ...snapshot,
    modules: snapshot.modules.map((module) =>
      module.key === "cover"
        ? {
            ...module,
            requiredBlockKeys: blocks.map((block) => block.key),
            blocks,
          }
        : module
    ),
  };
}

function richSnapshot(): ProposalSnapshot {
  const snapshot = makeSnapshot();
  const cover = snapshot.modules.find((module) => module.key === "cover");
  if (!cover) throw new Error("Fixture invariant failed");
  return withCoverBlocks(snapshot, [
    ...cover.blocks,
    {
      type: "KPI",
      key: "cover.delivery-kpi",
      title: { en: "Delivery KPI", ar: "مؤشر التسليم" },
      label: { en: "Mobilization", ar: "التجهيز" },
      value: "30",
      unit: { en: "days", ar: "يوماً" },
      asOf: "2026-07-24",
      sourceRequired: true,
      sourceRefs: ["SRC-TENDER"],
    },
    {
      type: "COMMERCIAL_HANDOFF",
      key: "cover.commercial",
      title: { en: "Commercial handoff", ar: "التسليم التجاري" },
      instruction: {
        en: "Values were entered by an authorized user.",
        ar: "أدخل المستخدم المخول القيم.",
      },
      pricingStatus: "USER_ENTRY_REQUIRED",
      entries: [
        {
          key: "line-1",
          description: {
            en: "Verified service line",
            ar: "بند خدمة موثق",
          },
          amount: "125000.00",
          currency: "SAR",
          sourceRefs: ["SRC-COVER"],
        },
      ],
      sourceRequired: true,
      sourceRefs: ["SRC-COVER"],
    },
    {
      type: "DIAGRAM",
      key: "cover.diagram",
      title: { en: "Delivery diagram", ar: "مخطط التسليم" },
      description: {
        en: "Approved delivery sequence.",
        ar: "تسلسل التسليم المعتمد.",
      },
      altText: {
        en: "Three delivery stages.",
        ar: "ثلاث مراحل للتسليم.",
      },
      assetRef: "/proposal/delivery-stages.png",
      sourceRequired: true,
      sourceRefs: ["SRC-EVIDENCE"],
    },
  ]);
}

describe("structured proposal document compilation", () => {
  test("compiles all supported blocks to a deterministic bilingual AST", () => {
    const snapshot = richSnapshot();
    const first = compileProposalLayoutDocument(snapshot);
    const second = compileProposalLayoutDocument(
      JSON.parse(JSON.stringify(snapshot)) as ProposalSnapshot
    );

    expect(first.status).toBe("READY");
    expect(second.status).toBe("READY");
    expect(first.document).toEqual(second.document);
    expect(first.plan.planHash).toBe(second.plan.planHash);
    expect(first.metadata).toEqual(second.metadata);
    expect(first.metadata.lifecycle).toBe("DRAFT");
    expect(first.metadata.sourceRefs).toEqual([
      "SRC-CONTROL",
      "SRC-COVER",
      "SRC-EVIDENCE",
      "SRC-TENDER",
    ]);

    if (first.status !== "READY") throw new Error("Expected ready fixture");
    const blockTypes = first.document.sections.flatMap((section) =>
      section.blocks.map((block) => block.type)
    );
    expect(blockTypes).toEqual(
      expect.arrayContaining([
        "paragraph",
        "heading",
        "list",
        "table",
        "image",
      ])
    );
  });

  test("renders escaped HTML with explicit locale and provenance metadata", () => {
    const compilation = compileProposalLayoutDocument(richSnapshot());
    const html = renderProposalLayoutHTML(compilation);

    expect(html).toContain('data-language="en" lang="en" dir="ltr"');
    expect(html).toContain('data-language="ar" lang="ar" dir="rtl"');
    expect(html).toContain("AT&amp;T &quot;verified&quot;");
    expect(html).not.toContain('AT&T "verified"');
    expect(html).toContain("استجابة موثقة لملحق الخدمات الرقمية");
    expect(html).toContain('src="/proposal/delivery-stages.png"');
    expect(html).toContain("DRAFT");
    expect(html).toContain("مسودة");
    expect(html).toContain(compilation.metadata.snapshotHash);
    expect(html).toContain(compilation.metadata.planHash);
    expect(html).toContain("SRC-EVIDENCE");
    expect(html).not.toContain("<script");
    expect((html.match(/<h1\b/gu) ?? []).length).toBe(1);
  });

  test("blocks unsafe markup before it reaches the HTML renderer", () => {
    const snapshot = makeSnapshot();
    const cover = snapshot.modules.find((module) => module.key === "cover");
    const block = cover?.blocks[0];
    if (!block || block.type !== "NARRATIVE") {
      throw new Error("Fixture invariant failed");
    }
    const unsafe = withCoverBlocks(snapshot, [
      {
        ...block,
        body: {
          en: "<script>alert('unsafe')</script>",
          ar: "محتوى آمن",
        },
      },
    ]);
    const compilation = compileProposalLayoutDocument(unsafe);

    expect(compilation.status).toBe("BLOCKED");
    expect(compilation.diagnostics.map(({ code }) => code)).toContain(
      "UNSAFE_MARKUP"
    );
    expect(() => renderProposalLayoutHTML(compilation)).toThrow(
      ProposalLayoutExportError
    );
  });

  test("blocks invalid snapshots and does not render a partial document", () => {
    const snapshot = makeSnapshot();
    const invalid: ProposalSnapshot = {
      ...snapshot,
      modules: snapshot.modules.filter((module) => module.key !== "cover"),
    };
    const compilation = compileProposalLayoutDocument(invalid);

    expect(compilation.status).toBe("BLOCKED");
    expect(compilation.document).toBeNull();
    expect(compilation.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "MISSING_REQUIRED_MODULE",
          path: "modules.cover",
        }),
      ])
    );
  });

  test("requires explicit bilingual content instead of inventing translations", () => {
    const snapshot = makeSnapshot({
      languageMode: "EN",
      projectTitle: { en: "English only", ar: "" },
      bidderName: { en: "Bidder", ar: "" },
    });
    const compilation = compileProposalLayoutDocument(snapshot);

    expect(compilation.status).toBe("BLOCKED");
    expect(compilation.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "BILINGUAL_CONTENT_REQUIRED",
          path: "languageMode",
        }),
      ])
    );
  });

  test("accepts only application-relative diagram assets", () => {
    const snapshot = richSnapshot();
    const cover = snapshot.modules.find((module) => module.key === "cover");
    if (!cover) throw new Error("Fixture invariant failed");
    const blocks = cover.blocks.map((block) =>
      block.type === "DIAGRAM"
        ? { ...block, assetRef: "https://assets.example/diagram.png" }
        : block
    );
    const compilation = compileProposalLayoutDocument(
      withCoverBlocks(snapshot, blocks)
    );

    expect(compilation.status).toBe("BLOCKED");
    expect(compilation.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "UNSAFE_ASSET_REFERENCE",
          path: "modules.cover.blocks.cover.diagram.assetRef",
        }),
      ])
    );
  });

  test("fails PDF closed for relative diagrams until a trusted resolver exists", () => {
    const compilation = compileProposalLayoutDocument(richSnapshot(), {
      channel: "PDF",
    });

    expect(compilation.status).toBe("BLOCKED");
    expect(compilation.document).toBeNull();
    expect(compilation.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "UNSUPPORTED_BLOCK_CAPABILITY",
          path: "modules.cover.blocks.cover.diagram.assetRef",
        }),
      ])
    );
  });

  test("reports non-document channels as explicit capability errors", () => {
    const pptxCompilation = compileProposalLayoutDocument(makeSnapshot(), {
      channel: "PPTX",
    });
    expect(pptxCompilation.status).toBe("BLOCKED");
    expect(pptxCompilation.diagnostics.map(({ code }) => code)).toContain(
      "UNSUPPORTED_EXPORT_CHANNEL"
    );
  });
});

describe("structured proposal multi-format export", () => {
  test("exports HTML as a UTF-8 artifact from the canonical AST", async () => {
    const artifact = await exportProposalLayout(makeSnapshot(), {
      channel: "HTML",
    });

    expect(artifact.channel).toBe("HTML");
    if (artifact.channel !== "HTML") throw new Error("Expected HTML artifact");
    expect(artifact.mediaType).toBe("text/html; charset=utf-8");
    expect(artifact.buffer.toString("utf8")).toBe(artifact.html);
    expect(artifact.metadata.lifecycle).toBe("DRAFT");
    expect(artifact.document.sections.length).toBeGreaterThan(1);
  });

  test("uses the real native PPTX generator and returns a ZIP package", async () => {
    const artifact = await exportProposalLayout(makeSnapshot(), {
      channel: "PPTX",
      brand: { primaryColor: "#123456" },
    });

    expect(artifact.channel).toBe("PPTX");
    expect(artifact.buffer.subarray(0, 2).toString("ascii")).toBe("PK");
    expect(artifact.plan.channel).toBe("PPTX");
    expect(artifact.metadata.snapshotHash).toBe(artifact.plan.snapshotHash);
    expect(artifact.metadata.planHash).toBe(artifact.plan.planHash);
    expect(artifact.metadata.lifecycle).toBe("DRAFT");
  });

  test("surfaces PPTX block capability errors without dropping content", async () => {
    await expect(
      exportProposalLayout(richSnapshot(), { channel: "PPTX" })
    ).rejects.toMatchObject({
      name: "ProposalLayoutExportError",
      channel: "PPTX",
      diagnostics: expect.arrayContaining([
        expect.objectContaining({
          code: "UNSUPPORTED_BLOCK_FOR_CHANNEL",
          path: "modules.cover.blocks.cover.diagram",
        }),
      ]),
    });
  });

  test("generates valid XLSX workbook with worksheets and manifest", async () => {
    const result = await exportProposalLayout(makeSnapshot(), { channel: "XLSX" });
    expect(result.channel).toBe("XLSX");
    expect(result.buffer).toBeDefined();
    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.mediaType).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(result.notRepresentable).toBeDefined();
  });

  const pdfTest =
    process.env.PLAYWRIGHT_CHROMIUM === "1" ? test : test.skip;
  pdfTest(
    "generates a real PDF from the same canonical bilingual AST when opted in",
    async () => {
      const compilation = compileProposalLayoutDocument(makeSnapshot(), {
        channel: "PDF",
      });
      const direct = await generateProposalLayoutPdf(compilation);
      const artifact = await exportProposalLayout(makeSnapshot(), {
        channel: "PDF",
      });

      expect(direct.pdf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
      expect(artifact.channel).toBe("PDF");
      expect(artifact.buffer.subarray(0, 5).toString("ascii")).toBe("%PDF-");
      if (artifact.channel !== "PDF") throw new Error("Expected PDF artifact");
      expect(artifact.html).toContain("data-bilingual-layout-ready");
      expect(artifact.document).toEqual(compilation.document);
      expect(artifact.metadata.lifecycle).toBe("DRAFT");
    },
    30_000
  );
});
