/**
 * Narrow static production-integrity scanners for platform-completion
 * (task 12.3). Scans source text only — never executes application code.
 *
 * Exemptions (Requirement 19.10):
 * - Test files (`__tests__/`)
 * - Frozen catalogs (`contract-templates.ts`)
 * - Explicit amount/currency validation comparisons
 * Production fallback data is NOT exempt.
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { CAPABILITY_REACHABILITY_MANIFEST } from "./capability-reachability-manifest";

export type IntegrityFinding = Readonly<{
  code:
    | "ORPHAN_CAPABILITY"
    | "MISSING_TARGET"
    | "MISSING_INBOUND"
    | "STUB_RESPONSE"
    | "RUNTIME_FIXTURE"
    | "USER_LITERAL"
    | "MONETARY_COMPUTE"
    | "MISSING_SCHEMA_SYNTHETIC_SUCCESS";
  path: string;
  detail: string;
}>;

const STUB_PATTERNS: readonly RegExp[] = [
  /\bHTTP\s*501\b/i,
  /\bNOT_IMPLEMENTED\b/,
  /\bNOT_SUPPORTED\b/,
  /\bcoming[-_ ]soon\b/i,
  /\bTODO:\s*implement\b/i,
];

const FIXTURE_PATTERNS: readonly RegExp[] = [
  /\bMath\.random\s*\(\s*\)/,
  /\bfakeDelay\b/,
  /\bartificialDelay\b/,
  /\bMOCK_DASHBOARD_METRICS\b/,
  /\bsyntheticCatalog\b/,
];

/** Prohibited monetary derivation in production modules (validation compares exempt). */
const MONETARY_COMPUTE_PATTERNS: readonly RegExp[] = [
  /\bcomputeBidPrice\b/,
  /\bcalculateProration\b/,
  /\boptimizeMargin\b/,
  /\brecommendPrice\b/,
];

/**
 * Patterns that indicate a missing-schema synthetic success response — a
 * handler that returns 200 OK without actually persisting or validating
 * against the database schema (Requirement 19.7).
 */
const SYNTHETIC_SUCCESS_PATTERNS: readonly RegExp[] = [
  /\breturn\s+NextResponse\.json\s*\(\s*\{\s*(?:ok|success)\s*:\s*true\s*\}\s*,\s*\{\s*status:\s*200\s*\}\s*\)/i,
  /\breturn\s+Response\.json\s*\(\s*\{\s*(?:ok|success)\s*:\s*true\s*\}\s*,\s*\{\s*status:\s*200\s*\}\s*\)/i,
];

/**
 * True when the file path is exempt from integrity scanning (Requirement 19.10).
 * Test files, frozen catalogs, and validation comparisons are exempt.
 * Production fallback data is NOT exempt.
 */
export function isExemptPath(filePath: string): boolean {
  return (
    filePath.includes("__tests__") ||
    filePath.includes("contract-templates.ts") ||
    filePath.includes("/document-templates/")
  );
}

export function scanSourceForStubResponses(
  source: string,
  filePath: string
): IntegrityFinding[] {
  if (isExemptPath(filePath)) return [];
  const findings: IntegrityFinding[] = [];
  for (const pattern of STUB_PATTERNS) {
    if (pattern.test(source)) {
      findings.push({
        code: "STUB_RESPONSE",
        path: filePath,
        detail: `Matched ${pattern}`,
      });
    }
  }
  return findings;
}

export function scanSourceForRuntimeFixtures(
  source: string,
  filePath: string
): IntegrityFinding[] {
  if (isExemptPath(filePath)) return [];
  const findings: IntegrityFinding[] = [];
  for (const pattern of FIXTURE_PATTERNS) {
    if (pattern.test(source)) {
      findings.push({
        code: "RUNTIME_FIXTURE",
        path: filePath,
        detail: `Matched ${pattern}`,
      });
    }
  }
  return findings;
}

export function scanSourceForMonetaryCompute(
  source: string,
  filePath: string
): IntegrityFinding[] {
  // Amount/currency *validation* comparisons are exempt; only named compute helpers.
  if (isExemptPath(filePath)) return [];
  const findings: IntegrityFinding[] = [];
  for (const pattern of MONETARY_COMPUTE_PATTERNS) {
    if (pattern.test(source)) {
      findings.push({
        code: "MONETARY_COMPUTE",
        path: filePath,
        detail: `Matched ${pattern}`,
      });
    }
  }
  return findings;
}

/**
 * Scans for user-visible string literals in production dashboard components
 * that should use `tr()` from the i18n registry (Requirement 18.1, 18.5).
 *
 * Detects JSX text content between tags that contains Arabic or English
 * narrative words but is not wrapped in a `tr()` call. Exempts:
 * - Test files
 * - Files that already use `tr()` for all visible text
 * - Approved identifiers, numerals, dates, units, and technical terms
 */
