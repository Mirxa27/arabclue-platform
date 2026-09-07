/**
 * One list from two sources. Deterministic findings are kept as they are; a
 * model finding is dropped when a finding of the same kind already rests on
 * the same sentence (shared fingerprint, or a quote that contains / is
 * contained by an existing quote of the same kind).
 */

import { normalizeForMatch } from "./text";
import { SEVERITY_RANK, type Finding } from "./types";

function overlaps(a: string, b: string): boolean {
  const na = normalizeForMatch(a);
  const nb = normalizeForMatch(b);
  if (na.length < 20 || nb.length < 20) return na === nb;
  return na.includes(nb) || nb.includes(na);
}

export function mergeFindings(
  deterministic: readonly Finding[],
  model: readonly Finding[]
): Finding[] {
  const out: Finding[] = [...deterministic];
  const seen = new Set(deterministic.map((f) => f.fingerprint));
  for (const f of model) {
    if (seen.has(f.fingerprint)) continue;
    const duplicate = out.some(
      (existing) =>
        existing.kind === f.kind &&
        existing.quotes.some((eq) => f.quotes.some((fq) => overlaps(eq.text, fq.text)))
    );
    if (duplicate) continue;
    seen.add(f.fingerprint);
    out.push(f);
  }
  return out
    .map((f, i) => ({ f, i }))
    .sort((a, b) => SEVERITY_RANK[a.f.severity] - SEVERITY_RANK[b.f.severity] || a.i - b.i)
    .map(({ f }) => f);
}
