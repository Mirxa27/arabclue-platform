import { spawn } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PHASE_TWO_PUBLIC_SOURCES = Object.freeze([
  "src/lib/bilingual-layout.tsx",
  "src/lib/layout-sync.ts",
  "src/lib/bilingual-typography.ts",
  "src/lib/bilingual-pdf.ts",
  "src/components/documents/bilingual/BilingualSection.tsx",
  "src/components/documents/bilingual/BilingualHeader.tsx",
  "src/components/documents/bilingual/BilingualTable.tsx",
  "src/components/documents/bilingual/BilingualList.tsx",
  "src/components/documents/bilingual/BilingualFooter.tsx",
  "src/components/documents/bilingual/index.ts",
  "src/components/documents/bilingual/types.ts",
] as const);

export const DOCUMENT_QUALITY_TEST_FILES = Object.freeze([
  "src/lib/__tests__/bilingual-layout.test.ts",
  "src/lib/__tests__/layout-sync.test.ts",
  "src/lib/__tests__/bilingual-typography.test.ts",
  "src/lib/__tests__/bilingual-components.test.tsx",
  "src/lib/__tests__/bilingual-pdf.test.ts",
  "src/lib/__tests__/pdf-generation.test.ts",
  "src/lib/__tests__/document-quality-gate.test.ts",
] as const);

export const DOCUMENT_BROWSER_TEST_FILE =
  "src/lib/__tests__/bilingual-browser-compatibility.test.ts";

export const DOCUMENT_COVERAGE_THRESHOLDS = Object.freeze({
  lines: 85,
  functions: 85,
} as const);

export interface FileCoverage {
  readonly source: string;
  readonly lines: Readonly<{
    covered: number;
    found: number;
    percentage: number;
  }>;
  readonly functions: Readonly<{
    covered: number;
    found: number;
    percentage: number;
  }>;
}

export interface DocumentCoverageReport {
  readonly valid: boolean;
  readonly files: readonly FileCoverage[];
  readonly missingSources: readonly string[];
  readonly totals: Readonly<{
    lines: FileCoverage["lines"];
    functions: FileCoverage["functions"];
  }>;
  readonly thresholds: Readonly<{
    lines: number;
    functions: number;
  }>;
  readonly failures: readonly string[];
}

interface MutableLcovRecord {
  source?: string;
  linesFound?: number;
  linesHit?: number;
  functionsFound?: number;
  functionsHit?: number;
}

function percentage(covered: number, found: number): number {
  return found === 0 ? 100 : (covered / found) * 100;
}

function parseMetric(rawValue: string, field: string, source: string): number {
  if (!/^\d+$/.test(rawValue)) {
    throw new Error(`Invalid ${field} value for ${source}: ${rawValue}`);
  }
  const value = Number(rawValue);
  if (!Number.isSafeInteger(value)) {
    throw new Error(`Unsafe ${field} value for ${source}: ${rawValue}`);
  }
  return value;
}

function normalizeSource(source: string, repositoryRoot: string): string {
  const normalized = source.replaceAll("\\", "/");
  const resolved = path.isAbsolute(normalized)
    ? path.relative(repositoryRoot, normalized)
    : normalized;
  return resolved.replaceAll("\\", "/").replace(/^\.\//, "");
}

/**
 * Parse the LCOV summary fields emitted by `bun test --coverage`.
 *
 * Duplicate source records and incomplete summaries are rejected so a malformed
 * report can never accidentally pass the quality gate.
 */
export function parseLcovCoverage(
  input: string,
  repositoryRoot: string
): ReadonlyMap<string, FileCoverage> {
  const records = new Map<string, FileCoverage>();
  let current: MutableLcovRecord | undefined;

  const commit = () => {
    if (!current) return;
    const source = current.source;
    if (!source) {
      throw new Error("LCOV record is missing an SF source field.");
    }
    const linesFound = current.linesFound;
    const linesHit = current.linesHit;
    const functionsFound = current.functionsFound;
    const functionsHit = current.functionsHit;
    if (
      linesFound === undefined ||
      linesHit === undefined ||
      functionsFound === undefined ||
      functionsHit === undefined
    ) {
      throw new Error(`LCOV record for ${source} is missing summary fields.`);
    }
    if (linesHit > linesFound || functionsHit > functionsFound) {
      throw new Error(`LCOV record for ${source} reports impossible coverage.`);
    }
    if (records.has(source)) {
      throw new Error(`LCOV report contains a duplicate source: ${source}`);
    }
    records.set(source, {
      source,
      lines: {
        covered: linesHit,
        found: linesFound,
        percentage: percentage(linesHit, linesFound),
      },
      functions: {
        covered: functionsHit,
        found: functionsFound,
        percentage: percentage(functionsHit, functionsFound),
      },
    });
    current = undefined;
  };

  for (const line of input.split(/\r?\n/)) {
    if (line.startsWith("SF:")) {
      if (current) {
        throw new Error("LCOV record started before the previous record ended.");
      }
      const source = normalizeSource(line.slice(3), repositoryRoot);
      if (!source) {
        throw new Error("LCOV SF source field must not be empty.");
      }
      current = { source };
      continue;
    }
    if (line === "end_of_record") {
      commit();
      continue;
    }
    if (!current) continue;

    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const field = line.slice(0, separator);
    const rawValue = line.slice(separator + 1);
    switch (field) {
      case "LF":
        current.linesFound = parseMetric(rawValue, field, current.source!);
        break;
      case "LH":
        current.linesHit = parseMetric(rawValue, field, current.source!);
        break;
      case "FNF":
        current.functionsFound = parseMetric(rawValue, field, current.source!);
        break;
      case "FNH":
        current.functionsHit = parseMetric(rawValue, field, current.source!);
        break;
      default:
        break;
    }
  }
  if (current) {
    throw new Error(`LCOV record for ${current.source} is not terminated.`);
  }
  return records;
}

export function evaluateDocumentCoverage(
  coverage: ReadonlyMap<string, FileCoverage>,
  expectedSources: readonly string[] = PHASE_TWO_PUBLIC_SOURCES,
  thresholds: Readonly<{ lines: number; functions: number }> =
    DOCUMENT_COVERAGE_THRESHOLDS
): DocumentCoverageReport {
  for (const [name, value] of Object.entries(thresholds)) {
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      throw new RangeError(`${name} coverage threshold must be between 0 and 100.`);
    }
  }

  const missingSources = expectedSources.filter((source) => !coverage.has(source));
  const files = expectedSources.flatMap((source) => {
    const result = coverage.get(source);
    return result ? [result] : [];
  });
  const lineTotals = files.reduce(
    (total, file) => ({
      covered: total.covered + file.lines.covered,
      found: total.found + file.lines.found,
    }),
    { covered: 0, found: 0 }
  );
  const functionTotals = files.reduce(
    (total, file) => ({
      covered: total.covered + file.functions.covered,
      found: total.found + file.functions.found,
    }),
    { covered: 0, found: 0 }
  );
  const totals = {
    lines: {
      ...lineTotals,
      percentage: percentage(lineTotals.covered, lineTotals.found),
    },
    functions: {
      ...functionTotals,
      percentage: percentage(functionTotals.covered, functionTotals.found),
    },
  };
  const failures: string[] = [];
  if (missingSources.length > 0) {
    failures.push(`Missing coverage for: ${missingSources.join(", ")}`);
  }
  if (lineTotals.found === 0) {
    failures.push("No executable lines were reported for the Phase 2 surface.");
  } else if (totals.lines.percentage < thresholds.lines) {
    failures.push(
      `Line coverage ${totals.lines.percentage.toFixed(2)}% is below ${thresholds.lines.toFixed(2)}%.`
    );
  }
  if (functionTotals.found === 0) {
    failures.push("No functions were reported for the Phase 2 surface.");
  } else if (totals.functions.percentage < thresholds.functions) {
    failures.push(
      `Function coverage ${totals.functions.percentage.toFixed(2)}% is below ${thresholds.functions.toFixed(2)}%.`
    );
  }

  return {
    valid: failures.length === 0,
    files,
    missingSources,
    totals,
    thresholds,
    failures,
  };
}

