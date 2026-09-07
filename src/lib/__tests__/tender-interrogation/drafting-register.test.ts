/**
 * The clarifications register reaches the proposal: the single-shot prompt,
 * the section-8 and section-16 slices, and the deterministic document all
 * carry the kept questions and the entity's recorded answers.
 */

import { describe, expect, test } from "bun:test";
import {
  PROPOSAL_SECTIONS,
  buildDeterministicProposal,
  buildDraftingMessages,
  sectionContextBlocks,
} from "@/lib/agents/drafting";
import {
  CLARIFICATIONS_BLOCK_TITLE,
  REGISTER_MAX_CHARS,
  clarificationsRegisterMarkdown,
  formatClarificationsRegister,
  type RegisterItem,
} from "@/lib/tender-interrogation/register";
import { sampleOptions } from "../support/drafting-fixture";

const quote = { text: "The submission deadline for all bids is 20 March 2026.", documentId: "d", documentName: "RFP.pdf", pageRef: "2", sectionHeading: null };

const ITEMS: RegisterItem[] = [
  {
    id: "c1", severity: "CRITICAL", status: "KEPT",
    titleEn: "Submission deadline stated differently", titleAr: "تعارض في آخر موعد",
    questionEn: "We kindly request the Entity to confirm which submission date governs.",
    questionAr: "نرجو من الجهة الحكومية التكرم بتأكيد التاريخ النافذ لتقديم العروض.",
    quotes: [quote], answerMd: null, answeredAt: null, submittedAt: null,
  },
  {
    id: "c2", severity: "MINOR", status: "ANSWERED",
    titleEn: "Working vs calendar days", titleAr: "أيام عمل أم تقويمية",
    questionEn: "We kindly request the Entity to confirm whether the 10 days are working days.",
    questionAr: "نرجو من الجهة الحكومية التكرم بتأكيد ما إذا كانت الأيام العشرة أيام عمل.",
    quotes: [], answerMd: "Working days.", answeredAt: "2026-09-06T08:00:00Z", submittedAt: "2026-09-05T08:00:00Z",
  },
];

describe("register formatting", () => {
  test("plain-text register carries both questions, the reference and the status", () => {
    const text = formatClarificationsRegister(ITEMS)!;
    expect(text).toContain("[C1] CRITICAL · Submission deadline stated differently");
    expect(text).toContain("Question (AR): نرجو من الجهة الحكومية");
    expect(text).toContain("Tender reference: RFP.pdf, p. 2 — “The submission deadline");
    expect(text).toContain("Status: Open — not yet submitted (treated as an assumption)");
    expect(text).toContain("[C2] MINOR");
    expect(text).toContain("Answered by the entity on 2026-09-06: Working days.");
    expect(formatClarificationsRegister([])).toBeNull();
  });

  test("the register is bounded", () => {
    const many = Array.from({ length: 80 }, (_, i) => ({ ...ITEMS[0], id: `c${i}`, questionEn: "x".repeat(900), questionAr: "س".repeat(900) }));
    expect(formatClarificationsRegister(many)!.length).toBeLessThanOrEqual(REGISTER_MAX_CHARS + 1);
  });

  test("markdown bullets follow the document locale", () => {
    expect(clarificationsRegisterMarkdown(ITEMS, "ar")).toContain("- **C1.** نرجو من الجهة الحكومية التكرم بتأكيد التاريخ النافذ");
    expect(clarificationsRegisterMarkdown(ITEMS, "ar")).toContain("أجابت الجهة بتاريخ 2026-09-06: Working days.");
    expect(clarificationsRegisterMarkdown(ITEMS, "en")).toContain("- **C2.** We kindly request the Entity to confirm whether the 10 days");
    expect(clarificationsRegisterMarkdown([], "en")).toBe("");
  });
});

describe("the register reaches the draft", () => {
  test("the single-shot prompt carries the block only when there are items", () => {
    const withItems = buildDraftingMessages({ ...sampleOptions(), clarifications: ITEMS });
    expect(withItems.user).toContain(CLARIFICATIONS_BLOCK_TITLE);
    expect(withItems.user).toContain("[C1] CRITICAL");
    expect(withItems.user).toContain("In section 16, list every entry of the clarifications register");
    const without = buildDraftingMessages(sampleOptions({ clarifications: [] }));
    expect(without.user).not.toContain(CLARIFICATIONS_BLOCK_TITLE);
  });

  test("sections 8 and 16 receive the register slice; section 2 does not", () => {
    const opts = { ...sampleOptions(), clarifications: ITEMS };
    const spec = (n: number) => PROPOSAL_SECTIONS.find((s) => s.number === n)!;
    const titles = (n: number) => sectionContextBlocks(spec(n), opts).map((b) => b.title);
    expect(titles(16)).toContain(CLARIFICATIONS_BLOCK_TITLE);
    expect(titles(8)).toContain(CLARIFICATIONS_BLOCK_TITLE);
    expect(titles(2)).not.toContain(CLARIFICATIONS_BLOCK_TITLE);
    // Without items the slice is silent rather than an empty fence.
    expect(sectionContextBlocks(spec(16), sampleOptions({ clarifications: [] })).map((b) => b.title)).not.toContain(CLARIFICATIONS_BLOCK_TITLE);
  });

  test("the deterministic document lists the register under section 16 in both locales", () => {
    const en = buildDeterministicProposal({ ...sampleOptions(), locale: "en", clarifications: ITEMS });
    const section16 = en.slice(en.indexOf("## 16."), en.indexOf("## 17."));
    expect(section16).toContain("Clarifications register (questions to the entity):");
    expect(section16).toContain("**C1.** We kindly request the Entity to confirm which submission date governs.");
    expect(section16).toContain("Answered by the entity on 2026-09-06: Working days.");
    const ar = buildDeterministicProposal({ ...sampleOptions(), locale: "ar", clarifications: ITEMS });
    const section16Ar = ar.slice(ar.indexOf("## 16."), ar.indexOf("## 17."));
    expect(section16Ar).toContain("سجل الاستفسارات المقدَّمة للجهة");
    expect(buildDeterministicProposal({ ...sampleOptions({ clarifications: [] }), locale: "en" })).not.toContain("Clarifications register");
  });
});
