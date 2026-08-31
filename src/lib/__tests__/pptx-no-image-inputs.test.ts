/**
 * PPTX generation must never hand an image to pptxgenjs.
 *
 * `pptxgenjs` declares `image-size@^1.2.1`, which carries two high-severity
 * DoS advisories — GHSA-w3rx-r6r6-pgpr (ICNS parser infinite loop) and
 * GHSA-5p2g-fcmc-qvqq (JXL/HEIF parser infinite loops). Neither can be fixed by
 * upgrading: the advisory range is `<=2.0.2` and 2.0.2 is the latest published
 * version, while pptxgenjs 4.0.1 (also latest) pins `^1.2.1` and cannot reach
 * 2.x regardless.
 *
 * We are safe for two independent reasons, and this test defends the one that
 * is ours to keep:
 *
 *   1. Our generators build slides from text, shapes, and colors only. No image
 *      ever reaches pptxgenjs, so its image path is never entered.
 *   2. pptxgenjs's shipped bundle never loads `image-size` at all — the only
 *      sizing code in `dist/pptxgen.cjs.js` is commented out and labelled
 *      "FIXME: TODO: currently unused". The sole runtime `require` is `jszip`.
 *
 * Reason 2 is upstream's to change and we would not notice. Reason 1 is a line
 * of our own code away from being false: the brand profile already carries a
 * logo, and "put the logo on the title slide" is an obvious next request. That
 * one-line change would silently re-open an unpatchable parser to
 * workspace-uploaded bytes. Hence a test rather than a comment.
 *
 * If you need images in a deck, do not just delete this test. Validate and
 * re-encode the bytes to PNG or JPEG first, and narrow this guard to the
 * re-encoded path — the advisories are in the ICNS, JXL, and HEIF branches.
 */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = join(import.meta.dir, "..", "..");

/**
 * pptxgenjs entry points that accept image bytes or a path it will then
 * measure. `background` is matched only when given `data:`/`path:`, because
 * `background: { color }` is the form we actually use and is never sized.
 */
const IMAGE_INPUTS: ReadonlyArray<readonly [label: string, pattern: RegExp]> = [
  ["addImage", /\.addImage\s*\(/],
  ["addMedia", /\.addMedia\s*\(/],
  ["background with data:", /background\s*[:=][^;]*\bdata\s*:/],
  ["background with path:", /background\s*[:=][^;]*\bpath\s*:/],
];

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/**
 * Found by scanning for the import rather than by listing paths, so a third
 * generator added later is covered without anyone remembering this file.
 */
function pptxModules(): { path: string; source: string }[] {
  return readdirSync(SRC, { recursive: true, encoding: "utf8" })
    .filter((entry) => entry.endsWith(".ts") || entry.endsWith(".tsx"))
    .filter((entry) => !entry.includes("__tests"))
    .map((entry) => ({
      path: entry,
      source: stripComments(readFileSync(join(SRC, entry), "utf8")),
    }))
    .filter((file) => /["']pptxgenjs["']/.test(file.source));
}

describe("pptxgenjs is never given an image to measure", () => {
  const modules = pptxModules();

  test("the scan actually finds the PPTX generators", () => {
    // Without this, renaming or bundling the generators turns the suite green
    // silently — which looks exactly like the check passing.
    expect(modules.map((m) => m.path).sort()).toEqual([
      "lib/generators.ts",
      "lib/proposal-layouts.ts",
    ]);
  });

  test("the generators still drive pptxgenjs at all", () => {
    // Guards against the inverse silent-green: a file that imports the type but
    // no longer builds slides would pass every assertion below for free.
    for (const file of modules) {
      expect(file.source).toMatch(/\.addSlide\s*\(|slide\.background\s*=/);
    }
  });

  for (const [label, pattern] of IMAGE_INPUTS) {
    test(`no generator calls ${label}`, () => {
      const offenders = modules
        .filter((file) => pattern.test(file.source))
        .map((file) => file.path)
        .sort();

      expect(offenders).toEqual([]);
    });
  }
});
