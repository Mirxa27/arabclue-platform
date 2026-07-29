/**
 * Feature: platform-completion, Property 10: Contract self-comparison is unchanged
 */

import { describe, expect, test } from "bun:test";
import { computeArticleDiff } from "../../contract-versioning";

type Section = {
  key: string;
  arabic: string;
  english: string;
};

function sectionsForSeed(seed: number): Section[] {
  const count = 1 + (seed % 6);
  const sections: Section[] = [];
  for (let i = 0; i < count; i++) {
    sections.push({
      key: `article-${i}`,
      arabic: `النص العربي ${seed}-${i}`,
      english: `English text ${seed}-${i}`,
    });
  }
  return sections;
}

describe("Feature: platform-completion, Property 10: Contract self-comparison is unchanged", () => {
  test("self-diff contains only unchanged AR/EN articles and no monetary fields across 100+ cases", () => {
    let cases = 0;

    for (let seed = 0; seed < 120; seed++) {
      const sections = sectionsForSeed(seed);
      const arabic = computeArticleDiff(sections, sections, "arabic");
      const english = computeArticleDiff(sections, sections, "english");

      expect(arabic).toHaveLength(sections.length);
      expect(english).toHaveLength(sections.length);

      for (const diff of [...arabic, ...english]) {
        expect(diff.change).toBe("unchanged");
        expect(diff.oldText).toBe(diff.newText);
        expect("monetaryDifference" in diff).toBe(false);
        expect("amountDelta" in diff).toBe(false);
      }

      cases += 1;
    }

    expect(cases).toBeGreaterThanOrEqual(100);
  });
});
