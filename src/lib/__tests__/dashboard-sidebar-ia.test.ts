import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(
  join(import.meta.dir, "..", "..", "..", "src/components/dashboard/sidebar.tsx"),
  "utf8"
);

describe("sidebar information architecture", () => {
  test("declares the three product groups", () => {
    expect(source).toContain("NAV_WORKFLOW");
    expect(source).toContain("NAV_LIBRARY");
    expect(source).toContain("NAV_ACCOUNT");
    expect(source).toContain("nav_group_workflow");
    expect(source).toContain("nav_group_library");
    expect(source).toContain("nav_group_account");
  });

  test("marketplace is not in the workflow list", () => {
    const workflow = source.slice(
      source.indexOf("NAV_WORKFLOW"),
      source.indexOf("NAV_LIBRARY")
    );
    expect(workflow).not.toContain('"marketplace"');
    expect(workflow).not.toContain('"clause-library"');
  });
});
