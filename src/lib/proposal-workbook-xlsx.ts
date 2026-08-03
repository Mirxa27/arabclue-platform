/**
 * ExcelJS serializer for a compiled ProposalWorkbookPlan.
 *
 * The planner is the sole authority for sheet order, bilingual headers, literal
 * values, and not-available markers. This module never computes amounts,
 * emits formulas, or invents translations.
 */

import ExcelJS from "exceljs";
import type {
  ProposalWorkbookAttribute,
  ProposalWorkbookBlockSheet,
  ProposalWorkbookCell,
  ProposalWorkbookLocale,
  ProposalWorkbookManifestSheet,
  ProposalWorkbookPlan,
  ProposalWorkbookSheet,
} from "./proposal-workbook-plan";

export type SerializeProposalWorkbookResult = Readonly<{
  buffer: Buffer;
  /** Module.block keys recorded as not-representable in the manifest. */
  notRepresentable: readonly string[];
}>;

function cellText(
  cell: ProposalWorkbookCell,
  locale: ProposalWorkbookLocale
): string {
  switch (cell.kind) {
    case "STORED_LITERAL":
      return cell.literal;
    case "LOCALIZED":
    case "NOT_AVAILABLE":
      return cell.label[locale];
    default: {
      const _exhaustive: never = cell;
      return _exhaustive;
    }
  }
}

function applyDirection(
  sheet: ExcelJS.Worksheet,
  direction: "rtl" | "ltr"
): void {
  sheet.views = [{ state: "normal", rightToLeft: direction === "rtl" }];
}

function styleHeaderCell(
  cell: ExcelJS.Cell,
  headerFill: ExcelJS.FillPattern,
  headerFont: Partial<ExcelJS.Font>
): void {
  cell.fill = headerFill;
  cell.font = headerFont;
}

function writeBilingualHeaders(
  worksheet: ExcelJS.Worksheet,
  headerRows: readonly [readonly string[], readonly string[]],
  startRow: number,
  headerFill: ExcelJS.FillPattern,
  headerFont: Partial<ExcelJS.Font>
): void {
  for (let rowOffset = 0; rowOffset < headerRows.length; rowOffset += 1) {
    const labels = headerRows[rowOffset]!;
    const row = worksheet.getRow(startRow + rowOffset);
    for (let col = 0; col < labels.length; col += 1) {
      const cell = row.getCell(col + 1);
      cell.value = labels[col] ?? "";
      styleHeaderCell(cell, headerFill, headerFont);
    }
    row.commit();
  }
}

function writeAttributeBlock(
  worksheet: ExcelJS.Worksheet,
  attributes: readonly ProposalWorkbookAttribute[],
  startRow: number,
  locale: ProposalWorkbookLocale
): void {
  let rowNum = startRow;
  for (const attribute of attributes) {
    const row = worksheet.getRow(rowNum);
    row.getCell(1).value = attribute.label[locale];
    row.getCell(2).value = cellText(attribute.value, locale);
    row.commit();
    rowNum += 1;
  }
}

function writeBlockSheet(
  workbook: ExcelJS.Workbook,
  sheet: ProposalWorkbookBlockSheet,
  locale: ProposalWorkbookLocale,
  headerFill: ExcelJS.FillPattern,
  headerFont: Partial<ExcelJS.Font>
): void {
  const worksheet = workbook.addWorksheet(sheet.name);
  applyDirection(worksheet, sheet.direction);
  writeBilingualHeaders(worksheet, sheet.headerRows, 1, headerFill, headerFont);

  let rowNum = sheet.firstDataRow;
  for (const dataRow of sheet.rows) {
    const excelRow = worksheet.getRow(rowNum);
    for (let col = 0; col < sheet.columns.length; col += 1) {
      const column = sheet.columns[col]!;
      const cell =
        dataRow.cells.find((candidate) => candidate.columnKey === column.key) ??
        null;
      excelRow.getCell(col + 1).value = cell ? cellText(cell, locale) : "";
    }
    excelRow.commit();
    rowNum += 1;
  }

  if (sheet.attributes.length > 0) {
    writeAttributeBlock(worksheet, sheet.attributes, rowNum + 1, locale);
  }
}

