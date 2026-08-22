/**
 * Guard tests for marketplace entry visibility.
 *
 * The three consuming routes (`GET [id]`, `[id]/use`, `[id]/rate`) each carried
 * their own copy of the lookup, and every copy began with a bare `{ id }` OR
 * branch that had no ownership or visibility term. That made any entry readable
 * by primary key, and `/use` would copy another tenant's *private* template
 * into the caller's workspace.
 *
 * These tests evaluate the predicate against in-memory rows rather than a
 * database, so they assert the visibility rule itself.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { marketplaceEntryVisibilityWhere } from "@/lib/marketplace-template-resolve";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");

type Entry = {
  id: string;
  templateKey: string;
  workspaceId: string | null;
  isPublic: boolean;
};

const SELF = "ws-self";
const OTHER = "ws-other";

const ENTRIES: Entry[] = [
  { id: "e-own-private", templateKey: "k-own-private", workspaceId: SELF, isPublic: false },
  { id: "e-own-public", templateKey: "k-own-public", workspaceId: SELF, isPublic: true },
  { id: "e-other-private", templateKey: "k-other-private", workspaceId: OTHER, isPublic: false },
  { id: "e-other-public", templateKey: "k-other-public", workspaceId: OTHER, isPublic: true },
  { id: "e-system", templateKey: "k-system", workspaceId: null, isPublic: true },
  { id: "e-system-draft", templateKey: "k-system-draft", workspaceId: null, isPublic: false },
];

/** Minimal evaluator for the AND/OR shape the predicate returns. */
function matches(entry: Entry, where: ReturnType<typeof marketplaceEntryVisibilityWhere>): boolean {
  const clause = (c: Record<string, unknown>): boolean =>
    Object.entries(c).every(
      ([field, value]) => (entry as unknown as Record<string, unknown>)[field] === value
    );
  return where.AND.every((group) => group.OR.some((c) => clause(c as Record<string, unknown>)));
}

function visible(idOrKey: string, workspaceId: string): Entry[] {
  const where = marketplaceEntryVisibilityWhere(idOrKey, workspaceId);
  return ENTRIES.filter((e) => matches(e, where));
}

describe("marketplaceEntryVisibilityWhere", () => {
  test("resolves an entry the workspace published, private or public", () => {
    expect(visible("e-own-private", SELF).map((e) => e.id)).toEqual(["e-own-private"]);
    expect(visible("e-own-public", SELF).map((e) => e.id)).toEqual(["e-own-public"]);
  });

  test("resolves a public entry published by another workspace", () => {
    expect(visible("e-other-public", SELF).map((e) => e.id)).toEqual(["e-other-public"]);
  });

  test("resolves a public system catalog entry", () => {
    expect(visible("e-system", SELF).map((e) => e.id)).toEqual(["e-system"]);
  });

  // The regression. Previously the bare `{ id }` branch matched this.
  test("does NOT resolve another workspace's private entry by primary key", () => {
    expect(visible("e-other-private", SELF)).toEqual([]);
  });

  test("does NOT resolve another workspace's private entry by template key", () => {
    expect(visible("k-other-private", SELF)).toEqual([]);
  });

  test("does NOT resolve a non-public system entry", () => {
    expect(visible("e-system-draft", SELF)).toEqual([]);
  });

  test("resolves by template key as well as primary key", () => {
    expect(visible("k-own-private", SELF).map((e) => e.id)).toEqual(["e-own-private"]);
  });

  test("visibility is symmetric — the other workspace sees its own private entry", () => {
    expect(visible("e-other-private", OTHER).map((e) => e.id)).toEqual(["e-other-private"]);
    expect(visible("e-own-private", OTHER)).toEqual([]);
  });

  test("an unknown identifier resolves to nothing", () => {
    expect(visible("does-not-exist", SELF)).toEqual([]);
  });
});

describe("all marketplace routes use the shared predicate", () => {
  const ROUTES = [
    "src/app/api/templates/marketplace/[id]/route.ts",
    "src/app/api/templates/marketplace/[id]/use/route.ts",
    "src/app/api/templates/marketplace/[id]/rate/route.ts",
  ];

  test.each(ROUTES)("%s has no hand-rolled lookup", (relativePath) => {
    const source = readFileSync(join(REPO_ROOT, relativePath), "utf8");
    expect(source).toContain("marketplaceEntryVisibilityWhere");
    // The copy-pasted shape that dropped the ownership term.
    expect(source).not.toMatch(/OR:\s*\[\s*\{\s*id\s*\}/);
  });
});
