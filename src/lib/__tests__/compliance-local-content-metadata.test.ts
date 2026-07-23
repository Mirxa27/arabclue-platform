import { describe, expect, test } from "bun:test";
import { COMPLIANCE_FRAMEWORKS } from "../constants";
import { saudizationExportLabel } from "../generators";

/** Blanket universals that must not appear in static LOCAL_CONTENT compliance metadata. */
const FORBIDDEN_BLANKET_PHRASES: RegExp[] = [
  /mandatory\s+10%/i,
  /10%\s*price\s*preference/i,
  /minimum\s+35%\s*saudization/i,
  /target\s+50%\+/i,
  /تفضيل\s*سعري\s*10%/,
  /35%\s*سعودة/,
];

function localContentStaticText(): string[] {
  const fw = COMPLIANCE_FRAMEWORKS.find((f) => f.id === "LOCAL_CONTENT");
  expect(fw).toBeDefined();
  return fw!.controls.flatMap((ctrl) => [
    ctrl.title,
    ctrl.titleAr,
    ctrl.requirement,
  ]);
}

describe("LOCAL_CONTENT compliance metadata", () => {
  test("LC-1/LC-2 static text avoids blanket mandatory percentage universals", () => {
    const corpus = localContentStaticText().join("\n");
    const hits = FORBIDDEN_BLANKET_PHRASES.filter((re) => re.test(corpus));
    expect(hits).toEqual([]);
  });

  test("LC controls use tender-stated mechanism language", () => {
    const lc1 = COMPLIANCE_FRAMEWORKS.find((f) => f.id === "LOCAL_CONTENT")
      ?.controls.find((c) => c.controlId === "LC-1");
    const lc2 = COMPLIANCE_FRAMEWORKS.find((f) => f.id === "LOCAL_CONTENT")
      ?.controls.find((c) => c.controlId === "LC-2");

    expect(lc1?.requirement.toLowerCase()).toContain("tender");
    expect(lc1?.requirement.toLowerCase()).not.toContain("mandatory 10");
    expect(lc2?.requirement.toLowerCase()).toContain("tender");
    expect(lc2?.requirement.toLowerCase()).not.toMatch(/minimum\s+35%/);
  });

  test("export saudization labels never invent a blanket 35% minimum", () => {
    const labels = [
      saudizationExportLabel(null, null),
      saudizationExportLabel(undefined, undefined),
      saudizationExportLabel(40, null),
      saudizationExportLabel(null, 30),
      saudizationExportLabel(22, 25),
    ];
    for (const label of labels) {
      expect(label.toLowerCase()).not.toMatch(/minimum\s+35%/);
      expect(label.toLowerCase()).not.toContain("mandatory");
      expect(label).not.toMatch(/\b35%\b/);
    }
    expect(saudizationExportLabel(null, null)).toContain("no blanket minimum");
    expect(saudizationExportLabel(null, 30)).toContain("Tender target 30%");
  });
});