function writeManifestSheet(
  workbook: ExcelJS.Workbook,
  sheet: ProposalWorkbookManifestSheet,
  locale: ProposalWorkbookLocale,
  headerFill: ExcelJS.FillPattern,
  headerFont: Partial<ExcelJS.Font>
): void {
  const worksheet = workbook.addWorksheet(sheet.name);
  applyDirection(worksheet, sheet.direction);

  const titleRow = worksheet.getRow(1);
  titleRow.getCell(1).value = `${sheet.title.ar} / ${sheet.title.en}`;
  titleRow.font = { bold: true, size: 14 };
  titleRow.commit();

  // Metadata table: bilingual headers at rows 2–3, data from row 4.
  writeBilingualHeaders(
    worksheet,
    sheet.metadataHeaderRows,
    2,
    headerFill,
    headerFont
  );

  let rowNum = 4;
  for (const entry of sheet.metadata) {
    const row = worksheet.getRow(rowNum);
    // Two-column field/value table; field label uses the export locale.
    row.getCell(1).value = entry.label[locale];
    row.getCell(2).value = entry.value;
    row.commit();
    rowNum += 1;
  }

  rowNum += 1;
  const sectionTitle = worksheet.getRow(rowNum);
  sectionTitle.getCell(1).value =
    `${sheet.notRepresentableTitle.ar} / ${sheet.notRepresentableTitle.en}`;
  sectionTitle.font = { bold: true };
  sectionTitle.commit();
  rowNum += 1;

  writeBilingualHeaders(
    worksheet,
    sheet.notRepresentableHeaderRows,
    rowNum,
    headerFill,
    headerFont
  );
  rowNum += 2;

  for (const nr of sheet.notRepresentableRows) {
    const row = worksheet.getRow(rowNum);
    const valuesByKey: Record<string, string> = {
      manifestModuleKey: nr.moduleKey,
      manifestBlockKey: nr.blockKey,
      manifestBlockType: nr.blockTypeLabel[locale],
      manifestMarkerAr: nr.notRepresentable.ar,
      manifestMarkerEn: nr.notRepresentable.en,
    };
    for (let col = 0; col < sheet.notRepresentableColumns.length; col += 1) {
      const key = sheet.notRepresentableColumns[col]!.key;
      row.getCell(col + 1).value = valuesByKey[key] ?? "";
    }
    row.commit();
    rowNum += 1;
  }
}

/**
 * Maximum total data rows allowed across all sheets in a single workbook.
 * Prevents memory exhaustion on very large proposals (Requirement: export guard).
 */
export const PROPOSAL_WORKBOOK_MAX_ROWS = 50_000;

/**
 * Count the total data rows across all block sheets in the plan. Manifest
 * metadata and not-representable rows are excluded because they are bounded by
 * the snapshot structure, not by tenant-supplied data volume.
 */
function countWorkbookDataRows(
  plan: ProposalWorkbookPlan
): number {
  let total = 0;
  for (const sheet of plan.sheets) {
    if (sheet.kind === "BLOCK") {
      total += sheet.rows.length;
    }
  }
  return total;
}

/**
 * Serialize a READY workbook plan into XLSX bytes. Every cell is a literal
 * string; formula fields are never set.
 *
 * @throws {Error} when the total data rows across all block sheets exceed
 *   {@link PROPOSAL_WORKBOOK_MAX_ROWS}, preventing memory exhaustion on very
 *   large proposals.
 */
export async function serializeProposalWorkbook(
  plan: ProposalWorkbookPlan
): Promise<SerializeProposalWorkbookResult> {
  const totalDataRows = countWorkbookDataRows(plan);
  if (totalDataRows > PROPOSAL_WORKBOOK_MAX_ROWS) {
    throw new Error(
      `XLSX export size limit exceeded: ${totalDataRows} data rows exceed the maximum of ${PROPOSAL_WORKBOOK_MAX_ROWS} rows. Reduce the proposal data volume and retry.`
    );
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "Arabclue Structured Export";
  wb.created = new Date(plan.generatedAt);

  const headerFill: ExcelJS.FillPattern = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1E3A8A" },
  };
  const headerFont: Partial<ExcelJS.Font> = {
    bold: true,
    color: { argb: "FFFFFFFF" },
  };

  for (const sheet of plan.sheets as readonly ProposalWorkbookSheet[]) {
    if (sheet.kind === "MANIFEST") {
      writeManifestSheet(wb, sheet, plan.locale, headerFill, headerFont);
    } else {
      writeBlockSheet(wb, sheet, plan.locale, headerFill, headerFont);
    }
  }

  const notRepresentable = plan.manifest.notRepresentableRows.map(
    (row) => `${row.moduleKey}.${row.blockKey} (${row.blockType})`
  );

  const buf = await wb.xlsx.writeBuffer();
  return {
    buffer: Buffer.from(buf),
    notRepresentable: Object.freeze(notRepresentable),
  };
}

/** Return false if any formula-bearing cell is present in the workbook bytes. */
export async function workbookContainsNoFormulas(
  buffer: Buffer
): Promise<boolean> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as never);
  for (const sheet of wb.worksheets) {
    let foundFormula = false;
    sheet.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        if (cell.formula) {
          foundFormula = true;
          return;
        }
        const value = cell.value;
        if (
          value !== null &&
          typeof value === "object" &&
          "formula" in value
        ) {
          foundFormula = true;
        }
      });
    });
    if (foundFormula) return false;
  }
  return true;
}
