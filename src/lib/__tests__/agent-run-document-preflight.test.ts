/**
 * No agent run is queued for a project that has no documents.
 *
 * The six agents read uploaded tender documents. With none, the run still
 * spends provider credit and returns a proposal assembled from nothing —
 * exactly the fabrication the pipeline exists to avoid. `POST /api/agents/run`
 * refuses that case (route.ts:109-118); the other modules that create an
 * `AgentRun` did not, so the same request answered 422 or queued depending on
 * which entry point the caller happened to use.
 *
 * Creators are discovered by scanning for the write rather than listed by
 * hand, because a list of modules that *need* the guard would be maintained by
 * the same person who forgot it, and so would never catch the case it exists
 * for.
 */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");
const SRC = join(REPO_ROOT, "src");

const CREATES_RUN = /\bagentRun\.create\s*\(/;
const RUNS_PREFLIGHT = /\bassertProjectHasDocuments\s*\(/;

/**
 * Creators whose project provably holds a document by the time they reach the
 * write. Each entry names the statement that puts it there so a reviewer can
 * re-check the claim in one step.
 */
const GUARANTEED_BY_CONSTRUCTION: Readonly<Record<string, string>> = {
  // Links the staged attachment's own document to the project a few lines
  // above the create (autopilot.ts:210-213), and Prisma throws P2025 when that
  // row is missing — so every path that reaches the create has count >= 1.
  "src/lib/agents/platform/autopilot.ts":
    "uploadedDocument.update({ data: { projectId } }) above the create",
};

/**
 * Comments are stripped first: this file and the modules it guards both name
 * `assertProjectHasDocuments` in prose, and counting prose would let a deleted
 * call keep passing on the strength of the comment that described it.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

function sourceFiles(): string[] {
  return readdirSync(SRC, { recursive: true, encoding: "utf8" })
    .filter(
      (entry) =>
        (entry.endsWith(".ts") || entry.endsWith(".tsx")) &&
        !entry.includes("__tests")
    )
    .map((entry) => join(SRC, entry));
}

describe("every agent run is preceded by a document preflight", () => {
  const creators = sourceFiles()
    .map((file) => ({
      path: file.slice(REPO_ROOT.length + 1),
      source: stripComments(readFileSync(file, "utf8")),
    }))
    .filter((f) => CREATES_RUN.test(f.source));

  test("the scan still finds the modules that create a run", () => {
    // Without this, renaming the Prisma model turns the check below into zero
    // assertions, which looks exactly like the check passing.
    expect(creators.length).toBeGreaterThanOrEqual(4);
  });

  test("every exemption still names a module that creates a run", () => {
    const paths = creators.map((f) => f.path);
    const stale = Object.keys(GUARANTEED_BY_CONSTRUCTION).filter(
      (path) => !paths.includes(path)
    );
    expect(stale).toEqual([]);
  });

  test("every creator calls assertProjectHasDocuments", () => {
    const unguarded = creators
      .filter((f) => !(f.path in GUARANTEED_BY_CONSTRUCTION))
      .filter((f) => !RUNS_PREFLIGHT.test(f.source))
      .map((f) => f.path)
      .sort();

    expect(unguarded).toEqual([]);
  });
});
