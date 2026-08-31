/**
 * `src/components/ui` was seeded from a component-library scaffold, so it
 * carried primitives the product never adopted: a carousel, a calendar, a
 * command palette, a second 723-line sidebar that shadows the real one by name.
 * Nothing imported them, so nothing type-checked them against the app's own
 * conventions and nothing rendered them — they were nineteen files of plausible
 * wrong answers sitting next to the right ones, and `Grep`ping for "sidebar" or
 * "chart" returned the decoy first.
 *
 * A component with no importer is not a component, it is a suggestion. This
 * ratchet keeps the next scaffold drop from re-seeding them.
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");
const SRC = join(REPO_ROOT, "src");

/** Every `.ts`/`.tsx` file under `src`, with its text. */
function sourceFiles(dir: string): ReadonlyArray<readonly [string, string]> {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    if (!/\.tsx?$/.test(entry.name)) return [];
    // One enormous single-line SQL string; reading it buys nothing and costs
    // a megabyte per scan.
    if (entry.name === "schema-sql.ts") return [];
    return [[path, readFileSync(path, "utf8")] as const];
  });
}

const ALL_SOURCES = sourceFiles(SRC);

/**
 * The files that import `target`, by any of the three spellings this repo
 * uses: the `@/` alias, a sibling `./name`, and `../ui/name`.
 */
function importersOf(target: string): readonly string[] {
  const stem = target.replace(/\.tsx?$/, "");
  const rel = stem.slice(SRC.length + 1); // e.g. "components/ui/chart"
  const name = rel.slice(rel.lastIndexOf("/") + 1);
  const dir = target.slice(0, target.lastIndexOf("/"));
  const patterns = [`"@/${rel}"`, `"../${rel.slice("components/".length)}"`];

  return ALL_SOURCES.filter(([path, text]) => {
    if (path === target) return false;
    if (patterns.some((p) => text.includes(p))) return true;
    // A sibling `./name` only counts from the same directory.
    return path.startsWith(`${dir}/`) && text.includes(`"./${name}"`);
  }).map(([path]) => path);
}

describe("no component sits in the tree with nothing importing it", () => {
  const uiFiles = readdirSync(join(SRC, "components/ui"))
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => join(SRC, "components/ui", f));

  test("the scan reaches the component tree", () => {
    // Anti-vacuous: a moved directory would otherwise turn every assertion
    // below into a check that an empty list is empty.
    expect(uiFiles.length).toBeGreaterThan(10);
    expect(ALL_SOURCES.length).toBeGreaterThan(400);
  });

  test("the scan finds real importers, not zero everywhere", () => {
    // Anti-vacuous the other way: a broken pattern would report every file as
    // an orphan and the suite would pass only because we deleted the tree.
    expect(importersOf(join(SRC, "components/ui/button.tsx")).length)
      .toBeGreaterThan(20);
  });

  test("every ui primitive is imported by something", () => {
    const orphans = uiFiles.filter((f) => importersOf(f).length === 0);
    expect(
      orphans.map((f) => f.slice(REPO_ROOT.length + 1)),
      "delete these or import them; an unimported component is a decoy in search results"
    ).toEqual([]);
  });

  test("every dashboard panel is imported by something", () => {
    const panels = readdirSync(join(SRC, "components/dashboard"))
      .filter((f) => f.endsWith(".tsx"))
      .map((f) => join(SRC, "components/dashboard", f));
    const orphans = panels.filter((f) => importersOf(f).length === 0);
    expect(orphans.map((f) => f.slice(REPO_ROOT.length + 1))).toEqual([]);
  });
});
