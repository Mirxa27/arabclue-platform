export function trendPct(current: number, previous: number): number | null {
  if (current === 0 && previous === 0) return null;
  if (previous === 0 && current > 0) return 100;

  return Math.round(((current - previous) / previous) * 100);
}

/** Coerce missing/undefined API trend values to null so UI never fabricates arrows. */
export function resolveTrend(value: number | null | undefined): number | null {
  return value ?? null;
}
