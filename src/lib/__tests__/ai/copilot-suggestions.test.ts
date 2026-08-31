import { describe, expect, test } from "bun:test";
import {
  applySuggestion,
  applySuggestions,
  type RawCopilotSuggestion,
} from "../../ai/copilot-anchors";
import { reconcileSuggestions } from "../../ai/copilot-suggestions";

const DOC = `## نطاق العمل

نقدم خدمات الدعم الفني.

## الامتثال

الشركة ملتزمة بالأنظمة.
`;

function raw(over: Partial<RawCopilotSuggestion> = {}): RawCopilotSuggestion {
  return {
    anchor: "نقدم خدمات الدعم الفني.",
    replacement: "نقدم خدمات دعم فني على مدار الساعة طوال أيام الأسبوع.",
    rationale: "Quantifies the support commitment the tender asks for.",
    risk: "LOW",
    kind: "clarity",
    ...over,
  };
}

describe("reconcileSuggestions", () => {
  test("keeps a suggestion whose anchor appears exactly once", () => {
    const out = reconcileSuggestions(DOC, [raw()]);
    expect(out).toHaveLength(1);
    expect(out[0].anchor).toBe("نقدم خدمات الدعم الفني.");
    expect(out[0].id).toMatch(/^[0-9a-f]{12}$/);
  });

  test("drops an anchor the model invented — it is not in the document", () => {
    const out = reconcileSuggestions(DOC, [
      raw({ anchor: "نقدم خدمات لم تُكتب في المستند." }),
    ]);
    expect(out).toEqual([]);
  });

  test("drops an ambiguous anchor that appears more than once", () => {
    const doubled = `${DOC}\nنقدم خدمات الدعم الفني.\n`;
    expect(reconcileSuggestions(doubled, [raw()])).toEqual([]);
  });

  test("drops a no-op where the replacement equals the anchor", () => {
    const out = reconcileSuggestions(DOC, [
      raw({ replacement: "نقدم خدمات الدعم الفني." }),
    ]);
    expect(out).toEqual([]);
  });

  test("drops a replacement that trips the pricing guardrail", () => {
    const out = reconcileSuggestions(DOC, [
      raw({ replacement: "السعر المقترح لهذه الخدمة هو 500,000 ريال." }),
    ]);
    expect(out).toEqual([]);
  });

  test("drops an empty anchor", () => {
    expect(reconcileSuggestions(DOC, [raw({ anchor: "   " })])).toEqual([]);
  });

  test("gives the same suggestion the same id across passes, so dismissals stick", () => {
    const first = reconcileSuggestions(DOC, [raw()]);
    const second = reconcileSuggestions(DOC, [raw()]);
    expect(second[0].id).toBe(first[0].id);
  });

  test("gives different suggestions different ids", () => {
    const out = reconcileSuggestions(DOC, [
      raw(),
      raw({
        anchor: "الشركة ملتزمة بالأنظمة.",
        replacement: "الشركة ملتزمة بنظام المنافسات والمشتريات الحكومية.",
        kind: "compliance",
      }),
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].id).not.toBe(out[1].id);
  });
});

describe("applySuggestion", () => {
  test("replaces the anchor and leaves the rest of the document byte-identical", () => {
    const [s] = reconcileSuggestions(DOC, [raw()]);
    const next = applySuggestion(DOC, s);
    expect(next).toBe(DOC.replace(s.anchor, s.replacement));
    expect(next).toContain("## الامتثال");
  });

  test("returns null when the anchor is gone — the user edited it meanwhile", () => {
    const [s] = reconcileSuggestions(DOC, [raw()]);
    const edited = DOC.replace("نقدم خدمات الدعم الفني.", "نقدم دعمًا.");
    expect(applySuggestion(edited, s)).toBeNull();
  });
});

describe("applySuggestions (bulk accept)", () => {
  test("applies every suggestion and reports what landed", () => {
    const list = reconcileSuggestions(DOC, [
      raw(),
      raw({
        anchor: "الشركة ملتزمة بالأنظمة.",
        replacement: "الشركة ملتزمة بنظام المنافسات والمشتريات الحكومية.",
        kind: "compliance",
      }),
    ]);
    const out = applySuggestions(DOC, list);
    expect(out.applied).toEqual([list[0].id, list[1].id]);
    expect(out.skipped).toEqual([]);
    expect(out.content).toContain("طوال أيام الأسبوع");
    expect(out.content).toContain("نظام المنافسات والمشتريات الحكومية");
  });

  test("skips a suggestion an earlier one invalidated instead of corrupting the document", () => {
    const overlapping = reconcileSuggestions(DOC, [
      raw(),
      raw({
        anchor: "خدمات الدعم الفني",
        replacement: "خدمات الإسناد",
        kind: "clarity",
      }),
    ]);
    expect(overlapping).toHaveLength(2);
    const out = applySuggestions(DOC, overlapping);
    expect(out.applied).toEqual([overlapping[0].id]);
    expect(out.skipped).toEqual([overlapping[1].id]);
    expect(out.content).toBe(DOC.replace(raw().anchor, raw().replacement));
  });

  test("returns the document untouched when nothing is accepted", () => {
    const out = applySuggestions(DOC, []);
    expect(out.content).toBe(DOC);
    expect(out.applied).toEqual([]);
    expect(out.skipped).toEqual([]);
  });
});
