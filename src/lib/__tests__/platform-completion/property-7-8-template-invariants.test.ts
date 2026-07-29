/**
 * Feature: platform-completion
 * Property 7: Template variables equal template references
 * Property 8: Template legal-safety invariants
 */

import { describe, expect, test } from "bun:test";
import {
  WORKSPACE_TEMPLATE_SAFETY,
  parseWorkspaceTemplateSubmission,
  resolveWorkspaceTemplateSafety,
  type WorkspaceTemplateNode,
} from "../../contract-template-schema";

function section(
  seed: number,
  variableKey: string
): {
  key: string;
  titleAr: string;
  titleEn: string;
  contentAr: WorkspaceTemplateNode[];
  contentEn: WorkspaceTemplateNode[];
} {
  return {
    key: `section-${seed}`,
    titleAr: `قسم ${seed}`,
    titleEn: `Section ${seed}`,
    contentAr: [
      { type: "TEXT", value: "الطرف الأول هو " },
      { type: "VARIABLE", variableKey },
    ],
    contentEn: [
      { type: "TEXT", value: "The first party is " },
      { type: "VARIABLE", variableKey },
    ],
  };
}

function submission(seed: number) {
  const variableKey = `partyName${seed % 17}`;
  const includeChoice = seed % 3 === 0;
  return {
    key: `workspace-template-${seed}`,
    titleAr: `قالب ${seed}`,
    titleEn: `Template ${seed}`,
    sections: [section(seed, variableKey)],
    variables: [
      {
        key: variableKey,
        type: includeChoice ? ("SINGLE_CHOICE" as const) : ("TEXT" as const),
        labelAr: "اسم الطرف",
        labelEn: "Party name",
        required: true,
        ...(includeChoice
          ? {
              choices: [
                { value: "a", labelAr: "أ", labelEn: "A" },
                { value: "b", labelAr: "ب", labelEn: "B" },
              ],
            }
          : {}),
      },
    ],
    clauseBindings: [
      {
        clauseKey: "clause.parties",
        sectionKey: `section-${seed}`,
        order: 0,
      },
    ],
    // Attempted legal overrides — must be ignored (Property 8).
    legalReviewStatus: seed % 2 === 0 ? "APPROVED" : "REVIEWED",
    counselReviewRequired: false,
    isExecutable: true,
  };
}

function collectVariableRefs(
  nodes: readonly WorkspaceTemplateNode[]
): Set<string> {
  const keys = new Set<string>();
  for (const node of nodes) {
    if (node.type === "VARIABLE") keys.add(node.variableKey);
  }
  return keys;
}

describe("Feature: platform-completion, Property 7: Template variables equal template references", () => {
  test("declared variable names equal references across AR/EN sections for 100+ templates", () => {
    let cases = 0;
    for (let seed = 0; seed < 120; seed++) {
      const result = parseWorkspaceTemplateSubmission(submission(seed));
      expect(result.ok).toBe(true);
      if (!result.ok) continue;

      const declared = new Set(
        result.value.content.variables.map((v) => v.key)
      );
      const referenced = new Set<string>();
      for (const sec of result.value.content.sections) {
        for (const key of collectVariableRefs(sec.contentAr)) referenced.add(key);
        for (const key of collectVariableRefs(sec.contentEn)) referenced.add(key);
      }

      expect([...declared].sort()).toEqual([...referenced].sort());
      expect([...declared].sort()).toEqual(
        [...result.value.referencedVariableKeys].sort()
      );
      cases += 1;
    }
    expect(cases).toBeGreaterThanOrEqual(100);
  });
});

describe("Feature: platform-completion, Property 8: Template legal-safety invariants", () => {
  test("every accepted template is unreviewed, counsel-required, and non-executable", () => {
    let cases = 0;
    for (let seed = 0; seed < 120; seed++) {
      const result = parseWorkspaceTemplateSubmission(submission(seed));
      expect(result.ok).toBe(true);
      if (!result.ok) continue;

      const safety = resolveWorkspaceTemplateSafety();
      expect(safety).toEqual(WORKSPACE_TEMPLATE_SAFETY);
      expect(result.value.safety).toEqual(WORKSPACE_TEMPLATE_SAFETY);
      expect(result.value.safety.legalReviewStatus).toBe("UNREVIEWED");
      expect(result.value.safety.counselReviewRequired).toBe(true);
      expect(result.value.safety.isExecutable).toBe(false);
      cases += 1;
    }
    expect(cases).toBeGreaterThanOrEqual(100);
  });
});
