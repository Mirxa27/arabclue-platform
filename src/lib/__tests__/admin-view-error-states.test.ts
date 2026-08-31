/**
 * Guard: an admin view must not render a failed fetch as "no data".
 *
 * Six of the eight admin panels destructured only `{ data, isLoading }` from
 * `useQuery`. When `/api/admin/*` returned 500 the query result stayed
 * `undefined`, the list derived to `[]`, and the panel rendered its empty
 * state — an operator looking at a broken audit log saw "No data available"
 * and had no retry affordance.
 *
 * These components cannot be rendered here (the runner has no DOM), so this is
 * a source-level invariant: it proves the error signal is destructured and
 * referenced in a render branch, not that the branch looks right.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");
const read = (name: string) =>
  readFileSync(join(REPO_ROOT, "src/components/admin", `${name}.tsx`), "utf8");

/** Every admin panel that loads data over the network. */
const ADMIN_VIEWS = [
  "ai-providers",
  "audit",
  "billing",
  "billing-reconciliation",
  "env-settings",
  "myfatoorah",
  "overview",
  "security",
] as const;

/** The `const { ... } = useQuery` destructuring of the panel's primary query. */
function primaryQueryBinding(source: string): string {
  const match = source.match(/const\s*\{([^}]*)\}\s*=\s*useQuery/);
  if (!match) throw new Error("no destructured useQuery call found");
  return match[1];
}

describe("admin views distinguish a failed fetch from an empty result", () => {
  test.each(ADMIN_VIEWS)("%s destructures an error signal", (name) => {
    const binding = primaryQueryBinding(read(name));
    expect(binding).toMatch(/\b(isError|error)\b/);
  });

  test.each(ADMIN_VIEWS)("%s renders an error branch", (name) => {
    const source = read(name);
    // Destructuring alone proves nothing — the flag has to reach the tree.
    const rendered =
      /\bisError\s*(\?|&&)/.test(source) ||
      /\berror\s*(\?|&&)/.test(source) ||
      /if\s*\(\s*(isError|error)\b/.test(source);
    expect(rendered).toBe(true);
  });

  test.each(ADMIN_VIEWS)("%s offers a retry", (name) => {
    expect(read(name).includes("refetch")).toBe(true);
  });
});

describe("admin views do not hardcode English chrome", () => {
  test.each(ADMIN_VIEWS)("%s localises its loading text", (name) => {
    // Bare `Loading…` JSX text with no locale branch is the myfatoorah bug.
    const unlocalised = read(name)
      .split("\n")
      .filter((line) => /\bLoading[.…]/.test(line))
      .filter((line) => !line.includes("locale") && !line.includes("tr("));
    expect(unlocalised).toEqual([]);
  });
});
