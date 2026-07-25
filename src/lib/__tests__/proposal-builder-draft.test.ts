import { describe, expect, test } from "bun:test";
import {
  consumePendingProposalBuilderDraft,
  writePendingProposalBuilderDraft,
  clearPendingProposalBuilderDraftForTests,
} from "../proposal-builder-draft";
import { sectionsFromTemplateTypes, sectionsToPrintableHtml } from "../proposal-builder-engine";
import { SYSTEM_TEMPLATE_CATALOG } from "../template-marketplace-catalog";

describe("proposal-builder-draft handoff", () => {
  test("round-trips marketplace draft through memory or sessionStorage", () => {
    clearPendingProposalBuilderDraftForTests();
    const template = SYSTEM_TEMPLATE_CATALOG[0];
    const sections = sectionsFromTemplateTypes(template.sectionTypes);
    writePendingProposalBuilderDraft({
      source: "marketplace",
      templateId: template.id,
      templateKey: template.templateKey,
      title: template.name,
      sections,
      projectId: "proj_1",
    });
    const consumed = consumePendingProposalBuilderDraft();
    expect(consumed?.source).toBe("marketplace");
    expect(consumed?.templateKey).toBe(template.templateKey);
    expect(consumed?.sections.length).toBe(sections.length);
    expect(consumed?.projectId).toBe("proj_1");
    expect(consumePendingProposalBuilderDraft()).toBeNull();
  });

  test("system catalog templates produce editable section shells", () => {
    for (const template of SYSTEM_TEMPLATE_CATALOG) {
      const sections = sectionsFromTemplateTypes(template.sectionTypes);
      expect(sections.length).toBeGreaterThan(0);
      expect(sections.every((s) => s.content.ar && s.content.en)).toBe(true);
    }
  });

  test("sections compile to printable HTML without scripts", () => {
    const sections = sectionsFromTemplateTypes(["cover", "executive-summary"]);
    const html = sectionsToPrintableHtml(
      sections,
      { title: { ar: "عرض", en: "Proposal" } },
      "en"
    );
    expect(html).toContain("<h1>Proposal</h1>");
    expect(html).toContain("<h2>");
    expect(html).not.toContain("<script");
  });
});
