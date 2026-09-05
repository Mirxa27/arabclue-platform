/**
 * Sectioned drafting, the pure parts.
 *
 * One 12 288-token call for an eighteen-section proposal truncated, spread its
 * depth unevenly and grounded each section in the same 90k characters of
 * everything. The draft is now eighteen bounded calls, each with its own
 * budget and only the context slices its registry entry names, streamed in
 * order through `OrderedFlusher` and verified against the coverage plan's
 * requirement IDs afterwards. These tests pin the registry, the routing, the
 * slicing, the flusher, the split of the deterministic document, assembly and
 * verification — no provider, no network.
 */

import { describe, expect, test } from "bun:test";
import {
  PROPOSAL_SECTIONS,
  OrderedFlusher,
  assembleSections,
  assignCoverageRows,
  buildDeterministicProposal,
  buildDraftingMessages,
  buildSectionUserPrompt,
  deterministicSectionsOf,
  ensureMandatoryLines,
  proposalOutline,
  sectionContextBlocks,
  sectionHeading,
  sectionNumberForCoverageLabel,
  startsWithSectionHeading,
  stripMarkdownFences,
  verifyRequirementCoverage,
  type ContextSliceName,
} from "../agents/drafting";
import {
  HUMAN_APPROVAL_NOTICE,
  HUMAN_APPROVAL_NOTICE_AR,
  LIVE_RESEARCH_BLOCK_TITLE,
  systemDrafting,
  systemDraftingSection,
} from "../agents/prompts";
import { LEGAL_DISCLAIMER, LEGAL_DISCLAIMER_AR } from "../procurement-rules";
import { RAG, ROWS, row, sampleOptions } from "./support/drafting-fixture";

/* -------------------------------------------------------------------------- */

describe("the section registry", () => {
  test("eighteen sections, numbered 1..18, with the budgets the depth needs", () => {
    expect(PROPOSAL_SECTIONS.map((s) => s.number)).toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
    const budget = new Map(PROPOSAL_SECTIONS.map((s) => [s.number, s.maxTokens]));
    for (const n of [4, 5, 6, 12]) expect(budget.get(n)).toBe(2_000);
    for (const n of [2, 7, 9, 10, 13, 15]) expect(budget.get(n)).toBe(1_400);
    for (const n of [1, 3, 8, 11, 14, 16, 17, 18]) expect(budget.get(n)).toBe(1_000);
    for (const s of PROPOSAL_SECTIONS) expect(s.contentBrief.length).toBeGreaterThan(40);
  });

  test("titles are the deterministic template's headings, in both languages", () => {
    const en = deterministicSectionsOf(buildDeterministicProposal({ ...sampleOptions(), locale: "en" }));
    const ar = deterministicSectionsOf(buildDeterministicProposal({ ...sampleOptions(), locale: "ar" }));
    for (const s of PROPOSAL_SECTIONS) {
      expect(en.get(s.number)?.split("\n", 1)[0]).toBe(`## ${s.number}. ${s.titleEn}`);
      expect(ar.get(s.number)?.split("\n", 1)[0]).toBe(`## ${s.number}. ${s.titleAr}`);
    }
  });

  test("each section names exactly the context slices it receives", () => {
    const expected: Record<number, ContextSliceName[]> = {
      1: ["entities", "coverageSummary", "liveResearch"],
      2: ["entities", "tenderContext", "liveResearch"],
      3: ["entities", "technical", "coverageSummary"],
      4: ["tenderContext"],
      5: ["technical"],
      6: ["tenderContext", "technical", "rag"],
      7: ["technical"],
      8: ["technical"],
      9: ["tenderContext", "technical", "compliance"],
      10: ["entities", "tenderContext", "technical"],
      11: ["rag"],
      12: ["rag"],
      13: ["compliance", "liveResearch"],
      14: ["technical"],
      15: ["financial"],
      16: ["entities", "tenderContext"],
      17: ["technical", "liveResearch"],
      18: [],
    };
    for (const s of PROPOSAL_SECTIONS) expect([...s.slices]).toEqual(expected[s.number]);
    const technical: Record<number, string[]> = {
      3: ["evaluationAlignment"],
      5: ["approach", "methodology"],
      6: ["deliveryModel", "matchedProjects"],
      7: ["governance", "qualityPlan"],
      8: ["riskPlan"],
      9: ["securityPrivacy"],
      10: ["serviceManagement"],
      14: ["trainingTransition", "continuity"],
      17: ["vision"],
    };
    for (const s of PROPOSAL_SECTIONS) {
      expect([...(s.technicalFields ?? [])]).toEqual(technical[s.number] ?? []);
    }
    expect(PROPOSAL_SECTIONS[5].ragChars).toBe(15_000);
  });

  test("headings put the locale's title first and the outline marks the current section", () => {
    const five = PROPOSAL_SECTIONS[4];
    expect(sectionHeading(five, "en")).toBe("## 5. Execution Methodology / منهجية التنفيذ");
    expect(sectionHeading(five, "ar")).toBe("## 5. منهجية التنفيذ / Execution Methodology");
    const outline = proposalOutline("en", 5);
    expect(outline.split("\n")).toHaveLength(18);
    expect(outline).toContain("→ ## 5. Execution Methodology");
    expect(outline).toContain("  ## 4. Requirement Coverage Matrix");
  });
});

