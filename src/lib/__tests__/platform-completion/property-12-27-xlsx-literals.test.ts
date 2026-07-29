/**
 * Feature: platform-completion
 * Property 12: XLSX contains no monetary formulas
 * Property 27: XLSX nulls are explicit
 */

import { describe, expect, test } from "bun:test";
import ExcelJS from "exceljs";
import { compileProposalLayout } from "../../proposal-layouts";
import { compileProposalWorkbookPlan } from "../../proposal-workbook-plan";
import {
  serializeProposalWorkbook,
  workbookContainsNoFormulas,
} from "../../proposal-workbook-xlsx";
import type {
  ProposalBlock,
  ProposalModuleKey,
  ProposalModuleSnapshot,
  ProposalSnapshot,
} from "../../proposal-layouts";
import { t } from "../../i18n";

function moduleSnapshot(
  key: ProposalModuleKey,
  title: { readonly en: string; readonly ar: string },
  blocks: readonly ProposalBlock[]
): ProposalModuleSnapshot {
  return {
    key,
    title,
    requiredBlockKeys: blocks.map((b) => b.key),
    blocks,
  };
}

function commercialSnapshot(seed: number): ProposalSnapshot {
  const amountNull = seed % 2 === 0;
  return {
    schemaVersion: 1,
    snapshotId: `proposal-snapshot:prop12-${seed}`,
    version: seed + 1,
    intent: "ADDENDUM",
    languageMode: "BILINGUAL",
    projectTitle: { en: `P ${seed}`, ar: `م ${seed}` },
    bidderName: { en: `B ${seed}`, ar: `مقدم ${seed}` },
    tenderReference: `RFP-${seed}`,
    brand: {
      primaryColor: "#173F5F",
      secondaryColor: "#20639B",
      accentColor: "#D68C20",
      backgroundColor: "#FFFFFF",
      textColor: "#132238",
    },
    sources: [
      {
        id: "SRC-C",
        kind: "USER_ENTRY",
        title: { en: "Commercial", ar: "تجاري" },
        locator: "record:c",
        asOf: "2026-07-24",
      },
      {
        id: "SRC-K",
        kind: "USER_ENTRY",
        title: { en: "KPI", ar: "مؤشر" },
        locator: "record:k",
        asOf: "2026-07-24",
      },
      {
        id: "SRC-N",
        kind: "USER_ENTRY",
        title: { en: "Narrative", ar: "سرد" },
        locator: "record:n",
        asOf: "2026-07-24",
      },
      {
        id: "SRC-T",
        kind: "USER_ENTRY",
        title: { en: "Table", ar: "جدول" },
        locator: "record:t",
        asOf: "2026-07-24",
      },
      {
        id: "SRC-B",
        kind: "USER_ENTRY",
        title: { en: "Bullets", ar: "نقاط" },
        locator: "record:b",
        asOf: "2026-07-24",
      },
      {
        id: "SRC-E",
        kind: "APPROVED_KNOWLEDGE",
        title: { en: "Evidence", ar: "دليل" },
        locator: "record:e",
        asOf: "2026-07-24",
      },
    ],
    modules: [
      moduleSnapshot("cover", { en: "Cover", ar: "الغلاف" }, [
        {
          type: "NARRATIVE",
          key: `cover.statement.${seed}`,
          title: { en: "Cover", ar: "الغلاف" },
          body: { en: `Body ${seed}`, ar: `نص ${seed}` },
          sourceRequired: true,
          sourceRefs: ["SRC-N"],
        },
        {
          type: "KPI",
          key: `cover.kpi.${seed}`,
          title: { en: "KPI", ar: "مؤشر" },
          label: { en: "Metric", ar: "مقياس" },
          value: amountNull ? null : String(seed),
          unit: { en: "u", ar: "و" },
          asOf: null,
          sourceRequired: true,
          sourceRefs: ["SRC-K"],
        },
        {
          type: "COMMERCIAL_HANDOFF",
          key: `cover.commercial.${seed}`,
          title: { en: "Commercial", ar: "تجاري" },
          instruction: { en: "Handoff", ar: "تسليم" },
          pricingStatus: "USER_ENTRY_REQUIRED",
          entries: [
            {
              key: `li-${seed}`,
              description: { en: "Line", ar: "بند" },
              amount: amountNull ? null : `${seed}.50`,
              currency: amountNull ? null : "SAR",
              sourceRefs: ["SRC-C"],
            },
          ],
          sourceRequired: true,
          sourceRefs: ["SRC-C"],
        },
      ]),
      moduleSnapshot(
        "document-control",
        { en: "Document control", ar: "ضبط الوثيقة" },
        [
          {
            type: "TABLE",
            key: `control.table.${seed}`,
            title: { en: "Table", ar: "جدول" },
            columns: [
              { key: "rev", label: { en: "Rev", ar: "مراجعة" } },
              { key: "status", label: { en: "Status", ar: "حالة" } },
            ],
            rows: [
              {
                key: "r1",
                cells: {
                  rev: { en: "1", ar: "1" },
                  status: { en: "Ok", ar: "موافق" },
                },
              },
            ],
            sourceRequired: true,
            sourceRefs: ["SRC-T"],
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
            title: { en: "Assumptions", ar: "افتراضات" },
            items: [{ en: `A ${seed}`, ar: `افتراض ${seed}` }],
            sourceRequired: true,
            sourceRefs: ["SRC-B"],
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
            title: { en: "Evidence", ar: "أدلة" },
            entries: [
              {
                key: "e1",
                label: { en: "Auth", ar: "تفويض" },
                status: "VERIFIED",
                sourceRefs: ["SRC-E"],
              },
            ],
            sourceRequired: true,
            sourceRefs: ["SRC-E"],
          },
        ]
      ),
    ],
  };
}

