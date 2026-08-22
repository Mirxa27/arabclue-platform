/**
 * SAR money helpers for Prisma `Decimal @db.Decimal(12, 2)` columns.
 *
 * Storage is exact. JSON responses still expose a JavaScript number so the
 * existing admin and billing UI keep working. Comparisons go through the
 * exact-decimal reader, not IEEE-754 subtraction.
 */

export type MoneyInput = number | string | { toString(): string };

export function moneyLiteral(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return String(value);
  }
  if (typeof value === "string") {
    const text = value.trim();
    return text.length > 0 ? text : null;
  }
  if (typeof value === "object" && typeof value.toString === "function") {
    const text = value.toString().trim();
    if (!text || text === "[object Object]") return null;
    return text;
  }
  return null;
}

export function moneyNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(moneyLiteral(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function withPublicMoney<T extends Record<string, unknown>>(
  row: T,
  keys: readonly string[]
): T {
  const out = { ...row };
  for (const key of keys) {
    if (out[key] != null) {
      (out as Record<string, unknown>)[key] = moneyNumber(out[key]);
    }
  }
  return out;
}

export const PLAN_MONEY_KEYS = ["priceMonthly", "priceYearly"] as const;
export const AMOUNT_MONEY_KEYS = ["amount"] as const;
