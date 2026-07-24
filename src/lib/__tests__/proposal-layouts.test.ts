import { describe, expect, test } from "bun:test";
import JSZip from "jszip";
import {
  PROPOSAL_CHANNEL_CAPABILITIES,
  PROPOSAL_LAYOUT_KEYS,
  PROPOSAL_LAYOUT_PRESETS,
  PROPOSAL_MODULE_KEYS,
  ProposalLayoutValidationError,
  compileProposalLayout,
  contrastRatio,
  generateProposalPptx,
  getProposalLayoutPreset,
  resolveProposalPalette,
  selectProposalLayout,
  type ProposalBlock,
  type ProposalModuleKey,
  type ProposalModuleSnapshot,
  type ProposalSnapshot,
} from "../proposal-layouts";

const EXPECTED_LAYOUT_KEYS = [
  "government-formal",
  "executive-impact",
  "technical-deep-dive",
  "compliance-evidence",
  "bilingual-parallel",
  "compact-addendum",
] as const;

const EXPECTED_MODULE_KEYS = [
  "cover",
  "submission-letter",
  "document-control",
  "executive-summary",
  "requirements-understanding",
  "compliance-traceability",
  "technical-solution",
  "delivery-methodology",
  "governance-risk-quality-change",
  "team-evidence",
  "experience-case-studies",
  "service-levels-support",
  "local-content-saudization",
  "commercial-boq-handoff",
  "assumptions-dependencies-deviations",
  "appendices-evidence-validation",
] as const;

function source(
  id: string,
  kind:
    | "TENDER"
    | "USER_ENTRY"
    | "APPROVED_KNOWLEDGE"
    | "WORKSPACE"
    | "DERIVED" = "USER_ENTRY"
) {
  return {
    id,
    kind,
    title: {
      en: `Verified source ${id}`,
      ar: `مصدر موثق ${id}`,
    },
    locator: `record:${id}`,
    asOf: "2026-07-24",
  } as const;
}

function moduleSnapshot(
  key: ProposalModuleKey,
  title: { readonly en: string; readonly ar: string },
  block: ProposalBlock
): ProposalModuleSnapshot {
  return {
    key,
    title,
    requiredBlockKeys: [block.key],
    blocks: [block],
  };
}

function makeSnapshot(
  overrides: Partial<ProposalSnapshot> = {}
): ProposalSnapshot {
  const modules: readonly ProposalModuleSnapshot[] = [
    moduleSnapshot(
      "cover",
      { en: "Cover", ar: "الغلاف" },
      {
        type: "NARRATIVE",
        key: "cover.statement",
        title: { en: "Submission", ar: "التقديم" },
        body: {
          en: "Verified response for the digital services addendum.",
          ar: "استجابة موثقة لملحق الخدمات الرقمية.",
        },
        sourceRequired: true,
        sourceRefs: ["SRC-COVER"],
      }
    ),
    moduleSnapshot(
      "document-control",
      { en: "Document control", ar: "ضبط الوثيقة" },
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
      }
    ),
    moduleSnapshot(
      "assumptions-dependencies-deviations",
      {
        en: "Assumptions and deviations",
        ar: "الافتراضات والانحرافات",
      },
      {
        type: "BULLET_LIST",
        key: "assumptions.items",
        title: { en: "Confirmed assumptions", ar: "الافتراضات المؤكدة" },
        items: [
          {
            en: "Access is supplied by the contracting authority.",
            ar: "توفر الجهة المتعاقدة صلاحيات الوصول.",
          },
        ],
        sourceRequired: true,
        sourceRefs: ["SRC-ASSUMPTION"],
      }
    ),
    moduleSnapshot(
      "appendices-evidence-validation",
      { en: "Evidence appendix", ar: "ملحق الأدلة" },
      {
        type: "EVIDENCE_REGISTER",
        key: "evidence.register",
        title: { en: "Evidence register", ar: "سجل الأدلة" },
        entries: [
          {
            key: "evidence-1",
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
      }
    ),
  ];

  const base: ProposalSnapshot = {
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
      source("SRC-ASSUMPTION", "TENDER"),
      source("SRC-EVIDENCE", "APPROVED_KNOWLEDGE"),
    ],
    modules,
  };

  return { ...base, ...overrides };
}

