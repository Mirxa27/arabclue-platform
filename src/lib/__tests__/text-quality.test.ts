import { describe, expect, test } from "bun:test";
import {
  isPlaceholderCompanyName,
  isQualityMilestoneName,
  isQualityRequirementText,
  isQualityScopeText,
  resolveBidderDisplayName,
  sanitizeMilestonesForBoq,
} from "@/lib/text-quality";

describe("text-quality", () => {
  test("rejects workspace and platform placeholder company names", () => {
    expect(isPlaceholderCompanyName("مساحة test_User")).toBe(true);
    expect(isPlaceholderCompanyName("test_User's Workspace")).toBe(true);
    expect(isPlaceholderCompanyName("أراب كلاو")).toBe(true);
    expect(isPlaceholderCompanyName("شركة التنمية الرقمية")).toBe(false);
    expect(
      resolveBidderDisplayName(
        "ar",
        { taglineAr: "أراب كلاو" },
        { nameAr: "مساحة test_User" }
      )
    ).toBe("الشركة المقدّمة للعطاء");
  });

  test("rejects mid-sentence and Q&A milestone scraps", () => {
    expect(
      isQualityMilestoneName(
        "، لكن العربية تبقى اللغة المعتمدة والراجحة عند أي تعارض"
      )
    ).toBe(false);
    expect(isQualityMilestoneName("pilot period?")).toBe(false);
    expect(isQualityMilestoneName("ال")).toBe(false);
    expect(isQualityMilestoneName("Discovery & Architecture")).toBe(true);
  });

  test("rejects junk requirements and broken scope", () => {
    expect(
      isQualityRequirementText(
        "، لكن العربية تبقى اللغة المعتمدة والراجحة عند أي تعارض"
      )
    ).toBe(false);
    expect(
      isQualityRequirementText("Extracted 10 milestone(s) from document")
    ).toBe(false);
    expect(
      isQualityScopeText(
        "، لكن العربية تبقى اللغة المعتمدة والراجحة عند أي تعارض، ما لم يُحدَّد خلاف ذلك"
      )
    ).toBe(false);
  });

  test("falls back to standard BoQ milestones when extracted junk", () => {
    const out = sanitizeMilestonesForBoq(
      [
        { name: "ال", weeks: 4 },
        { name: "pilot period?", weeks: 10 },
      ],
      "ar"
    );
    expect(out[0]?.name).toContain("التعبئة");
    expect(out.length).toBe(5);
  });
});
