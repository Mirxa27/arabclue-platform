import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..", "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("overview navigation stays on the URL", () => {
  test("the flow board does not call setView", () => {
    const source = read("src/components/dashboard/tender-flow-board.tsx");
    expect(source).toContain("useNavigateToView");
    expect(source).toContain("resolveOverviewNextStepWhenReady");
    expect(source).not.toMatch(/\bsetView\b/);
  });

  test("overview defers work panels until a project exists", () => {
    const source = read("src/components/dashboard/views.tsx");
    expect(source).toContain("shouldShowOverviewWorkPanels");
    expect(source).toContain("isSuccess");
  });
});
