import { describe, expect, test } from "bun:test";
import {
  hasPresentationForms,
  restoreLogicalArabic,
} from "../arabic-visual-order";

// Fixtures are verbatim pdf-parse output for public/samples/*.pdf: shaped
// glyphs (Arabic Presentation Forms-B) in visual order, base letters already
// flipped by pdf.js, Latin left alone.
const VISUAL_LINE_1 =
  ".ﻲﻤﺳﺮﻟا ﻢﻳﺪﻘﺘﻠﻟ مﺪﺨﺘﺴُﺗ ﻻو ﺔﻴﻣﻮﻜﺣ ﺔﻬﺟ ﻦﻋ درةﺎﺻ ﺖﺴﻴﻟ .وﻼﻛ";
const VISUAL_LINE_0 =
  "أراب ﺔﺼﻨﻣ ﻰﻠﻋ ﺔﺑﺮﺠﺘﻟوا ضﺮﻌﻟا اضﺮﻏﻷ ﺔﻴﻤﻫو ﺔﻘﻴﺛو — SAMPLE ONLY / ﺔﻴﺒﻳرﺪﺗ";

describe("restoreLogicalArabic", () => {
  test("a fully shaped line reads as Arabic again", () => {
    expect(restoreLogicalArabic(VISUAL_LINE_1)).toBe(
      "كلاو. ليست صادرة عن جهة حكومية ولا تُستخدم للتقديم الرسمي."
    );
  });

  test("Latin phrases keep their order while Arabic words flip", () => {
    expect(restoreLogicalArabic(VISUAL_LINE_0)).toBe(
      "تدريبية / SAMPLE ONLY — وثيقة وهمية لأغراض العرض والتجربة على منصة أراب"
    );
  });

  test("words mixing base letters and shaped glyphs come out whole", () => {
    // pdf.js flipped "درة" back to logical order but left "ﺎﺻ" visual.
    expect(restoreLogicalArabic("درةﺎﺻ")).toBe("صادرة");
    // lam-alef ligature expands to two letters in the right place.
    expect(restoreLogicalArabic("اضﺮﻏﻷ")).toBe("لأغراض");
    expect(restoreLogicalArabic("ﺔﺑﺮﺠﺘﻟوا")).toBe("والتجربة");
  });

  test("harakat stay on the letter they were drawn on", () => {
    expect(restoreLogicalArabic("مﺪﺨﺘﺴُﺗ")).toBe("تُستخدم");
    expect(restoreLogicalArabic("ﺔﻨّ")).toBe("نّة");
  });

  test("Arabic-Indic digits and dates survive inside a shaped line", () => {
    expect(restoreLogicalArabic("ﺦﻳرﺎﺗ 2026-07-01 ١٢٣")).toBe(
      "١٢٣ 2026-07-01 تاريخ"
    );
  });

  test("lines without presentation forms are untouched, byte for byte", () => {
    const logical = "كراسة الشروط — RFP 2026\nKingdom of Saudi Arabia\n  indented";
    expect(restoreLogicalArabic(logical)).toBe(logical);
    expect(hasPresentationForms(logical)).toBe(false);
  });

  test("only the affected lines of a mixed document are repaired", () => {
    const mixed = `Technical Specifications\n${VISUAL_LINE_1}\nIssued: 2026-07-01`;
    expect(restoreLogicalArabic(mixed).split("\n")).toEqual([
      "Technical Specifications",
      "كلاو. ليست صادرة عن جهة حكومية ولا تُستخدم للتقديم الرسمي.",
      "Issued: 2026-07-01",
    ]);
  });
});

describe("parseTenderText Etimad reference", () => {
  test("a prose mention such as 'Etimad-oriented' is not a reference", async () => {
    const { parseTenderText } = await import("../agents/ingestion");
    expect(parseTenderText("This Etimad-oriented RFP has no number.").project.etimadRef).toBeNull();
    expect(parseTenderText("Etimad Reference: ETIMAD-SAMPLE-2026-0142").project.etimadRef).toBe(
      "ETIMAD-SAMPLE-2026-0142"
    );
    expect(parseTenderText("رقم المنافسة: 2025000123").project.etimadRef).toBe("2025000123");
  });
});