function replaceModule(
  snapshot: ProposalSnapshot,
  module: ProposalModuleSnapshot
): ProposalSnapshot {
  return {
    ...snapshot,
    modules: snapshot.modules.map((candidate) =>
      candidate.key === module.key ? module : candidate
    ),
  };
}

function expectDeeplyFrozen(value: unknown): void {
  if (value === null || typeof value !== "object") return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) {
    expectDeeplyFrozen(child);
  }
}

describe("proposal layout catalog", () => {
  test("contains exactly the six approved presets", () => {
    expect(PROPOSAL_LAYOUT_KEYS).toEqual(EXPECTED_LAYOUT_KEYS);
    expect(Object.keys(PROPOSAL_LAYOUT_PRESETS)).toEqual(EXPECTED_LAYOUT_KEYS);
    expect(getProposalLayoutPreset("unknown")).toBeUndefined();
  });

  test("plans every architecture module exactly once and is immutable", () => {
    expect(PROPOSAL_MODULE_KEYS).toEqual(EXPECTED_MODULE_KEYS);

    for (const preset of Object.values(PROPOSAL_LAYOUT_PRESETS)) {
      expect(preset.modules).toHaveLength(EXPECTED_MODULE_KEYS.length);
      expect(new Set(preset.modules.map((module) => module.key))).toEqual(
        new Set(EXPECTED_MODULE_KEYS)
      );
      expect(preset.modules.map((module) => module.rank)).toEqual(
        Array.from({ length: EXPECTED_MODULE_KEYS.length }, (_, index) =>
          index + 1
        )
      );
      expectDeeplyFrozen(preset);
    }
  });

  test("declares every channel capability without implicit fallbacks", () => {
    for (const capabilities of Object.values(
      PROPOSAL_CHANNEL_CAPABILITIES
    )) {
      expect(Object.keys(capabilities)).toEqual([
        "HTML",
        "PDF",
        "PPTX",
        "XLSX",
      ]);
    }

    expect(PROPOSAL_CHANNEL_CAPABILITIES.DIAGRAM.PPTX).toBe("UNSUPPORTED");
    expect(PROPOSAL_CHANNEL_CAPABILITIES.DIAGRAM.XLSX).toBe("UNSUPPORTED");
    expect(PROPOSAL_CHANNEL_CAPABILITIES.TABLE.PPTX).toBe("NATIVE");
  });
});

