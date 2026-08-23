import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { localizationRegistry } from "@/lib/i18n";

const root = join(import.meta.dir, "..", "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("dashboard locale defaults", () => {
  test("projects empty has a first-tender pair", () => {
    expect(localizationRegistry.projects_empty_title.ar.length).toBeGreaterThan(0);
    expect(localizationRegistry.projects_empty_title.en.length).toBeGreaterThan(0);
    expect(localizationRegistry.projects_empty_description.en).not.toMatch(/no data/i);
    const list = read("src/components/dashboard/projects-list.tsx");
    expect(list).toContain("projects_empty_title");
  });

  test("ErrorState default retry follows locale", () => {
    const source = read("src/components/patterns/query-state.tsx");
    expect(source).toContain('retryLabel = locale === "ar"');
  });

  test("ConfirmDialog default actions follow locale", () => {
    const source = read("src/components/patterns/confirm-dialog.tsx");
    expect(source).toContain("useLocale");
    expect(source).toContain("nav_confirm");
    expect(source).toContain("nav_cancel");
  });

  test("stat cards navigate to the matching view", () => {
    const source = read("src/components/dashboard/stat-cards.tsx");
    expect(source).toContain("useNavigateToView");
    expect(source).toContain('navigateToView("projects")');
  });
});
