import { describe, expect, test } from "bun:test";
import {
  evaluateDocumentCoverage,
  formatDocumentCoverageReport,
  parseLcovCoverage,
} from "../../../scripts/check-document-quality";

const root = "/workspace/arabclue-platform";

function record(
  source: string,
  lines: readonly [hit: number, found: number],
  functions: readonly [hit: number, found: number]
): string {
  return [
    "TN:",
    `SF:${source}`,
    `FNF:${String(functions[1])}`,
    `FNH:${String(functions[0])}`,
    `LF:${String(lines[1])}`,
    `LH:${String(lines[0])}`,
    "end_of_record",
  ].join("\n");
}

describe("document coverage quality gate", () => {
  test("parses relative and repository-absolute LCOV sources", () => {
    const parsed = parseLcovCoverage(
      [
        record("src/lib/a.ts", [9, 10], [2, 2]),
        record(`${root}/src/lib/b.ts`, [8, 10], [3, 4]),
      ].join("\n"),
      root
    );

    expect(parsed.get("src/lib/a.ts")).toEqual({
      source: "src/lib/a.ts",
      lines: { covered: 9, found: 10, percentage: 90 },
      functions: { covered: 2, found: 2, percentage: 100 },
    });
    expect(parsed.get("src/lib/b.ts")?.lines.percentage).toBe(80);
  });

  test("passes only when every allow-listed source and aggregate metric passes", () => {
    const parsed = parseLcovCoverage(
      [
        record("src/lib/a.ts", [9, 10], [9, 10]),
        record("src/lib/b.ts", [8, 10], [8, 10]),
      ].join("\n"),
      root
    );
    const report = evaluateDocumentCoverage(
      parsed,
      ["src/lib/a.ts", "src/lib/b.ts"],
      { lines: 85, functions: 85 }
    );

    expect(report.valid).toBe(true);
    expect(report.missingSources).toEqual([]);
    expect(report.totals.lines).toEqual({
      covered: 17,
      found: 20,
      percentage: 85,
    });
    expect(formatDocumentCoverageReport(report)).toContain(
      "Phase 2 total: 85.00% lines"
    );
  });

  test("fails closed for a missing source or an aggregate below threshold", () => {
    const parsed = parseLcovCoverage(
      record("src/lib/a.ts", [8, 10], [8, 10]),
      root
    );
    const report = evaluateDocumentCoverage(
      parsed,
      ["src/lib/a.ts", "src/lib/missing.ts"],
      { lines: 85, functions: 85 }
    );

    expect(report.valid).toBe(false);
    expect(report.missingSources).toEqual(["src/lib/missing.ts"]);
    expect(report.failures).toEqual([
      "Missing coverage for: src/lib/missing.ts",
      "Line coverage 80.00% is below 85.00%.",
      "Function coverage 80.00% is below 85.00%.",
    ]);
  });

  test("rejects malformed, impossible, duplicate, and unterminated records", () => {
    expect(() =>
      parseLcovCoverage(
        record("src/lib/a.ts", [11, 10], [1, 1]),
        root
      )
    ).toThrow("impossible coverage");
    expect(() =>
      parseLcovCoverage(
        [
          record("src/lib/a.ts", [1, 1], [1, 1]),
          record("src/lib/a.ts", [1, 1], [1, 1]),
        ].join("\n"),
        root
      )
    ).toThrow("duplicate source");
    expect(() =>
      parseLcovCoverage("SF:src/lib/a.ts\nLF:not-a-number", root)
    ).toThrow("Invalid LF value");
    expect(() =>
      parseLcovCoverage(
        "SF:src/lib/a.ts\nFNF:1\nFNH:1\nLF:1\nLH:1",
        root
      )
    ).toThrow("not terminated");
  });

  test("rejects invalid thresholds and empty executable totals", () => {
    const emptyRecord = parseLcovCoverage(
      record("src/lib/types.ts", [0, 0], [0, 0]),
      root
    );

    expect(() =>
      evaluateDocumentCoverage(emptyRecord, ["src/lib/types.ts"], {
        lines: 101,
        functions: 85,
      })
    ).toThrow(RangeError);

    const report = evaluateDocumentCoverage(
      emptyRecord,
      ["src/lib/types.ts"],
      { lines: 85, functions: 85 }
    );
    expect(report.valid).toBe(false);
    expect(report.failures).toEqual([
      "No executable lines were reported for the Phase 2 surface.",
      "No functions were reported for the Phase 2 surface.",
    ]);
  });
});