describe("Feature: platform-completion, Property 12/27: XLSX literals and nulls", () => {
  test("100 workbooks have no formulas and encode nulls as bilingual markers", async () => {
    const fixedAt = new Date("2026-07-29T00:00:00.000Z");
    const markerAr = t.xlsx_not_available.ar;
    const markerEn = t.xlsx_not_available.en;

    for (let seed = 0; seed < 100; seed += 1) {
      const snapshot = commercialSnapshot(seed);
      const locale = seed % 2 === 0 ? "ar" : "en";
      const layout = compileProposalLayout(snapshot, { channel: "XLSX" });
      expect(layout.status).toBe("VALID");

      const planned = compileProposalWorkbookPlan(snapshot, {
        layout,
        locale,
        generatedAt: fixedAt,
      });
      expect(planned.status).toBe("READY");
      if (planned.status !== "READY") continue;

      for (const sheet of planned.plan.blockSheets) {
        for (const row of sheet.rows) {
          for (const cell of row.cells) {
            if (cell.kind === "NOT_AVAILABLE") {
              expect(cell.label.ar).toBe(markerAr);
              expect(cell.label.en).toBe(markerEn);
            }
            if (cell.kind === "STORED_LITERAL") {
              expect(cell.literal).not.toBe("");
              expect(cell.literal.startsWith("=")).toBe(false);
            }
          }
        }
      }

      const { buffer } = await serializeProposalWorkbook(planned.plan);
      expect(await workbookContainsNoFormulas(buffer)).toBe(true);

      if (seed % 2 === 0) {
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(buffer as never);
        let sawMarker = false;
        for (const sheet of wb.worksheets) {
          sheet.eachRow({ includeEmpty: false }, (row) => {
            row.eachCell({ includeEmpty: false }, (cell) => {
              const text = String(cell.value ?? "");
              expect(text.startsWith("=")).toBe(false);
              if (text === markerAr || text === markerEn) {
                sawMarker = true;
              }
            });
          });
        }
        expect(sawMarker).toBe(true);
      }
    }
  }, 90_000);
});