describe("routing coverage rows to sections", () => {
  test("the coverage planner's labels map to section numbers", () => {
    expect(sectionNumberForCoverageLabel("Security & Privacy")).toBe(9);
    expect(sectionNumberForCoverageLabel("SLA & Service Management")).toBe(10);
    expect(sectionNumberForCoverageLabel("Team & Qualifications")).toBe(11);
    expect(sectionNumberForCoverageLabel("Training & Transition")).toBe(14);
    expect(sectionNumberForCoverageLabel("Risk Management")).toBe(8);
    expect(sectionNumberForCoverageLabel("Quality Management")).toBe(7);
    expect(sectionNumberForCoverageLabel("Business Continuity")).toBe(14);
    expect(sectionNumberForCoverageLabel("Solution Architecture")).toBe(6);
    expect(sectionNumberForCoverageLabel("Compliance")).toBe(13);
    expect(sectionNumberForCoverageLabel("Methodology")).toBe(5);
    expect(sectionNumberForCoverageLabel("Delivery Plan")).toBe(6);
    expect(sectionNumberForCoverageLabel("Technical Response")).toBe(6);
    expect(sectionNumberForCoverageLabel("Something Else")).toBe(6);
  });

  test("every row reaches the matrix, gaps reach the assumptions, the rest go where the label says", () => {
    const assigned = assignCoverageRows({ rows: ROWS });
    const ids = (n: number) => (assigned.get(n) ?? []).map((r) => r.requirementId);
    expect(ids(4)).toEqual(ROWS.map((r) => r.requirementId));
    expect(ids(16)).toEqual(["REQ-003", "REQ-007"]);
    expect(ids(9)).toEqual(["REQ-001"]);
    expect(ids(10)).toEqual(["REQ-002"]);
    expect(ids(11)).toEqual(["REQ-003"]);
    expect(ids(14)).toEqual(["REQ-004", "REQ-007"]);
    expect(ids(8)).toEqual(["REQ-005"]);
    expect(ids(7)).toEqual(["REQ-006"]);
    expect(ids(6)).toEqual(["REQ-008", "REQ-011", "REQ-012"]);
    expect(ids(13)).toEqual(["REQ-009"]);
    expect(ids(5)).toEqual(["REQ-010"]);
    expect(assigned.has(1)).toBe(false);
    expect(assigned.has(18)).toBe(false);
  });

  test("the matrix takes at most sixty rows", () => {
    const many = Array.from({ length: 70 }, (_, i) => row(`REQ-${String(i + 1).padStart(3, "0")}`, "Technical Response"));
    const assigned = assignCoverageRows({ rows: many });
    expect(assigned.get(4)).toHaveLength(60);
    expect(assigned.get(6)).toHaveLength(40);
  });
});