describe("proposal layout selection and validation", () => {
  test("selects deterministically from intent and honors an explicit preset", () => {
    expect(selectProposalLayout(makeSnapshot()).key).toBe("compact-addendum");
    expect(
      selectProposalLayout(
        makeSnapshot({ intent: "TECHNICAL_EVALUATION" })
      ).key
    ).toBe("technical-deep-dive");
    expect(
      selectProposalLayout(makeSnapshot(), "compliance-evidence").key
    ).toBe("compliance-evidence");
  });

  test("resolves a contrast-safe palette and diagnoses invalid colors", () => {
    const palette = resolveProposalPalette({
      primaryColor: "#777777",
      secondaryColor: "#20639B",
      accentColor: "#D68C20",
      backgroundColor: "#FFFFFF",
      textColor: "#FFFFFF",
    });

    expect(
      contrastRatio(palette.onPrimary, palette.primaryColor)
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(palette.onBackground, palette.backgroundColor)
    ).toBeGreaterThanOrEqual(4.5);

    const plan = compileProposalLayout(
      makeSnapshot({
        brand: {
          primaryColor: "not-a-color",
          secondaryColor: "#20639B",
          accentColor: "#D68C20",
          backgroundColor: "#FFFFFF",
          textColor: "#132238",
        },
      }),
      { channel: "PPTX" }
    );

    expect(plan.status).toBe("INVALID");
    expect(plan.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "INVALID_BRAND_COLOR"
    );
    expect(plan.palette.primaryColor).toBe("173F5F");
  });

  test("compiles a stable structural plan without mutating the snapshot", () => {
    const snapshot = makeSnapshot();
    const before = JSON.stringify(snapshot);
    const first = compileProposalLayout(snapshot, { channel: "PPTX" });
    const second = compileProposalLayout(snapshot, { channel: "PPTX" });

    expect(first.status).toBe("VALID");
    expect(first.snapshotHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(first.planHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(first).toEqual(second);
    expect(JSON.stringify(snapshot)).toBe(before);
    expect(first.modules.map((module) => module.key)).toEqual([
      "cover",
      "document-control",
      "assumptions-dependencies-deviations",
      "appendices-evidence-validation",
    ]);
  });

  test("reports missing translations and unresolved sources without synthesizing data", () => {
    const snapshot = makeSnapshot();
    const cover = snapshot.modules[0];
    const coverBlock = cover.blocks[0];
    if (coverBlock.type !== "NARRATIVE") {
      throw new Error("Fixture invariant failed");
    }

    const changedBlock: ProposalBlock = {
      ...coverBlock,
      body: { ...coverBlock.body, ar: "" },
      sourceRefs: ["MISSING-SOURCE"],
    };
    const changed = replaceModule(snapshot, {
      ...cover,
      blocks: [changedBlock],
    });
    const plan = compileProposalLayout(changed, { channel: "PPTX" });

    expect(plan.status).toBe("INVALID");
    expect(plan.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "MISSING_TRANSLATION",
          path: expect.stringContaining(".body.ar"),
        }),
        expect.objectContaining({
          code: "UNKNOWN_SOURCE_REFERENCE",
          path: expect.stringContaining(".sourceRefs[0]"),
        }),
      ])
    );
    expect(changedBlock.body.ar).toBe("");
  });

  test("blocks absent required modules and required blocks", () => {
    const snapshot = makeSnapshot();
    const withoutCover = {
      ...snapshot,
      modules: snapshot.modules.filter((module) => module.key !== "cover"),
    };
    const missingModule = compileProposalLayout(withoutCover, {
      channel: "PPTX",
    });
    expect(missingModule.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "MISSING_REQUIRED_MODULE",
          path: "modules.cover",
        }),
      ])
    );

    const control = snapshot.modules.find(
      (module) => module.key === "document-control"
    );
    if (!control) throw new Error("Fixture invariant failed");
    const missingBlock = compileProposalLayout(
      replaceModule(snapshot, { ...control, blocks: [] }),
      { channel: "PPTX" }
    );
    expect(missingBlock.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "MISSING_REQUIRED_BLOCK",
          path: "modules.document-control.blocks.control.revisions",
        }),
      ])
    );
  });

  test("blocks duplicate module and block identities", () => {
    const snapshot = makeSnapshot();
    const cover = snapshot.modules[0];
    const duplicateModule = compileProposalLayout(
      { ...snapshot, modules: [...snapshot.modules, cover] },
      { channel: "PPTX" }
    );
    expect(duplicateModule.diagnostics.map(({ code }) => code)).toContain(
      "DUPLICATE_MODULE"
    );

    const duplicateBlock = compileProposalLayout(
      replaceModule(snapshot, {
        ...cover,
        blocks: [cover.blocks[0], cover.blocks[0]],
      }),
      { channel: "PPTX" }
    );
    expect(duplicateBlock.diagnostics.map(({ code }) => code)).toContain(
      "DUPLICATE_BLOCK"
    );
  });

  test("rejects unsupported PPTX blocks instead of silently dropping them", () => {
    const snapshot = makeSnapshot();
    const technical: ProposalModuleSnapshot = {
      key: "technical-solution",
      title: { en: "Technical solution", ar: "الحل التقني" },
      requiredBlockKeys: ["architecture"],
      blocks: [
        {
          type: "DIAGRAM",
          key: "architecture",
          title: { en: "Architecture", ar: "البنية" },
          description: {
            en: "Approved logical architecture.",
            ar: "البنية المنطقية المعتمدة.",
          },
          altText: {
            en: "Three verified system layers.",
            ar: "ثلاث طبقات نظام موثقة.",
          },
          assetRef: "workspace:architecture-v2",
          sourceRequired: true,
          sourceRefs: ["SRC-EVIDENCE"],
        },
      ],
    };
    const plan = compileProposalLayout(
      { ...snapshot, modules: [...snapshot.modules, technical] },
      { channel: "PPTX" }
    );

    expect(plan.status).toBe("INVALID");
    expect(plan.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "UNSUPPORTED_BLOCK_FOR_CHANNEL",
          path: "modules.technical-solution.blocks.architecture",
        }),
      ])
    );
  });

  test("rejects markup, unresolved tokens, and bidi control characters", () => {
    const snapshot = makeSnapshot();
    const cover = snapshot.modules[0];
    const block = cover.blocks[0];
    if (block.type !== "NARRATIVE") {
      throw new Error("Fixture invariant failed");
    }

    const unsafe = replaceModule(snapshot, {
      ...cover,
      blocks: [
        {
          ...block,
          body: {
            en: "<script>alert(1)</script> {{UNRESOLVED}}",
            ar: `نص مخفي\u202E`,
          },
        },
      ],
    });
    const plan = compileProposalLayout(unsafe, { channel: "PPTX" });
    const codes = plan.diagnostics.map(({ code }) => code);

    expect(codes).toContain("UNSAFE_MARKUP");
    expect(codes).toContain("UNRESOLVED_TOKEN");
    expect(codes).toContain("UNSAFE_BIDI_CONTROL");
  });

  test("requires explicit provenance for every populated commercial value", () => {
    const snapshot = makeSnapshot();
    const commercial: ProposalModuleSnapshot = {
      key: "commercial-boq-handoff",
      title: { en: "Commercial handoff", ar: "التسليم التجاري" },
      requiredBlockKeys: ["commercial.lines"],
      blocks: [
        {
          type: "COMMERCIAL_HANDOFF",
          key: "commercial.lines",
          title: { en: "Commercial schedule", ar: "الجدول التجاري" },
          instruction: {
            en: "Values are entered by an authorized user.",
            ar: "يدخل المستخدم المخول القيم.",
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
              sourceRefs: [],
            },
          ],
          sourceRequired: false,
          sourceRefs: [],
        },
      ],
    };
    const plan = compileProposalLayout(
      { ...snapshot, modules: [...snapshot.modules, commercial] },
      { channel: "PPTX" }
    );

    expect(plan.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "UNSOURCED_PRICING_CONTENT",
          path: expect.stringContaining("entries[0].sourceRefs"),
        }),
      ])
    );
  });
});

