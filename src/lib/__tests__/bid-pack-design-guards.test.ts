import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BRANDED_FRONT_MATTER_ZIP_FILES } from "@/lib/structured-bid-package";

const root = join(import.meta.dir, "..", "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("bid pack organisation design", () => {
  test("preview download compiles a branded draft snapshot", () => {
    const source = read("src/app/api/proposals/[id]/download/route.ts");
    expect(source).toContain("compileDraftProposalSnapshot");
    expect(source).toContain("applyWorkspaceBrandToSnapshot");
    expect(source).toContain("designedDraft");
  });

  test("structured ZIP ships branded cover and letter", () => {
    expect(BRANDED_FRONT_MATTER_ZIP_FILES).toEqual([
      "Cover_Letterhead.html",
      "Submission_Letter.html",
    ]);
    const source = read("src/lib/structured-bid-package.ts");
    expect(source).toContain("Cover_Letterhead.html");
    expect(source).toContain("Submission_Letter.html");
  });

  test("account brand copy says exports use this identity", () => {
    const source = read("src/components/dashboard/brand-setup.tsx");
    expect(source).toContain("brand_exports_note");
  });
});
