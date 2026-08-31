/**
 * The product must not tell a customer it is "PDPL compliant".
 *
 * Compliance with PDPL or the NCA ECC is a statement about the *customer's*
 * regulatory posture — their data classification, lawful basis, transfer
 * arrangements and scope. A vendor cannot assert it on their behalf, and
 * Arabclue holds no certification that would let it assert it about itself.
 *
 * This repo already knows that. procurement-rules.ts:8 carries the standing
 * instruction "Do not state PDPL universally requires 100% KSA residency", and
 * the considered surfaces say "PDPL-aware" and "NCA-aligned"
 * (landing-page.tsx:245, compliance/page.tsx:13). The auth pages and the admin
 * audit header drifted to the bare word instead, so the same product makes two
 * incompatible legal claims about itself depending on which page you land on.
 *
 * The rule here is vocabulary, not silence: describe what the software does
 * ("aware", "aligned", "auditable evidence"), never assert a compliance status.
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Product surfaces a customer or operator actually reads. */
const SCANNED_ROOTS = ["src/app", "src/components"] as const;

/**
 * Phrasings that assert a compliance status rather than describe behaviour.
 * Each is anchored to the regulator so "compliance monitoring" — a feature
 * description, and legitimate — does not trip.
 */
const OVERCLAIMS: { pattern: RegExp; why: string }[] = [
  {
    pattern: /\b(?:PDPL|NCA)\b[^\n]{0,24}?\bcompliant\b/i,
    why: 'asserts the product is compliant; say "-aware" or "-aligned"',
  },
  {
    pattern: /\bNCA\s*\/\s*PDPL\s+compliance\b/i,
    why: 'asserts a compliance status; describe the controls instead',
  },
  { pattern: /امتثال\s*(?:NCA|PDPL)/, why: 'الامتثال ادّعاء قانوني — استخدم "يراعي"' },
  { pattern: /(?:PDPL|NCA)\s*متوافق/, why: 'الامتثال ادّعاء قانوني — استخدم "يراعي"' },
];

function sourceFiles(): string[] {
  const found: string[] = [];
  for (const root of SCANNED_ROOTS) {
    const base = resolve(process.cwd(), root);
    for (const rel of readdirSync(base, { recursive: true, encoding: "utf8" })) {
      if (!/\.tsx?$/.test(rel) || rel.includes("__tests__")) continue;
      found.push(`${root}/${rel}`);
    }
  }
  return found;
}

describe("no surface claims a regulatory compliance status", () => {
  const files = sourceFiles();

  test("the scan actually reaches the pages", () => {
    // Anti-vacuous: an empty or mis-rooted walk would pass the check below.
    expect(files.length).toBeGreaterThan(100);
    expect(files).toContain("src/app/login/page.tsx");
    expect(files).toContain("src/components/admin/audit.tsx");
  });

  test("no file asserts PDPL or NCA compliance", () => {
    const hits: string[] = [];
    for (const file of files) {
      const lines = readFileSync(resolve(process.cwd(), file), "utf8").split("\n");
      lines.forEach((line, i) => {
        for (const { pattern, why } of OVERCLAIMS) {
          if (pattern.test(line)) hits.push(`${file}:${i + 1} — ${why}`);
        }
      });
    }
    expect(hits, `compliance overclaim:\n${hits.join("\n")}`).toEqual([]);
  });
});

describe("the hedged vocabulary is the one that survives", () => {
  test("the considered surfaces still describe, not assert", () => {
    // Anti-vacuous: deleting every mention would satisfy the scan above, so
    // pin the wording the product is meant to use in its place.
    const landing = readFileSync(
      resolve(process.cwd(), "src/components/marketing/landing-page.tsx"),
      "utf8"
    );
    expect(landing).toContain("PDPL-Aware Controls");
    expect(landing).toContain("NCA-Aware Workflow");

    const compliance = readFileSync(
      resolve(process.cwd(), "src/app/compliance/page.tsx"),
      "utf8"
    );
    expect(compliance).toContain("NCA-aligned controls");
    expect(compliance).toContain("PDPL-aware workflows");
  });

  test("the rules engine still warns against the universal claim", () => {
    const rules = readFileSync(resolve(process.cwd(), "src/lib/procurement-rules.ts"), "utf8");
    expect(rules).toContain("not a universal PDPL legal conclusion");
  });
});
