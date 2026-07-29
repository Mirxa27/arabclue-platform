/**
 * Feature: platform-completion, Property 11: XLSX block/manifest completeness
 *
 * For any valid bilingual snapshot/layout, the compiled workbook plan is
 * manifest-first, has exactly one representable worksheet per TABLE/KPI/
 * EVIDENCE_REGISTER/COMMERCIAL_HANDOFF block in layout order, and exactly one
 * manifest not-representable row per narrative/bullet/diagram block.
 */

import { describe, expect, test } from "bun:test";
import { compileProposalLayout } from "../../proposal-layouts";
import {
  compileProposalWorkbookPlan,
  isXlsxRepresentableBlock,
} from "../../proposal-workbook-plan";
import { serializeProposalWorkbook } from "../../proposal-workbook-xlsx";
import type {
  ProposalBlock,
  ProposalModuleKey,
  ProposalModuleSnapshot,
  ProposalSnapshot,
  ProposalSourceReference,
} from "../../proposal-layouts";

function source(id: string): ProposalSourceReference {
  return {
    id,
    kind: "USER_ENTRY",
    title: { en: `Source ${id}`, ar: `المصدر ${id}` },
    locator: `record:${id}`,
    asOf: "2026-07-24",
  };
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

function baseSnapshot(seed: number): ProposalSnapshot {
  const includeKpi = seed % 2 === 0;
  const includeCommercial = seed % 3 === 0;
  const includeDiagram = seed % 5 === 0;

  const coverBlocks: ProposalBlock[] = [
    {
      type: "NARRATIVE",
      key: `cover.statement.${seed}`,
      title: { en: `Cover ${seed}`, ar: `الغلاف ${seed}` },
      body: {
        en: `Verified narrative ${seed}.`,
        ar: `سرد موثق ${seed}.`,
      },
      sourceRequired: true,
      sourceRefs: [`SRC-${seed}-N`],
    },
  ];

  if (includeKpi) {
    coverBlocks.push({
      type: "KPI",
      key: `cover.kpi.${seed}`,
      title: { en: `KPI ${seed}`, ar: `مؤشر ${seed}` },
      label: { en: `Metric ${seed}`, ar: `مقياس ${seed}` },
      value: seed % 7 === 0 ? null : String(seed),
      unit: { en: "units", ar: "وحدات" },
      asOf: "2026-07-24",
      sourceRequired: true,
      sourceRefs: [`SRC-${seed}-K`],
    });
  }

  if (includeCommercial) {
    coverBlocks.push({
      type: "COMMERCIAL_HANDOFF",
      key: `cover.commercial.${seed}`,
      title: { en: `Commercial ${seed}`, ar: `تجاري ${seed}` },
      instruction: {
        en: `Handoff instruction ${seed}`,
        ar: `تعليمات التسليم ${seed}`,
      },
      pricingStatus: "USER_ENTRY_REQUIRED",
      entries: [
        {
          key: `li-${seed}`,
          description: { en: `Line ${seed}`, ar: `بند ${seed}` },
          amount: seed % 11 === 0 ? null : `${seed}.00`,
          currency: seed % 11 === 0 ? null : "SAR",
          sourceRefs: [`SRC-${seed}-C`],
        },
      ],
      sourceRequired: true,
      sourceRefs: [`SRC-${seed}-C`],
    });
  }

  if (includeDiagram) {
    coverBlocks.push({
      type: "DIAGRAM",
      key: `cover.diagram.${seed}`,
      title: { en: `Diagram ${seed}`, ar: `مخطط ${seed}` },
      description: {
        en: `Approved sequence ${seed}.`,
        ar: `تسلسل معتمد ${seed}.`,
      },
      altText: {
        en: `Diagram alt ${seed}`,
        ar: `وصف المخطط ${seed}`,
      },
      assetRef: `/proposal/diagram-${seed}.png`,
      sourceRequired: true,
      sourceRefs: [`SRC-${seed}-D`],
    });
  }

  const sourceIds = [
    `SRC-${seed}-N`,
    `SRC-${seed}-T`,
    `SRC-${seed}-B`,
    `SRC-${seed}-E`,
    ...(includeKpi ? [`SRC-${seed}-K`] : []),
    ...(includeCommercial ? [`SRC-${seed}-C`] : []),
    ...(includeDiagram ? [`SRC-${seed}-D`] : []),
  ];

  return {
    schemaVersion: 1,
    snapshotId: `proposal-snapshot:prop11-${seed}`,
    version: seed + 1,
    intent: "ADDENDUM",
    languageMode: "BILINGUAL",
    projectTitle: {
      en: `Project ${seed}`,
      ar: `مشروع ${seed}`,
    },
    bidderName: {
      en: `Bidder ${seed}`,
      ar: `مقدم ${seed}`,
    },
    tenderReference: `RFP-2026-${seed}`,
    brand: {
      primaryColor: "#173F5F",
      secondaryColor: "#20639B",
      accentColor: "#D68C20",
      backgroundColor: "#FFFFFF",
      textColor: "#132238",
    },
    sources: sourceIds.map(source),
    modules: [
      moduleSnapshot("cover", { en: "Cover", ar: "الغلاف" }, coverBlocks),
      moduleSnapshot(
        "document-control",
        { en: "Document control", ar: "ضبط الوثيقة" },
        [
          {
            type: "TABLE",
            key: `control.table.${seed}`,
            title: { en: `Table ${seed}`, ar: `جدول ${seed}` },
            columns: [
              { key: "colA", label: { en: "Column A", ar: "العمود أ" } },
              { key: "colB", label: { en: "Column B", ar: "العمود ب" } },
            ],
            rows: [
              {
                key: `row-${seed}`,
                cells: {
                  colA: { en: `A${seed}`, ar: `أ${seed}` },
                  colB: { en: `B${seed}`, ar: `ب${seed}` },
                },
              },
            ],
            sourceRequired: true,
            sourceRefs: [`SRC-${seed}-T`],
          },
        ]
      ),
      moduleSnapshot(
        "assumptions-dependencies-deviations",
        { en: "Assumptions", ar: "الافتراضات" },
        [
          {
            type: "BULLET_LIST",
            key: `assumptions.items.${seed}`,
            title: { en: `Assumptions ${seed}`, ar: `افتراضات ${seed}` },
            items: [
              {
                en: `Assumption ${seed}`,
                ar: `افتراض ${seed}`,
              },
            ],
            sourceRequired: true,
            sourceRefs: [`SRC-${seed}-B`],
          },
        ]
      ),
      moduleSnapshot(
        "appendices-evidence-validation",
        { en: "Evidence", ar: "الأدلة" },
        [
          {
            type: "EVIDENCE_REGISTER",
            key: `evidence.register.${seed}`,
            title: { en: `Evidence ${seed}`, ar: `أدلة ${seed}` },
            entries: [
              {
                key: `ev-${seed}`,
                label: { en: `Evidence ${seed}`, ar: `دليل ${seed}` },
                status: "VERIFIED",
                sourceRefs: [`SRC-${seed}-E`],
              },
            ],
            sourceRequired: true,
            sourceRefs: [`SRC-${seed}-E`],
          },
        ]
      ),
    ],
  };
}

describe("Feature: platform-completion, Property 11: XLSX block/manifest completeness", () => {
  test("manifest-first plan matches representable and non-representable blocks across 100 cases", async () => {
    const fixedAt = new Date("2026-07-29T00:00:00.000Z");

    for (let seed = 0; seed < 100; seed += 1) {
      const snapshot = baseSnapshot(seed);
      const layout = compileProposalLayout(snapshot, { channel: "XLSX" });
      expect(layout.status).toBe("VALID");

      const planned = compileProposalWorkbookPlan(snapshot, {
        layout,
        locale: seed % 2 === 0 ? "ar" : "en",
        generatedAt: fixedAt,
      });
      expect(planned.status).toBe("READY");
      if (planned.status !== "READY") continue;

      const plan = planned.plan;
      expect(plan.sheets[0]?.kind).toBe("MANIFEST");
      expect(plan.sheets[0]).toEqual(plan.manifest);

      const layoutBlocks = layout.modules.flatMap((mod) => {
        const snapshotModule = snapshot.modules.find((m) => m.key === mod.key);
        return mod.blocks
          .map((block) => snapshotModule?.blocks.find((b) => b.key === block.key))
          .filter((block): block is ProposalBlock => Boolean(block));
      });

      const representable = layoutBlocks.filter((b) =>
        isXlsxRepresentableBlock(b)
      );
      const nonRepresentable = layoutBlocks.filter(
        (b) => !isXlsxRepresentableBlock(b)
      );

      expect(plan.blockSheets.length).toBe(representable.length);
      expect(plan.manifest.notRepresentableRows.length).toBe(
        nonRepresentable.length
      );

      for (let i = 0; i < representable.length; i += 1) {
        expect(plan.blockSheets[i]!.blockKey).toBe(representable[i]!.key);
        expect(plan.blockSheets[i]!.name.length).toBeLessThanOrEqual(31);
      }

      for (let i = 0; i < nonRepresentable.length; i += 1) {
        expect(plan.manifest.notRepresentableRows[i]!.blockKey).toBe(
          nonRepresentable[i]!.key
        );
      }

      if (seed % 10 === 0) {
        const { buffer } = await serializeProposalWorkbook(plan);
        expect(buffer.byteLength).toBeGreaterThan(0);
      }
    }
  }, 60_000);
});
