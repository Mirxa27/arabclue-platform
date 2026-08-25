import { describe, expect, test } from "bun:test";
import {
  ONBOARDING_WIZARD_STEPS,
  WIZARD_MISSION_CATALOG,
  EMPTY_CONNECT,
  deriveWizardPreview,
  wizardProgress,
  wizardStepCompletion,
  wizardProfileSchema,
  wizardBrandSchema,
  wizardLegalSchema,
  type WizardCompletionInput,
} from "@/lib/onboarding-wizard";

const validProfile = {
  name: "Mohammed Alotaibi",
  role: "FOUNDER_EXEC" as const,
  workspaceName: "Advanced Solutions Co.",
  workspaceNameAr: "شركة الحلول المتقدمة",
  sector: "GOV" as const,
};

const validBrand = {
  tagline: "Engineering Saudi Arabia's Digital Future",
  taglineAr: "نبني المستقبل الرقمي للمملكة",
  primaryColor: "#0F766E",
};

const validLegal = {
  crNumber: "1010123456",
  vatNumber: "300012345600003",
};

function completionInput(overrides: Partial<WizardCompletionInput> = {}): WizardCompletionInput {
  return {
    profile: validProfile,
    brand: validBrand,
    legal: validLegal,
    connect: {
      trackTender: true,
      tenderTitle: "Cloud Operations Tender",
      tenderTitleAr: "مناقصة تشغيل السحابة",
      etimadRef: "ETM-2026-77",
      reviewerIds: ["user-1"],
      restrictionsAcknowledged: true,
    },
    mission: "PROPOSAL",
    ...overrides,
  };
}

describe("wizardStepCompletion", () => {
  test("all steps complete when every payload is valid", () => {
    const c = wizardStepCompletion(completionInput());
    expect(c.profile).toBe(true);
    expect(c.brand).toBe(true);
    expect(c.legal).toBe(true);
    expect(c.connect).toBe(true);
    expect(c.launch).toBe(true);
  });

  test("profile fails when name too short", () => {
    const c = wizardStepCompletion(
      completionInput({ profile: { ...validProfile, name: "A" } })
    );
    expect(c.profile).toBe(false);
  });

  test("profile fails when workspace name missing", () => {
    const c = wizardStepCompletion(
      completionInput({ profile: { ...validProfile, workspaceName: "" } })
    );
    expect(c.profile).toBe(false);
  });

  test("brand fails on invalid color", () => {
    const c = wizardStepCompletion(
      completionInput({ brand: { ...validBrand, primaryColor: "red" } })
    );
    expect(c.brand).toBe(false);
  });

  test("legal fails when CR missing", () => {
    const c = wizardStepCompletion(completionInput({ legal: { crNumber: "", vatNumber: "" } }));
    expect(c.legal).toBe(false);
  });

  test("connect requires restrictionsAcknowledged", () => {
    const c = wizardStepCompletion(
      completionInput({
        connect: { ...EMPTY_CONNECT, restrictionsAcknowledged: false, reviewerIds: ["u1"] },
      })
    );
    expect(c.connect).toBe(false);
  });

  test("connect passes with reviewer even without tender tracking", () => {
    const c = wizardStepCompletion(
      completionInput({
        connect: { ...EMPTY_CONNECT, restrictionsAcknowledged: true, reviewerIds: ["u1"] },
      })
    );
    expect(c.connect).toBe(true);
  });

  test("connect passes with tender tracking even without reviewer", () => {
    const c = wizardStepCompletion(
      completionInput({
        connect: {
          trackTender: true,
          tenderTitle: "Tender",
          tenderTitleAr: "",
          etimadRef: "ETM-1",
          reviewerIds: [],
          restrictionsAcknowledged: true,
        },
      })
    );
    expect(c.connect).toBe(true);
  });

  test("connect fails when tender title too short", () => {
    const c = wizardStepCompletion(
      completionInput({
        connect: {
          trackTender: true,
          tenderTitle: "A",
          tenderTitleAr: "",
          etimadRef: "ETM-1",
          reviewerIds: [],
          restrictionsAcknowledged: true,
        },
      })
    );
    expect(c.connect).toBe(false);
  });

  test("launch requires mission selected", () => {
    expect(wizardStepCompletion(completionInput({ mission: null })).launch).toBe(false);
    expect(wizardStepCompletion(completionInput({ mission: "CONTRACT" })).launch).toBe(true);
  });

  test("empty state has zero steps complete", () => {
    const c = wizardStepCompletion({
      profile: null,
      brand: null,
      legal: null,
      connect: EMPTY_CONNECT,
      mission: null,
    });
    expect(Object.values(c).every((v) => v === false)).toBe(true);
  });
});

