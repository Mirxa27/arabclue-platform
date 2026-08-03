/**
 * Deterministic post-agent validation gate.
 * Failed validation blocks final export.
 */

import { detectPricingSuggestion } from "./guardrails";
import { allowedNoraIdsFromSources, extractNoraIds } from "./nora-ids";
import type {
  ComplianceMatrixRow,
  FinancialExtract,
  IngestionEntities,
} from "./types";

export type ValidationIssue = {
  code: string;
  severity: "error" | "warning";
  message: string;
  path?: string;
};

export type ValidationReport = {
  ok: boolean;
  blocking: boolean;
  issues: ValidationIssue[];
  checkedAt: string;
};

const PLACEHOLDER_RE =
  /\b(lorem ipsum|TODO|FIXME|TBD|\[insert|\[placeholder|xxx+)\b/i;

const ARABIC_SCRIPT_RE = /[\u0600-\u06FF]/u;
const LATIN_LETTER_RE = /[A-Za-z]/u;

/**
 * Strip approved identifiers, numerals, dates, units, and technical tokens so
 * language-purity checks do not punish user-authored content that mixes them
 * with narrative text (Req 18.10).
 */
export function stripApprovedTechnicalTokens(text: string): string {
  return text
    .replace(/\bNORA[-_\s]?[A-Z0-9.]+\b/gi, " ")
    .replace(/\bEA[-_\s]?[A-Z0-9.]+\b/gi, " ")
    .replace(/\b[A-Z]{2,}\d{2,}[A-Z0-9.-]*\b/g, " ")
    .replace(/\bhttps?:\/\/\S+/gi, " ")
    .replace(/\b[\w.+-]+@[\w.-]+\.\w+\b/g, " ")
    .replace(/\b\d{1,4}([./-]\d{1,4}){1,2}\b/g, " ")
    .replace(/\b\d+([.,]\d+)?\s?(%|SAR|USD|kg|km|m2|GB|MB)?\b/gi, " ")
    .replace(/[{{}\[\]()]/g, " ");
}

export type DocumentLanguageSection = Readonly<{
  key: string;
  arabic?: string | null;
  english?: string | null;
}>;

export type DocumentLanguageFinding = Readonly<{
  code: "DOCUMENT_LANGUAGE_MISSING" | "DOCUMENT_LANGUAGE_INVALID";
  section: string;
  language: "ar" | "en";
}>;

/**
 * Pure bilingual section purity check. Empty optional locales are ignored;
 * required locales must be non-empty and match the expected script after
 * technical-token stripping.
 */
export function assessDocumentLanguagePurity(
  sections: readonly DocumentLanguageSection[],
  required: Readonly<{ arabic: boolean; english: boolean }> = {
    arabic: true,
    english: true,
  }
): readonly DocumentLanguageFinding[] {
  const findings: DocumentLanguageFinding[] = [];
  for (const section of sections) {
    if (required.arabic) {
      const raw = (section.arabic ?? "").trim();
      if (!raw) {
        findings.push({
          code: "DOCUMENT_LANGUAGE_MISSING",
          section: section.key,
          language: "ar",
        });
      } else if (!ARABIC_SCRIPT_RE.test(raw)) {
        // Arabic narrative must contain Arabic script. Pure technical tokens /
        // numerals alone are not sufficient for a required Arabic field.
        findings.push({
          code: "DOCUMENT_LANGUAGE_INVALID",
          section: section.key,
          language: "ar",
        });
      }
    }
    if (required.english) {
      const raw = (section.english ?? "").trim();
      if (!raw) {
        findings.push({
          code: "DOCUMENT_LANGUAGE_MISSING",
          section: section.key,
          language: "en",
        });
      } else {
        const narrative = stripApprovedTechnicalTokens(raw);
        if (!LATIN_LETTER_RE.test(raw)) {
          findings.push({
            code: "DOCUMENT_LANGUAGE_INVALID",
            section: section.key,
            language: "en",
          });
        } else if (
          ARABIC_SCRIPT_RE.test(narrative) &&
          !LATIN_LETTER_RE.test(narrative)
        ) {
          // English field that is only Arabic script after stripping tokens.
          findings.push({
            code: "DOCUMENT_LANGUAGE_INVALID",
            section: section.key,
            language: "en",
          });
        }
      }
    }
  }
  return findings;
}

function dedupeIssues(issues: ValidationIssue[]): ValidationIssue[] {
  const seen = new Set<string>();
  const out: ValidationIssue[] = [];
  for (const issue of issues) {
    const key = `${issue.code}|${issue.message}|${issue.path ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(issue);
  }
  return out;
}

export function validateProposalOutput(opts: {
  contentMd: string | null | undefined;
  financial: FinancialExtract | null | undefined;
  entities: IngestionEntities | null | undefined;
  complianceRows: ComplianceMatrixRow[] | null | undefined;
  restrictions?: string[];
  approvedEvidenceIds?: string[];
  claimedEvidenceIds?: string[];
  /** Optional bilingual section map for language-purity checks (Req 18.10). */
  bilingualSections?: readonly DocumentLanguageSection[];
}): ValidationReport {
  const issues: ValidationIssue[] = [];
  const md = opts.contentMd ?? "";

  if (!md.trim()) {
    issues.push({
      code: "empty_proposal",
      severity: "error",
      message: "Proposal content is empty",
    });
  }

  if (detectPricingSuggestion(md)) {
    issues.push({
      code: "pricing_language",
      severity: "error",
      message: "Proposal contains pricing recommendation language",
      path: "contentMd",
    });
  }

  if (PLACEHOLDER_RE.test(md)) {
    issues.push({
      code: "unresolved_placeholder",
      severity: "error",
      message: "Unresolved placeholder or lorem ipsum remains in proposal",
      path: "contentMd",
    });
  }

  // Fabricated NORA IDs — allow tender extracts, project compliance scope, and
  // the platform NORA/EA catalog. Block only truly invented identifiers (e.g. TP99).
  const tenderNora = (opts.entities?.noraPrinciplesFromTender ?? []).map(
    (p) => p.id
  );
  const complianceTexts = (opts.complianceRows ?? []).flatMap((r) => [
    r.frameworkId,
    r.controlId,
    r.title,
    r.evidence ?? "",
  ]);
  const allowedNora = allowedNoraIdsFromSources({
    tenderIds: tenderNora,
    complianceTexts,
    includeCatalog: true,
  });

  const inventedNora = extractNoraIds(md).filter((id) => !allowedNora.has(id));
  for (const id of inventedNora) {
    issues.push({
      code: "invented_nora_id",
      severity: "error",
      message: `NORA identifier ${id} is not present in tender extract, project compliance scope, or the NORA/EA catalog`,
      path: "contentMd",
    });
  }

  // Blanket 10% preference without tender statement
  if (
    /\b10\s*%/.test(md) &&
    /local\s*content|محتوى\s*محلي|sme/i.test(md) &&
    opts.financial?.localContentPreferenceApplied == null &&
    opts.entities?.localContentPreferencePercent == null
  ) {
    issues.push({
      code: "blanket_local_content_preference",
      severity: "error",
      message:
        "Proposal asserts a local-content preference percentage not present in tender",
      path: "contentMd",
    });
  }

  if (opts.financial?.boqItems) {
    for (const [i, line] of opts.financial.boqItems.entries()) {
      if (line.unitPrice != null || line.total != null) {
        issues.push({
          code: "ai_priced_boq",
          severity: "error",
          message: `BoQ line ${i + 1} has AI-populated prices`,
          path: `financial.boqItems[${i}]`,
        });
      }
    }
  }

  const restrictions = opts.restrictions ?? [];
  for (const r of restrictions) {
    if (r.trim() && md.toLowerCase().includes(r.toLowerCase())) {
      issues.push({
        code: "restricted_content",
        severity: "error",
        message: `Restricted content leaked into proposal: "${r.slice(0, 40)}"`,
        path: "contentMd",
      });
    }
  }

  // Mandatory requirements representation
  const reqs = opts.entities?.requirements ?? [];
  const missingReqs = reqs.filter((r) => {
    const snippet = r.text.slice(0, 40).toLowerCase();
    return snippet.length > 8 && !md.toLowerCase().includes(snippet);
  });
  if (missingReqs.length > 0 && reqs.length > 0) {
    issues.push({
      code: "mandatory_requirement_gap",
      severity: "warning",
      message: `${missingReqs.length} extracted requirement(s) not clearly represented in draft`,
    });
  }

  // Evidence ID integrity
  const approved = new Set(opts.approvedEvidenceIds ?? []);
  for (const id of opts.claimedEvidenceIds ?? []) {
    if (!approved.has(id)) {
      issues.push({
        code: "unapproved_evidence",
        severity: "error",
        message: `Claim references unapproved or unknown evidence ${id}`,
      });
    }
  }

  // Compliance rows requiring legal review should not be presented as settled law
  const legalRows = (opts.complianceRows ?? []).filter(
    (r) => r.status === "LEGAL_REVIEW_REQUIRED"
  );
  if (legalRows.length && !/not legal advice|ليست استشارة قانونية/i.test(md)) {
    issues.push({
      code: "missing_legal_disclaimer",
      severity: "warning",
      message:
        "Legal-review-required compliance rows present without legal-advice disclaimer in draft",
    });
  }

  if (opts.bilingualSections && opts.bilingualSections.length > 0) {
    for (const finding of assessDocumentLanguagePurity(opts.bilingualSections)) {
      issues.push({
        code: finding.code,
        severity: "error",
        message:
          finding.code === "DOCUMENT_LANGUAGE_MISSING"
            ? `Section ${finding.section} is missing ${finding.language} content`
            : `Section ${finding.section} content does not match ${finding.language}`,
        path: `sections.${finding.section}.${finding.language}`,
      });
    }
  }

  const unique = dedupeIssues(issues);
  const errors = unique.filter((i) => i.severity === "error");
  return {
    ok: errors.length === 0,
    blocking: errors.length > 0,
    issues: unique,
    checkedAt: new Date().toISOString(),
  };
}

export function assertExportAllowed(report: ValidationReport): void {
  if (report.blocking) {
    const codes = [
      ...new Set(
        report.issues
          .filter((i) => i.severity === "error")
          .map((i) => i.code)
      ),
    ].join(", ");
    throw new Error(`Export blocked by validation gate: ${codes}`);
  }
}

/** Human-readable summary for toasts (deduped, capped). */
export function formatValidationToast(
  report: ValidationReport,
  locale: "ar" | "en" = "en"
): string {
  const errors = report.issues.filter((i) => i.severity === "error");
  if (errors.length === 0) {
    return locale === "ar" ? "تم تجاوز بوابة التحقق" : "Validation passed";
  }
  const uniqueMsgs = [
    ...new Set(errors.map((e) => e.message || e.code)),
  ].slice(0, 4);
  const more =
    errors.length > uniqueMsgs.length
      ? locale === "ar"
        ? ` (+${errors.length - uniqueMsgs.length} أخرى)`
        : ` (+${errors.length - uniqueMsgs.length} more)`
      : "";
  return uniqueMsgs.join(" · ") + more;
}
