export function trendPct(current: number, previous: number): number | null {
  if (current === 0 && previous === 0) return null;
  if (previous === 0 && current > 0) return 100;

  return Math.round(((current - previous) / previous) * 100);
}
