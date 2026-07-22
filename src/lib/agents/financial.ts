import {
  computeQuickLiquidityRatio,
  LOCAL_CONTENT_PRICE_PREFERENCE,
  SAUDIZATION_DEFAULT_MIN,
} from "../procurement-rules";
import type { FinancialExtract, IngestionEntities } from "../types";

function findAmount(text: string, labels: RegExp[]): number | null {
  for (const label of labels) {
    const re = new RegExp(
      label.source + "[^\\d]{0,40}([\\d,]+(?:\\.\\d+)?)",
      label.flags.includes("i") ? label.flags : label.flags + "i"
    );
    const m = text.match(re);
    if (m?.[1]) {
      const n = parseFloat(m[1].replace(/,/g, ""));
      if (!Number.isNaN(n)) return n;
    }
  }
  return null;
}

export function parseFinancialText(text: string): {
  cashEquivalents: number | null;
  accountsReceivable: number | null;
  currentLiabilities: number | null;
  saudizationPercent: number | null;
} {
  const cashEquivalents = findAmount(text, [
    /cash\s*(?:&|and)?\s*equivalents?/i,
    /نقد(?:ية)?(?:\s*وما\s*في\s*حكمها)?/,
    /cash\s*balance/i,
  ]);
  const accountsReceivable = findAmount(text, [
    /accounts?\s*receivable/i,
    /ذمم\s*مدينة/,
    /AR\b/,
  ]);
  const currentLiabilities = findAmount(text, [
    /current\s*liabilities/i,
    /التزامات\s*متداولة/,
    /short[- ]term\s*liabilities/i,
  ]);
  const saudizationPercent =
    findAmount(text, [/saudization/i, /سعودة/, /nitaqat/i]) ?? null;

  return { cashEquivalents, accountsReceivable, currentLiabilities, saudizationPercent };
}

export function runFinancialAgent(opts: {
  financialText: string;
  entities: IngestionEntities | null;
  projectBudget: number | null;
  currency?: string;
}): FinancialExtract & { findings: string[] } {
  const parsed = parseFinancialText(opts.financialText);
  const notes: string[] = [];
  const findings: string[] = [];

  let quickLiquidityRatio: number | null = null;
  let qlrPasses: boolean | null = null;

  if (
    parsed.cashEquivalents != null &&
    parsed.accountsReceivable != null &&
    parsed.currentLiabilities != null
  ) {
    const qlr = computeQuickLiquidityRatio({
      cashEquivalents: parsed.cashEquivalents,
      accountsReceivable: parsed.accountsReceivable,
      currentLiabilities: parsed.currentLiabilities,
    });
    quickLiquidityRatio = qlr.ratio;
    qlrPasses = qlr.passes;
    findings.push(
      `QLR = ${qlr.ratio} via ${qlr.formula} → ${qlr.passes ? "PASS (≥1.0)" : "FAIL (<1.0)"}`
    );
    notes.push(
      `Cash ${parsed.cashEquivalents}, AR ${parsed.accountsReceivable}, CL ${parsed.currentLiabilities}`
    );
  } else {
    notes.push(
      "Insufficient financial line items in uploaded FINANCIAL document to compute QLR. Upload statements with Cash, AR, and Current Liabilities."
    );
    findings.push("QLR not computed — missing Cash/AR/Current Liabilities in financial text");
  }

  const saudizationPercent = parsed.saudizationPercent;
  if (saudizationPercent != null) {
    findings.push(
      `Saudization ${saudizationPercent}% (minimum guideline ${SAUDIZATION_DEFAULT_MIN}%)`
    );
  }

  const budget = opts.projectBudget && opts.projectBudget > 0 ? opts.projectBudget : 1_000_000;
  const milestones = opts.entities?.milestones ?? [
    { name: "Mobilization", weeks: 2 },
    { name: "Delivery", weeks: 20 },
  ];
  const weightSum = milestones.reduce((s, m) => s + m.weeks, 0) || 1;
  const boqItems = milestones.map((m) => {
    const share = m.weeks / weightSum;
    const total = Math.round(budget * share * 100) / 100;
    return {
      item: m.name,
      unit: "LS",
      qty: 1,
      unitPrice: total,
      total,
    };
  });

  // Add local-content adjusted comparable price note as a BoQ meta line
  const preference = LOCAL_CONTENT_PRICE_PREFERENCE;
  notes.push(
    `Local content price preference ${(preference * 100).toFixed(0)}% applied in evaluation narrative (not altering line unit prices).`
  );
  findings.push(
    `BoQ generated with ${boqItems.length} lines from milestones; budget base ${budget} ${opts.currency ?? "SAR"}`
  );

  return {
    cashEquivalents: parsed.cashEquivalents,
    accountsReceivable: parsed.accountsReceivable,
    currentLiabilities: parsed.currentLiabilities,
    quickLiquidityRatio,
    qlrPasses,
    saudizationPercent,
    boqItems,
    localContentPreferenceApplied: preference,
    notes,
    findings,
  };
}
