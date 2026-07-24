import type { ReactNode } from "react";

export type BilingualLayoutMode =
  | "parallel"
  | "serial-ar-first"
  | "serial-en-first";

export interface LocalizedNode {
  en: ReactNode;
  ar: ReactNode;
}

export interface BilingualContinuation {
  fragment: number;
  totalFragments: number;
}

export function normalizeColumnRatio(
  ratio: readonly [number, number] | undefined
): readonly [number, number] {
  if (!ratio) return [1, 1];

  const [english, arabic] = ratio;
  if (
    !Number.isFinite(english) ||
    !Number.isFinite(arabic) ||
    english <= 0 ||
    arabic <= 0
  ) {
    return [1, 1];
  }

  return [english, arabic];
}

