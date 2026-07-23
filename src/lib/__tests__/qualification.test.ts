import { describe, expect, test } from "bun:test";
import { assessQualificationDossier } from "../qualification";

describe("qualification dossier", () => {
  test("flags missing strong-bid docs and allows advisory NCA/LCGPA gaps", () => {
    const result = assessQualificationDossier({
      workspace: { crNumber: "1010", vatNumber: null },
      certificates: [],
    });
    expect(result.presentKeys).toContain("cr");
    expect(result.gaps.some((g) => g.key === "zatca_vat")).toBe(true);
    expect(result.gaps.some((g) => g.key === "gosi")).toBe(true);
    expect(result.strongBidReady).toBe(false);
  });

  test("treats VAT cert type as ZATCA VAT evidence", () => {
    const result = assessQualificationDossier({
      workspace: { crNumber: "1010", vatNumber: null },
      certificates: [
        { certType: "VAT", approved: true },
        { certType: "GOSI", approved: true },
      ],
    });
    expect(result.presentKeys).toContain("zatca_vat");
    expect(result.presentKeys).toContain("gosi");
    expect(result.strongBidReady).toBe(true);
  });

  test("marks expired GOSI as a gap", () => {
    const result = assessQualificationDossier({
      workspace: { crNumber: "1", vatNumber: "3" },
      certificates: [
        {
          certType: "GOSI",
          approved: true,
          expiresAt: "2020-01-01T00:00:00.000Z",
        },
      ],
      now: new Date("2026-07-23T00:00:00.000Z"),
    });
    const gosi = result.gaps.find((g) => g.key === "gosi");
    expect(gosi?.reason).toBe("expired");
    expect(result.strongBidReady).toBe(false);
  });
});
