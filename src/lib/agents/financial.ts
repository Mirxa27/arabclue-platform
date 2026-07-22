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

/**
 * Financial agent: qualification extraction + structure-only BoQ.
 * Never populates unitPrice/total — prices are human-entered only (product Section 2).
 */
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

  const milestones = opts.entities?.milestones ?? [
    { name: "Mobilization", weeks: 2 },
    { name: "Delivery", weeks: 20 },
  ];

  // Structure-only: item / unit / qty — prices always null (client-entered)
  const boqItems = milestones.map((m) => ({
    item: m.name,
    unit: "LS",
    qty: 1,
    unitPrice: null as number | null,
    total: null as number | null,
  }));

  const preference = LOCAL_CONTENT_PRICE_PREFERENCE;
  notes.push(
    "BoQ structure generated without prices. Enter unit prices and totals in the financial forms — ArabClue does not price bids."
  );
  notes.push(
    `Regulatory note: Local content / SME evaluation preference is ${(preference * 100).toFixed(0)}% under procurement law (evaluation rule only; not a bid price suggestion).`
  );
  findings.push(
    `BoQ structure generated with ${boqItems.length} lines (unitPrice/total blank for client entry)`
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
