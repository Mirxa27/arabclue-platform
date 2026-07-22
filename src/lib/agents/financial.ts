import {
  computeQuickLiquidityRatio,
  extractLocalContentPreference,
  extractQlrThreshold,
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
 * Never applies a blanket local-content preference percentage.
 */
export function runFinancialAgent(opts: {
  financialText: string;
  entities: IngestionEntities | null;
  projectBudget: number | null;
  currency?: string;
  tenderText?: string;
}): FinancialExtract & { findings: string[] } {
  const parsed = parseFinancialText(opts.financialText);
  const notes: string[] = [];
  const findings: string[] = [];
  const tenderCorpus = `${opts.tenderText ?? ""}\n${opts.entities?.rawTextExcerpt ?? ""}`;

  let quickLiquidityRatio: number | null = null;
  let qlrPasses: boolean | null = null;
  let qlrThreshold: number | null = extractQlrThreshold(tenderCorpus);
  let qlrFormula: string | null = null;

  if (
    parsed.cashEquivalents != null &&
    parsed.accountsReceivable != null &&
    parsed.currentLiabilities != null
  ) {
    const qlr = computeQuickLiquidityRatio(
      {
        cashEquivalents: parsed.cashEquivalents,
        accountsReceivable: parsed.accountsReceivable,
        currentLiabilities: parsed.currentLiabilities,
      },
      qlrThreshold
    );
    quickLiquidityRatio = qlr.ratio;
    qlrPasses = qlr.passes;
    qlrFormula = qlr.formula;
    findings.push(
      qlrThreshold == null
        ? `QLR = ${qlr.ratio} via ${qlr.formula} (no tender threshold — pass/fail not interpreted)`
        : `QLR = ${qlr.ratio} via ${qlr.formula} vs tender threshold ${qlrThreshold} → ${qlr.passes ? "PASS" : "FAIL"}`
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
      `Saudization ${saudizationPercent}% extracted from statements (internal narrative guideline ${SAUDIZATION_DEFAULT_MIN}% is not a tender fact)`
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

  const lc =
    opts.entities?.localContentPreferencePercent != null
      ? {
          preferencePercent: opts.entities.localContentPreferencePercent,
          originalWording: opts.entities.localContentOriginalWording,
        }
      : extractLocalContentPreference(tenderCorpus);
  const preference = lc.preferencePercent;

  notes.push(
    "BoQ structure generated without prices. Enter unit prices and totals in the financial forms — ArabClue does not price bids."
  );
  if (preference != null) {
    notes.push(
      `Regulatory note (EXPLICIT_TENDER only): Local content / SME evaluation preference ${preference}% stated in tender — evaluation fact, not a bid price suggestion.`
    );
  } else {
    notes.push(
      "No tender-stated local-content preference percentage found. No blanket preference applied."
    );
  }
  findings.push(
    `BoQ structure generated with ${boqItems.length} lines (unitPrice/total blank for client entry)`
  );

  return {
    cashEquivalents: parsed.cashEquivalents,
    accountsReceivable: parsed.accountsReceivable,
    currentLiabilities: parsed.currentLiabilities,
    quickLiquidityRatio,
    qlrPasses,
    qlrThreshold,
    qlrFormula,
    saudizationPercent,
    boqItems,
    localContentPreferenceApplied: preference,
    notes,
    findings,
  };
}