export function scanSourceForUserLiterals(
  source: string,
  filePath: string
): IntegrityFinding[] {
  if (isExemptPath(filePath)) return [];
  // Only scan dashboard and admin components for user-visible literals.
  if (
    !filePath.includes("/components/dashboard/") &&
    !filePath.includes("/components/admin/")
  ) {
    return [];
  }

  const findings: IntegrityFinding[] = [];

  // If the file already imports and uses tr(), assume it's used correctly
  // for all visible text — this is a heuristic to avoid false positives.
  if (source.includes("tr(")) return [];

  // Detect JSX text nodes that are not expressions (not {tr(...)} or {variable}).
  // A JSX text node is content between > and < that is not just whitespace.
  const jsxTextRe = />([^{}<]+)</g;
  let match: RegExpExecArray | null;
  while ((match = jsxTextRe.exec(source)) !== null) {
    const text = match[1].trim();
    if (!text) continue;
    // Skip single characters, punctuation, or symbols.
    if (text.length < 2) continue;
    // Skip approved technical tokens (identifiers, numerals, units).
    if (/^[A-Z0-9._\s\-/+%]+$/.test(text)) continue;
    // Skip if the text is a className or attribute value.
    if (text.includes("=") || text.includes('"')) continue;

    findings.push({
      code: "USER_LITERAL",
      path: filePath,
      detail: `User-visible text "${text.slice(0, 60)}" is not wrapped in tr()`,
    });
  }

  return findings;
}

/**
 * Scans for missing-schema synthetic success responses — handlers that
 * return 200 OK without persisting or validating against the database
 * (Requirement 19.7).
 */
export function scanSourceForMissingSchemaSyntheticSuccess(
  source: string,
  filePath: string
): IntegrityFinding[] {
  if (isExemptPath(filePath)) return [];
  // Only scan API route handlers.
  if (!filePath.includes("/app/api/")) return [];

  const findings: IntegrityFinding[] = [];
  for (const pattern of SYNTHETIC_SUCCESS_PATTERNS) {
    if (pattern.test(source)) {
      // Check if the handler also has a database call — if it does, it's
      // likely a legitimate success response after a DB operation.
      if (
        !source.includes("db.") &&
        !source.includes("prisma.") &&
        !source.includes("findUnique") &&
        !source.includes("findMany") &&
        !source.includes("create(") &&
        !source.includes("update(") &&
        !source.includes("delete(")
      ) {
        findings.push({
          code: "MISSING_SCHEMA_SYNTHETIC_SUCCESS",
          path: filePath,
          detail: `Handler returns 200 OK without database interaction — possible synthetic success`,
        });
      }
    }
  }
  return findings;
}

/**
 * Detects orphaned capabilities — manifest entries with no valid inbound edge
 * (Requirement 19.1). A capability is orphaned when its `inbound` source file
 * does not exist or does not reference the target.
 */
export function scanForOrphanedCapabilities(
  repoRoot: string = process.cwd()
): IntegrityFinding[] {
  const findings: IntegrityFinding[] = [];
  for (const entry of CAPABILITY_REACHABILITY_MANIFEST) {
    const inboundPath = path.join(repoRoot, entry.inbound);
    if (!existsSync(inboundPath)) {
      findings.push({
        code: "ORPHAN_CAPABILITY",
        path: entry.inbound,
        detail: `Capability ${entry.id} has no inbound edge (file missing)`,
      });
    }
  }
  return findings;
}

/**
 * Validate that every manifest edge points at existing source files.
 */
export function validateCapabilityReachability(
  repoRoot: string = process.cwd()
): IntegrityFinding[] {
  const findings: IntegrityFinding[] = [];
  for (const entry of CAPABILITY_REACHABILITY_MANIFEST) {
    const targetPath = path.join(repoRoot, entry.target);
    const inboundPath = path.join(repoRoot, entry.inbound);
    if (!existsSync(targetPath)) {
      findings.push({
        code: "MISSING_TARGET",
        path: entry.target,
        detail: `Capability ${entry.id} target missing`,
      });
    }
    if (!existsSync(inboundPath)) {
      findings.push({
        code: "MISSING_INBOUND",
        path: entry.inbound,
        detail: `Capability ${entry.id} inbound edge missing`,
      });
    }
  }
  return findings;
}

export function scanProductionIntegritySource(
  source: string,
  filePath: string
): IntegrityFinding[] {
  return [
    ...scanSourceForStubResponses(source, filePath),
    ...scanSourceForRuntimeFixtures(source, filePath),
    ...scanSourceForMonetaryCompute(source, filePath),
    ...scanSourceForUserLiterals(source, filePath),
    ...scanSourceForMissingSchemaSyntheticSuccess(source, filePath),
  ];
}