describe("per-section context slicing", () => {
  const opts = sampleOptions();
  const spec = (n: number) => PROPOSAL_SECTIONS[n - 1];
  const prompt = (n: number) => buildSectionUserPrompt(spec(n), opts, assignCoverageRows(opts.coverage).get(n) ?? []);

  test("a section receives its slices and nothing else", () => {
    for (const s of PROPOSAL_SECTIONS) {
      expect(sectionContextBlocks(s, opts).map((b) => b.slice)).toEqual([...s.slices]);
    }
    // Without research, the slice is simply absent rather than an empty fence.
    const dry = sampleOptions({ liveResearch: undefined });
    expect(sectionContextBlocks(spec(13), dry).map((b) => b.slice)).toEqual(["compliance"]);
  });

  test("the RAG corpus never reaches the financial forms, and only reaches 6, 11 and 12", () => {
    expect(prompt(15)).not.toContain("RAG-CORPUS-MARKER");
    expect(prompt(15)).toContain("FINANCIAL-MARKER");
    expect(prompt(15)).not.toContain("COMPLIANCE-MARKER");
    for (const n of [11, 12, 6]) expect(prompt(n)).toContain("RAG-CORPUS-MARKER");
    for (const n of [1, 2, 3, 4, 5, 7, 8, 9, 10, 13, 14, 16, 17, 18]) {
      expect(prompt(n), `section ${n} must not receive the corpus`).not.toContain("RAG-CORPUS-MARKER");
    }
  });

  test("the corpus is capped at 15 000 characters for the architecture and 40 000 elsewhere", () => {
    const rag = (n: number) => sectionContextBlocks(spec(n), opts).find((b) => b.slice === "rag")?.body ?? "";
    expect(rag(6)).toHaveLength(15_000);
    expect(rag(11)).toHaveLength(RAG.length);
    const huge = sampleOptions({ technical: { ...opts.technical, ragContext: "x".repeat(50_000) } });
    expect(sectionContextBlocks(spec(12), huge).find((b) => b.slice === "rag")?.body).toHaveLength(40_000);
  });

  test("the technical package arrives field by field", () => {
    const technical = (n: number) => sectionContextBlocks(spec(n), opts).find((b) => b.slice === "technical")?.body ?? "";
    expect(technical(5)).toContain("APPROACH-MARKER");
    expect(technical(5)).toContain("METHOD-MARKER");
    expect(technical(5)).not.toContain("RISK-MARKER");
    expect(technical(8)).toContain("RISK-MARKER");
    expect(technical(8)).not.toContain("APPROACH-MARKER");
    expect(technical(6)).toContain("DELIVERY-MARKER");
    expect(technical(6)).toContain("PROJECT-MARKER");
    expect(technical(14)).toContain("TRAINING-MARKER");
    expect(technical(14)).toContain("CONTINUITY-MARKER");
    expect(technical(17)).toContain("VISION-MARKER");
    expect(technical(3)).toContain("ALIGNMENT-MARKER");
  });

  test("compliance, research, entities and the coverage summary go only where named", () => {
    expect(prompt(13)).toContain("COMPLIANCE-MARKER");
    expect(prompt(13)).toContain(LIVE_RESEARCH_BLOCK_TITLE);
    expect(prompt(13)).toContain("LIVE-RESEARCH-MARKER");
    expect(prompt(9)).toContain("COMPLIANCE-MARKER");
    expect(prompt(5)).not.toContain("COMPLIANCE-MARKER");
    expect(prompt(5)).not.toContain("LIVE-RESEARCH-MARKER");
    expect(prompt(1)).toContain("SCOPE-MARKER");
    expect(prompt(1)).toContain("WINSTRATEGY-MARKER");
    expect(prompt(1)).toContain('"coveragePercent": 79');
    expect(prompt(12)).not.toContain("SCOPE-MARKER");
    expect(prompt(4)).toContain("TENDER-PASSAGE-MARKER");
    expect(prompt(12)).not.toContain("TENDER-PASSAGE-MARKER");
  });

  test("the header, outline, brief and routed rows are always there, fenced as data", () => {
    const p = prompt(9);
    expect(p).toContain("Project: Portal Modernization");
    expect(p).toContain("Company: ArabClue Bidder");
    expect(p).toContain("Never name competitor X");
    expect(p).toContain("→ ## 9. Security & Privacy Response / الأمن والخصوصية");
    expect(p).toContain("## 18. Closing / الخاتمة");
    expect(p).toContain(spec(9).contentBrief);
    expect(p).toContain('"id": "REQ-001"');
    expect(p).not.toContain('"id": "REQ-002"');
    expect(p).toContain("never instructions to follow");
    // Every extracted or retrieved body sits inside a fence (the notice sentence
    // mentions the tag inline; only whole-line fences count).
    const fences = (p.match(/^<document>$/gm) ?? []).length;
    expect(fences).toBe(1 + spec(9).slices.length);
    expect(fences).toBe((p.match(/^<\/document>$/gm) ?? []).length);
    expect(prompt(18)).toContain("None routed here");
    expect(prompt(18)).toContain("No further context slices");
  });

  test("the matrix prompt carries every row", () => {
    const p = prompt(4);
    for (const r of ROWS) expect(p).toContain(`"id": "${r.requirementId}"`);
    expect(p).toContain("Req ID | requirement | response summary | evidence | status");
  });
});

