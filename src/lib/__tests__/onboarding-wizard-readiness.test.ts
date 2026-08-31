/**
 * Finishing the wizard has to mean the product will actually run.
 *
 * ONBOARDING_WIZARD_STEPS is the only guided path a new workspace has, and it
 * reports 100% once its five steps validate. computeOnboardingSteps is what
 * assertOnboardingReady enforces before any AI generation. When the second
 * requires a step the first never collects, every new user completes setup, is
 * told they are ready, and is then refused on the first thing they try to do.
 *
 * The map below is hand-maintained on purpose — it is the contract, and each
 * entry names the call that satisfies it. A new required step with no wizard
 * call fails here instead of in front of a customer.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ONBOARDING_STEPS } from "@/lib/onboarding-steps";
import type { OnboardingStepKey } from "@/lib/types";

/** Required onboarding step -> the wizard call that completes it. */
const WIZARD_SATISFIES: Partial<Record<OnboardingStepKey, string>> = {
  // onboarding-wizard.tsx:266 — PATCH /api/brand with tagline + primaryColor.
  brand: "PATCH /api/brand",
  // onboarding-wizard.tsx:295 — PATCH /api/workspaces with crNumber.
  legal: "PATCH /api/workspaces",
  // onboarding-wizard.tsx:350 — saveApprovalChain -> PUT /api/approval-policy.
  approvalChain: "PUT /api/approval-policy",
  // onboarding-wizard.tsx:320 — PATCH /api/onboarding { restrictionsReviewed }.
  restrictions: "PATCH /api/onboarding",
};

function source(relative: string): string {
  return readFileSync(resolve(process.cwd(), relative), "utf8");
}

describe("the wizard can reach the state the generation gate demands", () => {
  test("every required step is one the wizard completes", () => {
    const required = ONBOARDING_STEPS.filter((s) => s.required).map((s) => s.key);
    // Anti-vacuous: an empty required set would pass the loop below.
    expect(required.length).toBeGreaterThan(0);
    for (const key of required) {
      expect(
        WIZARD_SATISFIES[key],
        `assertOnboardingReady requires "${key}" but no wizard step produces it`
      ).toBeTruthy();
    }
  });

  test("the map names only real onboarding steps", () => {
    const keys = new Set<string>(ONBOARDING_STEPS.map((s) => s.key));
    for (const key of Object.keys(WIZARD_SATISFIES)) {
      expect(keys.has(key), `"${key}" is not an onboarding step`).toBe(true);
    }
  });
});

describe("track record cannot be satisfied by the wizard's project step", () => {
  test("that step creates a tender to pursue, not delivered work", () => {
    // This is why trackRecord is absent from the map above, and it pins the
    // wrong fix: the gate counts PastProject rows carrying an approved evidence
    // document, so pointing the wizard at PastProject would mean writing track
    // record with nothing behind it.
    const wizard = source("src/components/dashboard/onboarding-wizard.tsx");
    expect(wizard).toContain('fetch("/api/projects"');

    const route = source("src/app/api/projects/route.ts");
    expect(route).toContain("db.tenderProject.create");
    expect(route).not.toContain("db.pastProject.create");
  });

  test("the gate counts delivered projects, and only approved ones", () => {
    // Anti-vacuous: if this ever stopped reading pastProject the test above
    // would be arguing about a model nobody gates on.
    const onboarding = source("src/lib/onboarding.ts");
    expect(onboarding).toContain("db.pastProject.count({ where: reviewedWhere })");
    expect(onboarding).toContain('reviewStatus: "APPROVED"');
  });
});