describe("PPTX proposal adapter", () => {
  test("writes a real bilingual deck with source and structural manifests", async () => {
    const snapshot = makeSnapshot();
    const plan = compileProposalLayout(snapshot, { channel: "PPTX" });
    const output = await generateProposalPptx(snapshot);

    expect(Buffer.isBuffer(output)).toBe(true);
    expect(output.subarray(0, 2).toString("ascii")).toBe("PK");

    const zip = await JSZip.loadAsync(output);
    const slideNames = Object.keys(zip.files)
      .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
      .sort();
    const notesNames = Object.keys(zip.files)
      .filter((name) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(name))
      .sort();
    const slideXml = (
      await Promise.all(
        slideNames.map((name) => zip.file(name)?.async("string") ?? "")
      )
    ).join("\n");
    const notesXml = (
      await Promise.all(
        notesNames.map((name) => zip.file(name)?.async("string") ?? "")
      )
    ).join("\n");

    expect(slideNames.length).toBe(4);
    expect(notesNames.length).toBe(4);
    expect(slideXml).toContain("Digital Services Addendum");
    expect(slideXml).toContain("ملحق الخدمات الرقمية");
    expect(slideXml).toContain("Revision register");
    expect(slideXml).toContain("سجل المراجعات");
    expect(slideXml).not.toContain("{{");
    expect(notesXml).toContain("[Sources]");
    expect(notesXml).toContain("SRC-EVIDENCE");
    expect(notesXml).toContain(plan.snapshotHash);
    expect(notesXml).toContain(plan.planHash);
  });

  test("rejects invalid snapshots before creating a partial deck", async () => {
    const snapshot = makeSnapshot();
    const withoutCover = {
      ...snapshot,
      modules: snapshot.modules.filter((module) => module.key !== "cover"),
    };

    await expect(generateProposalPptx(withoutCover)).rejects.toBeInstanceOf(
      ProposalLayoutValidationError
    );
  });

  test("keeps the structural plan deterministic independently of ZIP metadata", () => {
    const snapshot = makeSnapshot();
    const first = compileProposalLayout(snapshot, { channel: "PPTX" });
    const second = compileProposalLayout(
      JSON.parse(JSON.stringify(snapshot)) as ProposalSnapshot,
      { channel: "PPTX" }
    );

    expect(first.planHash).toBe(second.planHash);
    expect(first.modules).toEqual(second.modules);
  });
});