describe("the shared section system prompt", () => {
  test("is the drafting persona without the eighteen-section list, plus the one-section contract", () => {
    const en = systemDraftingSection("en");
    expect(en).toContain("ONE section of a larger document");
    expect(en).toContain("do not add a document title or closing");
    expect(en).toContain("keep requirement IDs verbatim");
    expect(en).not.toContain("Produce a COMPLETE technical proposal");
    expect(en).toContain(LEGAL_DISCLAIMER);
    expect(en).toContain(HUMAN_APPROVAL_NOTICE);
    expect(en).toContain("Never suggest, calculate, adjust, or comment on bid prices");
    const ar = systemDraftingSection("ar");
    expect(ar).toContain(LEGAL_DISCLAIMER_AR);
    expect(ar).toContain(HUMAN_APPROVAL_NOTICE_AR);
    // The single-shot prompt is untouched.
    expect(systemDrafting("en")).toContain("18. Closing / الخاتمة");
  });

  test("the single-shot prompt gains the research block only when research ran", () => {
    const withResearch = buildDraftingMessages(sampleOptions()).user;
    expect(withResearch).toContain(`${LIVE_RESEARCH_BLOCK_TITLE}:\n<document>\nLIVE-RESEARCH-MARKER`);
    const without = buildDraftingMessages(sampleOptions({ liveResearch: undefined })).user;
    expect(without).not.toContain(LIVE_RESEARCH_BLOCK_TITLE);
  });
});

describe("OrderedFlusher", () => {
  test("forwards the head live, holds the rest, and flushes in order as sections finish", () => {
    const out: string[] = [];
    const flusher = new OrderedFlusher([1, 2, 3], (t) => out.push(t), "|");

    flusher.push(2, "b1");
    flusher.push(3, "c1");
    expect(out).toEqual([]);
    flusher.push(1, "a1");
    expect(out).toEqual(["a1"]);

    flusher.complete(1);
    // 2 is the head now: what it had is flushed, and it goes live.
    expect(out).toEqual(["a1", "|", "b1"]);
    expect(flusher.head).toBe(2);
    flusher.push(2, "b2");
    expect(out).toEqual(["a1", "|", "b1", "b2"]);

    // 3 finishing before 2 changes nothing yet.
    flusher.complete(3);
    expect(out).toEqual(["a1", "|", "b1", "b2"]);
    flusher.complete(2);
    expect(out).toEqual(["a1", "|", "b1", "b2", "|", "c1"]);
    expect(flusher.head).toBeUndefined();
  });

  test("several finished sections behind the head flush together, in order", () => {
    const out: string[] = [];
    const flusher = new OrderedFlusher([1, 2, 3, 4], (t) => out.push(t), "|");
    flusher.push(3, "c");
    flusher.complete(3);
    flusher.push(2, "b");
    flusher.complete(2);
    flusher.push(4, "d");
    expect(out).toEqual([]);
    flusher.push(1, "a");
    flusher.complete(1);
    expect(out).toEqual(["a", "|", "b", "|", "c", "|", "d"]);
    expect(flusher.head).toBe(4);
  });

  test("ignores empty text, late text for a finished section, and everything after close", () => {
    const out: string[] = [];
    const flusher = new OrderedFlusher([1, 2], (t) => out.push(t), "|");
    flusher.push(1, "");
    flusher.push(1, "a");
    flusher.complete(1);
    flusher.push(1, "late");
    expect(out).toEqual(["a"]);
    flusher.close();
    flusher.push(2, "b");
    flusher.complete(2);
    expect(out).toEqual(["a"]);
  });

  test("works without a sink", () => {
    const flusher = new OrderedFlusher([1, 2]);
    flusher.push(2, "b");
    flusher.push(1, "a");
    flusher.complete(1);
    expect(flusher.head).toBe(2);
  });
});

