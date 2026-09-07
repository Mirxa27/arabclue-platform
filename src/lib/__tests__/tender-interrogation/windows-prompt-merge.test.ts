import { describe, expect, test } from "bun:test";
import {
  interrogationRelevance,
  selectInterrogationWindows,
} from "@/lib/tender-interrogation/windows";
import {
  MAX_USER_PROMPT_CHARS,
  buildInterrogationSystemPrompt,
  buildInterrogationUserPrompt,
  parseInterrogationAnswer,
} from "@/lib/tender-interrogation/prompt";
import { mergeFindings } from "@/lib/tender-interrogation/merge";
import { clarityScore, summarizeClarity } from "@/lib/tender-interrogation/clarity";
import { SYSTEM_PROMPT_BUDGET_CHARS } from "@/lib/ai/style-guide";
import type { Finding, SourcePassage } from "@/lib/tender-interrogation/types";

function passage(id: string, text: string, over: Partial<SourcePassage> = {}): SourcePassage {
  return {
    id,
    documentId: over.documentId ?? "doc",
    documentName: over.documentName ?? "RFP.pdf",
    chunkIndex: over.chunkIndex ?? (Number(id.replace(/\D/g, "")) || 0),
    text,
    pageRef: over.pageRef ?? null,
    sectionHeading: over.sectionHeading ?? null,
    language: null,
  };
}

const finding = (over: Partial<Finding> & { fingerprint: string; kind: Finding["kind"] }): Finding => ({
  severity: "MAJOR",
  titleEn: "t", titleAr: "ع", rationaleEn: "r", rationaleAr: "س", questionEn: "q?", questionAr: "س؟",
  quotes: [],
  provenance: "AI_GENERATED",
  provenanceDetail: {},
  ...over,
});

describe("window selection", () => {
  test("dense clauses outrank long boilerplate, per character", () => {
    const dense = "The submission deadline is 2026-03-15; penalty 1% per week, maximum 10%; technical weight 70%.";
    const boiler = `${"The Kingdom of Saudi Arabia continues its journey of growth and prosperity for all. ".repeat(12)}`;
    expect(interrogationRelevance(dense)).toBeGreaterThan(interrogationRelevance(boiler));
  });

  test("keeps the most relevant passages within the budget and packs them in reading order", () => {
    const passages = [
      passage("p1", "Introduction and background. ".repeat(40), { chunkIndex: 1 }),
      passage("p2", "Submission deadline 2026-03-15. Technical weight 70%, financial 30%. Penalty 1% per week, max 10%.", { chunkIndex: 2 }),
      passage("p3", "Scope of work: the contractor shall deliver the platform; liability shall be unlimited; see Annex 3.", { chunkIndex: 3 }),
      passage("p4", "Company history and vision statements. ".repeat(40), { chunkIndex: 4 }),
    ];
    const windows = selectInterrogationWindows(passages, { maxWindows: 1, windowChars: 400 });
    expect(windows).toHaveLength(1);
    expect(windows[0].passages.map((p) => p.id)).toEqual(["p2", "p3"]);
    expect(windows[0].chars).toBeLessThanOrEqual(400);
  });

  test("splits into several windows and never exceeds maxWindows", () => {
    const passages = Array.from({ length: 30 }, (_, i) =>
      passage(`p${i}`, `Clause ${i}: the contractor shall deliver within 30 days; penalty 1%; deadline 2026-01-${String((i % 28) + 1).padStart(2, "0")}. ${"x".repeat(300)}`, { chunkIndex: i })
    );
    const windows = selectInterrogationWindows(passages, { maxWindows: 3, windowChars: 1_500 });
    expect(windows.length).toBeLessThanOrEqual(3);
    expect(windows.every((w) => w.chars <= 1_500)).toBe(true);
    // Reading order inside each window.
    for (const w of windows) {
      const idx = w.passages.map((p) => p.chunkIndex);
      expect([...idx].sort((a, b) => a - b)).toEqual(idx);
    }
  });

  test("ignores fragments shorter than a clause", () => {
    expect(selectInterrogationWindows([passage("p1", "Annex 1")])).toEqual([]);
  });
});