export function formatDocumentCoverageReport(
  report: DocumentCoverageReport
): string {
  const rows = report.files.map(
    (file) =>
      `${file.source}: ${file.lines.percentage.toFixed(2)}% lines, ` +
      `${file.functions.percentage.toFixed(2)}% functions`
  );
  rows.push(
    `Phase 2 total: ${report.totals.lines.percentage.toFixed(2)}% lines ` +
      `(${report.totals.lines.covered}/${report.totals.lines.found}), ` +
      `${report.totals.functions.percentage.toFixed(2)}% functions ` +
      `(${report.totals.functions.covered}/${report.totals.functions.found})`
  );
  if (report.failures.length > 0) {
    rows.push(...report.failures.map((failure) => `FAIL: ${failure}`));
  }
  return rows.join("\n");
}

async function runCommand(
  label: string,
  args: readonly string[],
  repositoryRoot: string,
  environment: NodeJS.ProcessEnv = process.env
): Promise<void> {
  process.stdout.write(`\n[document-quality] ${label}\n`);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [...args], {
      cwd: repositoryRoot,
      env: environment,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `${label} failed${signal ? ` with signal ${signal}` : ` with exit code ${String(code)}`}.`
        )
      );
    });
  });
}

async function main(): Promise<void> {
  const scriptPath = fileURLToPath(import.meta.url);
  const repositoryRoot = path.resolve(path.dirname(scriptPath), "..");
  const coverageDirectory = path.join(
    repositoryRoot,
    "coverage",
    "documents"
  );
  const lcovPath = path.join(coverageDirectory, "lcov.info");
  const lintFiles = [
    ...PHASE_TWO_PUBLIC_SOURCES,
    ...DOCUMENT_QUALITY_TEST_FILES,
    DOCUMENT_BROWSER_TEST_FILE,
    "scripts/check-document-quality.ts",
    "scripts/run-bilingual-browser-matrix.ts",
  ];

  await runCommand(
    "TypeScript",
    [
      "node_modules/typescript/bin/tsc",
      "--noEmit",
      "--incremental",
      "false",
    ],
    repositoryRoot
  );
  await runCommand(
    "ESLint",
    ["node_modules/eslint/bin/eslint.js", ...lintFiles],
    repositoryRoot
  );

  await rm(coverageDirectory, { recursive: true, force: true });
  await mkdir(coverageDirectory, { recursive: true });
  await runCommand(
    "offline tests and coverage",
    [
      "test",
      "--coverage",
      "--coverage-reporter=lcov",
      `--coverage-dir=${coverageDirectory}`,
      ...DOCUMENT_QUALITY_TEST_FILES,
    ],
    repositoryRoot,
    {
      ...process.env,
      CI: "1",
      PLAYWRIGHT_CHROMIUM: "0",
      TZ: "UTC",
    }
  );

  const report = evaluateDocumentCoverage(
    parseLcovCoverage(await readFile(lcovPath, "utf8"), repositoryRoot)
  );
  process.stdout.write(`\n${formatDocumentCoverageReport(report)}\n`);
  if (!report.valid) {
    process.exitCode = 1;
  }
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`\n[document-quality] ${message}\n`);
    process.exitCode = 1;
  });
}
