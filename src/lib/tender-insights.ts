/**
 * Tender Insights aggregation — total budget distribution across active tenders
 * by category. Pure functions so they are unit-testable without a DB.
 */

import { TENDER_TYPES } from "./constants";

/** Statuses that count as an "active" tender (matches /api/stats KPI). */
export const ACTIVE_TENDER_STATUSES = [
  "DRAFT",
  "PARSING",
  "DRAFTING",
  "REVIEW",
] as const;

export type ActiveTenderStatus = (typeof ACTIVE_TENDER_STATUSES)[number];

export type TenderInsightProject = {
  category: string | null;
  budget: number | null;
  currency?: string | null;
  status: string;
};

export type TenderInsightRow = {
  /** Normalized category key (TENDER_TYPES id, or "UNCATEGORIZED"). */
  category: string;
  label: string;
  labelAr: string;
  color: string;
  totalBudget: number;
  count: number;
  /** Percentage of total active budget (0–100, rounded to 1 decimal). */
  share: number;
};

export type TenderInsights = {
  rows: TenderInsightRow[];
  totalBudget: number;
  activeCount: number;
  currency: string;
};

const UNCATEGORIZED_COLOR = "#64748b";

export function isActiveTenderStatus(status: string): boolean {
  return (ACTIVE_TENDER_STATUSES as readonly string[]).includes(status);
}

/**
 * Aggregate active tenders into per-category budget rows, sorted by budget desc.
 */
export function aggregateTenderInsights(
  projects: TenderInsightProject[]
): TenderInsights {
  const active = projects.filter((p) => isActiveTenderStatus(p.status));

  const buckets = new Map<
    string,
    { label: string; labelAr: string; color: string; total: number; count: number }
  >();
  let currency = "SAR";

  for (const p of active) {
    if (p.currency && !currency) currency = p.currency;
    if (p.currency) currency = p.currency;

    const known = TENDER_TYPES.find((t) => t.id === p.category);
    const key = known?.id ?? "UNCATEGORIZED";
    const existing = buckets.get(key);
    const budget = typeof p.budget === "number" && p.budget > 0 ? p.budget : 0;

    if (existing) {
      existing.total += budget;
      existing.count += 1;
    } else {
      buckets.set(key, {
        label: known?.name ?? "Uncategorized",
        labelAr: known?.nameAr ?? "غير مصنّف",
        color: known?.color ?? UNCATEGORIZED_COLOR,
        total: budget,
        count: 1,
      });
    }
  }

  const totalBudget = [...buckets.values()].reduce((a, b) => a + b.total, 0);

  const rows: TenderInsightRow[] = [...buckets.entries()]
    .map(([category, v]) => ({
      category,
      label: v.label,
      labelAr: v.labelAr,
      color: v.color,
      totalBudget: v.total,
      count: v.count,
      share:
        totalBudget > 0
          ? Math.round((v.total / totalBudget) * 1000) / 10
          : 0,
    }))
    .sort((a, b) => b.totalBudget - a.totalBudget || b.count - a.count);

  return {
    rows,
    totalBudget,
    activeCount: active.length,
    currency,
  };
}

/** Compact SAR formatting for chart axes / labels (e.g. 25M, 1.5B). */
export function formatBudgetCompact(
  amount: number,
  locale: "ar" | "en" = "en"
): string {
  const abs = Math.abs(amount);
  const sar = locale === "ar" ? "ر.س" : "SAR";
  if (abs >= 1_000_000_000) {
    return `${(amount / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B ${sar}`;
  }
  if (abs >= 1_000_000) {
    return `${(amount / 1_000_000).toFixed(1).replace(/\.0$/, "")}M ${sar}`;
  }
  if (abs >= 1_000) {
    return `${(amount / 1_000).toFixed(0)}K ${sar}`;
  }
  return `${amount.toLocaleString(locale === "ar" ? "ar-SA" : "en-US")} ${sar}`;
}
