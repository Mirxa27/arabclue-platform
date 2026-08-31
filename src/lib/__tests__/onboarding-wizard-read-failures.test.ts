/**
 * A failed read in the wizard must not turn into a silent overwrite.
 *
 * The wizard is the first screen a new workspace sees. It prefills its form
 * from three GETs and PATCHes the drafts straight back, and two of the fields
 * it writes are optional and sent as `|| null` — saveProfile sends `nameAr`,
 * saveLegal sends `vatNumber`. So a GET that fails while the form still
 * renders is not a cosmetic problem: the user sees blank inputs, has nothing
 * telling them why, and pressing Continue writes null over stored values.
 *
 * The assertions are structural because this repo's runner has no DOM. They
 * pin the two properties that make that overwrite unreachable — no query hides
 * a failure behind a default, and the form does not render while a read is
 * failing — plus the retry, without which the error state just strands the
 * user somewhere new.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const WIZARD = "src/components/dashboard/onboarding-wizard.tsx";

function source(relative: string): string {
  return readFileSync(resolve(process.cwd(), relative), "utf8");
}

/** Match lines against a pattern, reporting `file:line` for each hit. */
function locate(src: string, pattern: RegExp): string[] {
  return src
    .split("\n")
    .map((line, i) => ({ line: line.trim(), n: i + 1 }))
    .filter(({ line }) => pattern.test(line))
    .map(({ line, n }) => `${WIZARD}:${n} — ${line}`);
}

describe("the onboarding wizard cannot silently render a failed read", () => {
  test("no query hides a failed response behind a default value", () => {
    // `if (!r.ok) return { brand: null }` is the shape that does the damage:
    // the query resolves, react-query reports success, and the form renders
    // with the field blank. Throwing is what lets the guard below see it.
    const hits = locate(source(WIZARD), /if\s*\(\s*!r\.ok\s*\)\s*return\b/);
    expect(hits, `read failure swallowed by a default:\n${hits.join("\n")}`).toEqual([]);
  });

  test("a failing read blocks the form instead of rendering it blank", () => {
    const src = source(WIZARD);
    expect(src, "no query error is read").toMatch(/Query\.(isError|error)\b/);

    // The guard has to sit above the form, not beside it — an error banner
    // rendered over a live form still lets Continue submit the blanks.
    const guard = src.indexOf("loadError");
    const form = src.indexOf("ARABCLUE SETUP");
    expect(guard, "no loadError guard").toBeGreaterThan(-1);
    expect(form, "wizard form header moved; this anchor needs updating").toBeGreaterThan(-1);
    expect(guard, "the loadError guard must precede the form").toBeLessThan(form);
  });

  test("the error state offers a retry", () => {
    expect(source(WIZARD), "error state strands the user with no way out").toMatch(
      /refetch/
    );
  });
});

describe("the reason the guard matters is still true", () => {
  // Anti-vacuous: if the saves stopped writing optional fields as null, or the
  // reads stopped feeding the form, the assertions above would be defending a
  // hazard that no longer exists — and would quietly pass forever.
  test("the wizard still writes optional fields as null", () => {
    const src = source(WIZARD);
    expect(src).toContain("nameAr: parsed.data.workspaceNameAr || null");
    expect(src).toContain("vatNumber: parsed.data.vatNumber || null");
  });

  test("the wizard still prefills those fields from reads", () => {
    const src = source(WIZARD);
    for (const key of ["workspace", "brand", "onboarding"]) {
      expect(src, `no ["${key}"] query`).toContain(`queryKey: ["${key}"]`);
    }
    expect(src).toContain("setDraftWsNameAr(wsData.workspace.nameAr ?? \"\")");
    expect(src).toContain("setDraftVat(wsData.workspace.vatNumber ?? \"\")");
  });
});