describe("prompts", () => {
  test("the system prompt fits the shared budget and carries the invariants", () => {
    for (const locale of ["ar", "en"] as const) {
      const system = buildInterrogationSystemPrompt(locale);
      expect(system.length).toBeLessThanOrEqual(SYSTEM_PROMPT_BUDGET_CHARS + 2_500);
      expect(system).toContain("HARD RULE");
      expect(system).toContain("VERBATIM");
      expect(system).toContain('{"findings":[]}');
    }
  });

  test("the user prompt labels passages and maps labels back to ids", () => {
    const window = { index: 0, chars: 0, passages: [passage("chunk-a", "Deadline 2026-03-15.".padEnd(60, " x"), { pageRef: "4", sectionHeading: "Instructions" })] };
    const { prompt, passageIds } = buildInterrogationUserPrompt(window, {
      projectTitle: "Cloud Services",
      etimadRef: "ET-1",
      alreadyRaised: ["Submission deadline stated differently"],
    });
    expect(prompt).toContain("[P1 · RFP.pdf · p. 4 · Instructions]");
    expect(prompt).toContain("do not repeat");
    expect(prompt).toContain("<document>");
    expect(passageIds.get("P1")).toBe("chunk-a");
    expect(prompt.length).toBeLessThanOrEqual(MAX_USER_PROMPT_CHARS);
  });
});

describe("answer parsing", () => {
  const good = {
    findings: [
      {
        kind: "AMBIGUITY",
        severity: "MINOR",
        titleEn: "Working vs calendar days",
        titleAr: "أيام عمل أم تقويمية",
        rationaleEn: "The response window changes by 40%.",
        rationaleAr: "تختلف مدة الاستجابة بنسبة كبيرة.",
        questionEn: "We kindly request the Entity to confirm whether the 10 days are working days.",
        questionAr: "نرجو من الجهة الحكومية التكرم بتأكيد ما إذا كانت الأيام العشرة أيام عمل.",
        quotes: [{ passage: "P1", text: "respond within 10 days of notification" }],
      },
    ],
  };

  test("accepts a fenced, prose-wrapped answer", () => {
    const result = parseInterrogationAnswer(`Here you go:\n\`\`\`json\n${JSON.stringify(good)}\n\`\`\``);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.findings[0].kind).toBe("AMBIGUITY");
  });

  test("rejects an unknown kind, a finding without quotes, and a non-object", () => {
    const badKind = { findings: [{ ...good.findings[0], kind: "OPINION" }] };
    expect(parseInterrogationAnswer(JSON.stringify(badKind)).ok).toBe(false);
    const noQuotes = { findings: [{ ...good.findings[0], quotes: [] }] };
    expect(parseInterrogationAnswer(JSON.stringify(noQuotes)).ok).toBe(false);
    expect(parseInterrogationAnswer("[]").ok).toBe(false);
  });
});

describe("merge", () => {
  test("drops a model finding that repeats a deterministic one, keeps new ones, sorts by severity", () => {
    const quote = { text: "The submission deadline for all bids is 20 March 2026 at 10:00.", documentId: "d", documentName: "RFP.pdf", pageRef: "2", sectionHeading: null };
    const det = [finding({ fingerprint: "a", kind: "CONTRADICTION", severity: "CRITICAL", provenance: "DETERMINISTIC", quotes: [quote] })];
    const ai = [
      finding({ fingerprint: "b", kind: "CONTRADICTION", quotes: [{ ...quote, text: "submission deadline for all bids is 20 March 2026" }] }),
      finding({ fingerprint: "c", kind: "AMBIGUITY", severity: "MINOR", quotes: [{ ...quote, text: "acceptance shall follow the entity's internal procedures" }] }),
      finding({ fingerprint: "d", kind: "RISK_CLAUSE", severity: "MAJOR", quotes: [{ ...quote, text: "the contractor bears unlimited liability for consequential loss" }] }),
      finding({ fingerprint: "a", kind: "CONTRADICTION" }),
    ];
    const merged = mergeFindings(det, ai);
    expect(merged.map((f) => f.fingerprint)).toEqual(["a", "d", "c"]);
  });
});

describe("clarity", () => {
  test("weights open findings and ignores dropped and answered ones", () => {
    expect(clarityScore([])).toBe(100);
    expect(
      clarityScore([
        { severity: "CRITICAL", status: "PROPOSED" },
        { severity: "MAJOR", status: "KEPT" },
        { severity: "MINOR", status: "SUBMITTED" },
        { severity: "CRITICAL", status: "ANSWERED" },
        { severity: "MAJOR", status: "DROPPED" },
      ])
    ).toBe(100 - 15 - 6 - 2);
    expect(clarityScore(Array.from({ length: 10 }, () => ({ severity: "CRITICAL" as const, status: "KEPT" as const })))).toBe(0);
  });

  test("the summary counts by status and open severity", () => {
    const s = summarizeClarity([
      { severity: "CRITICAL", status: "PROPOSED" },
      { severity: "MAJOR", status: "DROPPED" },
    ]);
    expect(s).toMatchObject({ score: 85, total: 2, open: 1 });
    expect(s.byStatus.DROPPED).toBe(1);
    expect(s.bySeverity.MAJOR).toBe(0);
  });
});