describe("deterministicSectionsOf", () => {
  test("splits the English and Arabic templates into eighteen slices", () => {
    for (const locale of ["en", "ar"] as const) {
      const doc = buildDeterministicProposal({ ...sampleOptions(), locale });
      const sections = deterministicSectionsOf(doc);
      expect([...sections.keys()]).toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
      expect(sections.get(4)).toContain("REQ-001");
      expect(sections.get(15)).toContain("| Portal build | LS | 1 | — | — |");
      expect(sections.get(18)).toContain(locale === "ar" ? HUMAN_APPROVAL_NOTICE_AR : HUMAN_APPROVAL_NOTICE);
      // The title block before section 1 is not a section.
      for (const text of sections.values()) expect(text.startsWith("## ")).toBe(true);
    }
  });

  test("returns nothing for a document without numbered headings", () => {
    expect(deterministicSectionsOf("# Title\n\nJust prose.").size).toBe(0);
  });
});

describe("assembly", () => {
  test("keeps numeric order and gives a section that lost its heading its heading back", () => {
    const md = assembleSections(
      [
        { number: 3, text: "## 3. Evaluation Alignment / مواءمة معايير التقييم\nWeights." },
        { number: 1, text: "Summary without a heading." },
        { number: 2, text: "## ٢. فهم المشروع / Project Understanding\nالنطاق." },
      ],
      "en"
    );
    expect(md).toBe(
      [
        "## 1. Executive Summary / الملخص التنفيذي\nSummary without a heading.",
        "## ٢. فهم المشروع / Project Understanding\nالنطاق.",
        "## 3. Evaluation Alignment / مواءمة معايير التقييم\nWeights.",
      ].join("\n\n")
    );
  });

  test("recognises a heading by its number, not its title spelling", () => {
    expect(startsWithSectionHeading("## 5. Anything\nbody", 5)).toBe(true);
    expect(startsWithSectionHeading("\n\n##  5.  Spaced", 5)).toBe(true);
    expect(startsWithSectionHeading("## 15. Fifteen", 5)).toBe(false);
    expect(startsWithSectionHeading("### 5. Deeper", 5)).toBe(false);
    expect(startsWithSectionHeading("5. No hashes", 5)).toBe(false);
  });

  test("strips an outer markdown fence", () => {
    expect(stripMarkdownFences("```markdown\n## 1. A\nb\n```")).toBe("## 1. A\nb");
    expect(stripMarkdownFences("```\n## 1. A\n```")).toBe("## 1. A");
    expect(stripMarkdownFences("  ## 1. A  ")).toBe("## 1. A");
  });

  test("the lines the single prompt demanded verbatim are appended when missing, once", () => {
    const en = ensureMandatoryLines("## 18. Closing\nDone.", "en");
    expect(en).toContain(LEGAL_DISCLAIMER);
    expect(en).toContain(HUMAN_APPROVAL_NOTICE);
    expect(en).not.toContain(LEGAL_DISCLAIMER_AR);
    expect(ensureMandatoryLines(en, "en")).toBe(en);
    const ar = ensureMandatoryLines("## 18. الخاتمة\nتم.", "ar");
    for (const line of [LEGAL_DISCLAIMER, HUMAN_APPROVAL_NOTICE, LEGAL_DISCLAIMER_AR, HUMAN_APPROVAL_NOTICE_AR]) {
      expect(ar).toContain(line);
    }
  });
});

describe("verifyRequirementCoverage", () => {
  test("lists the requirement IDs the draft never mentions verbatim", () => {
    const md = "## 4. Matrix\n| REQ-001 | … |\n\nREQ-003 is answered in section 11.";
    expect(verifyRequirementCoverage(md, { rows: ROWS.slice(0, 3) })).toEqual(["REQ-002"]);
    expect(verifyRequirementCoverage("", { rows: [] })).toEqual([]);
    expect(verifyRequirementCoverage("nothing", { rows: ROWS.slice(0, 2) })).toEqual(["REQ-001", "REQ-002"]);
  });
});