describe("wizardProgress", () => {
  test("calculates percent from completed count", () => {
    expect(wizardProgress({ profile: true, brand: true, legal: false, connect: false, launch: false })).toEqual({
      completedCount: 2,
      percent: 40,
    });
    expect(wizardProgress({ profile: true, brand: true, legal: true, connect: true, launch: true })).toEqual({
      completedCount: 5,
      percent: 100,
    });
    expect(wizardProgress({ profile: false, brand: false, legal: false, connect: false, launch: false })).toEqual({
      completedCount: 0,
      percent: 0,
    });
  });
});

describe("deriveWizardPreview", () => {
  test("headline uses workspace name or fallback", () => {
    const p = deriveWizardPreview(completionInput(), "FallbackCo");
    expect(p.headline).toBe("Advanced Solutions Co.'s Arabclue");
    const empty = deriveWizardPreview(
      { profile: null, brand: null, legal: null, connect: EMPTY_CONNECT, mission: null },
      ""
    );
    expect(empty.headline).toBe("Your workspace's Arabclue");
    const fallback = deriveWizardPreview(
      { profile: null, brand: null, legal: null, connect: EMPTY_CONNECT, mission: null },
      "FallbackCo"
    );
    expect(fallback.headline).toBe("FallbackCo's Arabclue");
  });

  test("context line reflects role and sector when profile present", () => {
    const p = deriveWizardPreview(completionInput(), "");
    expect(p.contextLineEn).toBe("Founder / exec · Government");
    expect(p.contextLineAr).toBe("مؤسس / تنفيذي · حكومي");
  });

  test("context line degrades gracefully without profile", () => {
    const p = deriveWizardPreview(
      { profile: null, brand: null, legal: null, connect: EMPTY_CONNECT, mission: null },
      ""
    );
    expect(p.contextLineEn).toBe("Answer to personalize");
    expect(p.contextLineAr).toBe("أجب لتخصيص التجربة");
  });

  test("strengths reflect active steps", () => {
    const all = deriveWizardPreview(completionInput(), "");
    expect(all.strengths.every((s) => s.active)).toBe(true);
    const none = deriveWizardPreview(
      { profile: null, brand: null, legal: null, connect: EMPTY_CONNECT, mission: null },
      ""
    );
    expect(none.strengths.every((s) => !s.active)).toBe(true);
    // Partial: only brand completed
    const partial = deriveWizardPreview(
      { profile: null, brand: validBrand, legal: null, connect: EMPTY_CONNECT, mission: null },
      ""
    );
    const brandStrength = partial.strengths.find((s) => s.id === "brand")!;
    expect(brandStrength.active).toBe(true);
    expect(partial.strengths.find((s) => s.id === "legal")!.active).toBe(false);
  });

  test("suggestions guide toward missing steps and cap at 4", () => {
    const p = deriveWizardPreview(
      { profile: null, brand: null, legal: null, connect: EMPTY_CONNECT, mission: null },
      ""
    );
    expect(p.suggestions.length).toBeLessThanOrEqual(4);
    expect(p.suggestions.length).toBeGreaterThan(0);
    const allDone = deriveWizardPreview(completionInput(), "");
    expect(allDone.suggestions[0]!.en).toMatch(/Setup complete|launch/);
  });
});

describe("schemas", () => {
  test("wizardProfileSchema validates all roles and sectors", () => {
    for (const role of ["FOUNDER_EXEC", "BID_MANAGER", "TECHNICAL_LEAD", "PROPOSAL_WRITER", "OTHER"] as const) {
      expect(wizardProfileSchema.safeParse({ ...validProfile, role }).success).toBe(true);
    }
    expect(wizardProfileSchema.safeParse({ ...validProfile, role: "INVALID" as never }).success).toBe(false);
  });

  test("wizardBrandSchema accepts 3 and 6 digit hex", () => {
    expect(wizardBrandSchema.safeParse({ ...validBrand, primaryColor: "#FFF" }).success).toBe(true);
    expect(wizardBrandSchema.safeParse({ ...validBrand, primaryColor: "#0F766E" }).success).toBe(true);
    expect(wizardBrandSchema.safeParse({ ...validBrand, primaryColor: "0F766E" }).success).toBe(false);
  });

  test("wizardLegalSchema requires crNumber", () => {
    expect(wizardLegalSchema.safeParse({ crNumber: "123", vatNumber: "" }).success).toBe(false);
    expect(wizardLegalSchema.safeParse({ crNumber: "1010", vatNumber: "" }).success).toBe(true);
  });
});

describe("wizard constants", () => {
  test("steps are 5 and cover profile through launch", () => {
    expect(ONBOARDING_WIZARD_STEPS).toHaveLength(5);
    expect(ONBOARDING_WIZARD_STEPS.map((s) => s.id)).toEqual([
      "profile",
      "brand",
      "legal",
      "connect",
      "launch",
    ]);
  });

  test("mission catalog has 3 missions with target views", () => {
    expect(WIZARD_MISSION_CATALOG).toHaveLength(3);
    for (const m of WIZARD_MISSION_CATALOG) {
      expect(m.targetView.length).toBeGreaterThan(0);
    }
  });
});
