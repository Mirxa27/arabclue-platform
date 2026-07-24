import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Display helper — clamp and round percent values for UI. */
export function formatPercent(value: number | null | undefined, digits = 0): string {
  if (value == null || Number.isNaN(Number(value))) return "0";
  const n = Math.min(100, Math.max(0, Number(value)));
  return digits > 0 ? n.toFixed(digits) : String(Math.round(n));
}
