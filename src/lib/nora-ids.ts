/**
 * Helpers for NORA / EA principle identifiers (TP*, SP*, BP*, IP*).
 * Used by ingestion extract and the export validation gate.
 */

import { COMPLIANCE_FRAMEWORKS } from "./constants";

const NORA_ID_RE = /\b((?:TP|SP|BP|IP)\d+)\b/gi;

/** Extract unique NORA-like principle IDs from free text. */
export function extractNoraIds(text: string | null | undefined): string[] {
  if (!text) return [];
  const found = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(NORA_ID_RE.source, NORA_ID_RE.flags);
  while ((m = re.exec(text)) !== null) {
    found.add(m[1].toUpperCase());
  }
  return [...found];
}

/**
 * Canonical NORA/EA principle IDs published in ArabClue's compliance catalog.
 * Referencing these in a draft is not "inventing" identifiers — inventing means
 * claiming tender-specific IDs that appear nowhere in tender or project scope.
 */
export function catalogNoraIds(): Set<string> {
  const ids = new Set<string>();
  for (const fw of COMPLIANCE_FRAMEWORKS) {
    if (
      fw.id === "NORA" ||
      fw.id.startsWith("EA_") ||
      fw.id.includes("TP") ||
      fw.id.includes("SP")
    ) {
      for (const id of extractNoraIds(`${fw.id} ${fw.name}`)) ids.add(id);
      for (const c of fw.controls) {
        for (const id of extractNoraIds(
          `${c.controlId} ${c.title} ${c.titleAr ?? ""}`
        )) {
          ids.add(id);
        }
      }
    }
  }
  return ids;
}

export function allowedNoraIdsFromSources(opts: {
  tenderIds?: string[];
  complianceTexts?: string[];
  includeCatalog?: boolean;
}): Set<string> {
  const allowed = new Set<string>();
  for (const id of opts.tenderIds ?? []) {
    if (id) allowed.add(id.toUpperCase());
  }
  for (const text of opts.complianceTexts ?? []) {
    for (const id of extractNoraIds(text)) allowed.add(id);
  }
  if (opts.includeCatalog !== false) {
    for (const id of catalogNoraIds()) allowed.add(id);
  }
  return allowed;
}
