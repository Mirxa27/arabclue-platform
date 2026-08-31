import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(
  join(import.meta.dir, "..", "..", "..", "src/components/dashboard/sidebar.tsx"),
  "utf8"
);

/**
 * The sidebar is the platform's complexity budget. The agent console is the home
 * view, so the rail carries only the five destinations a bid passes through and
 * holds every other panel behind one disclosure.
 */
describe("sidebar information architecture", () => {
  test("declares a primary rail and a disclosed remainder", () => {
    expect(source).toContain("NAV_PRIMARY");
    expect(source).toContain("NAV_SECONDARY");
    expect(source).toContain("nav_more");
  });

  test("the primary rail is the five-step bid path, starting at the agent", () => {
    const primary = source.slice(
      source.indexOf("const NAV_PRIMARY"),
      source.indexOf("const NAV_SECONDARY")
    );
    const views = [...primary.matchAll(/view: "([^"]+)"/g)].map((m) => m[1]);

    expect(views).toEqual([
      "overview",
      "projects",
      "documents",
      "proposals",
      "reviews",
    ]);
    expect(primary).toContain("nav_home_agent");
  });

  test("library and account panels are not in the primary rail", () => {
    const primary = source.slice(
      source.indexOf("const NAV_PRIMARY"),
      source.indexOf("const NAV_SECONDARY")
    );
    for (const view of [
      "marketplace",
      "clause-library",
      "template-editor",
      "billing",
      "settings",
      "analytics",
    ]) {
      expect(primary).not.toContain(`"${view}"`);
    }
  });

  test("the disclosure opens itself when the reader is standing inside it", () => {
    // Otherwise the active view can be hidden by its own collapsed group.
    expect(source).toContain("activeIsSecondary");
    expect(source).toContain("moreOpen || activeIsSecondary");
  });

  test("a badge hidden inside the disclosure is surfaced on the toggle", () => {
    expect(source).toContain("hiddenBadgeCount");
  });
});
