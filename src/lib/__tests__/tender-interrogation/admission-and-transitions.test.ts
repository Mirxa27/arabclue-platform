/**
 * The two gates between a model's answer and a stored question: quotes must
 * be verbatim in the window the model saw, and status changes must follow the
 * triage machine.
 */

import { describe, expect, test } from "bun:test";
import { admitModelFindings } from "@/lib/ai/tender-interrogation";
import { STATUS_TRANSITIONS, canTransition } from "@/lib/tender-interrogation/repository";
import type { ModelFinding } from "@/lib/tender-interrogation/prompt";
import type { SourcePassage } from "@/lib/tender-interrogation/types";

const passages: SourcePassage[] = [
  { id: "ch-1", documentId: "doc", documentName: "RFP.pdf", chunkIndex: 0, text: "The contractor shall respond within 10 days of notification. Liability is unlimited.", pageRef: "7", sectionHeading: "Obligations", language: "en" },
];
const window = { index: 2, chars: 90, passages };
const passageIds = new Map([["P1", "ch-1"]]);
const meta = { provider: "openai", model: "gpt-x", windowIndex: 2 };

const base: ModelFinding = {
  kind: "AMBIGUITY",
  severity: "MINOR",
  titleEn: "Working or calendar days",
  titleAr: "أيام عمل أم تقويمية",
  rationaleEn: "The response window changes materially.",
  rationaleAr: "تختلف مدة الاستجابة اختلافاً جوهرياً.",
  questionEn: "We kindly request the Entity to confirm whether the 10 days are working days.",
  questionAr: "نرجو من الجهة الحكومية التكرم بتأكيد ما إذا كانت الأيام العشرة أيام عمل.",
  quotes: [{ passage: "P1", text: "respond within 10 days of notification" }],
};

describe("model finding admission", () => {
  test("a grounded finding is admitted with the passage's document, page and heading", () => {
    const { findings, grounded, rejected, dropped } = admitModelFindings([base], window, passageIds, meta);
    expect(findings).toHaveLength(1);
    expect(findings[0].provenance).toBe("AI_GENERATED");
    expect(findings[0].quotes[0]).toMatchObject({ documentName: "RFP.pdf", pageRef: "7", sectionHeading: "Obligations" });
    expect(findings[0].provenanceDetail).toEqual({ provider: "openai", model: "gpt-x", windowIndex: 2 });
    expect(findings[0].fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect({ grounded, rejected, dropped }).toEqual({ grounded: 1, rejected: 0, dropped: 0 });
  });

  test("a fabricated quote is rejected; a finding with only fabricated quotes is dropped", () => {
    const mixed: ModelFinding = { ...base, quotes: [{ passage: "P1", text: "the penalty is capped at 25% of the contract value" }, base.quotes[0]] };
    const fabricated: ModelFinding = { ...base, kind: "RISK_CLAUSE", quotes: [{ passage: "P1", text: "the entity may seize the performance bond without cause" }] };
    const result = admitModelFindings([mixed, fabricated], window, passageIds, meta);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].quotes).toHaveLength(1);
    expect(result).toMatchObject({ grounded: 1, rejected: 2, dropped: 1 });
  });

  test("a quote is found even when the model names the wrong passage", () => {
    const wrongLabel: ModelFinding = { ...base, quotes: [{ passage: "P9", text: "Liability is unlimited" }] };
    const result = admitModelFindings([wrongLabel], window, passageIds, meta);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].quotes[0].documentName).toBe("RFP.pdf");
  });
});

describe("triage transitions", () => {
  test("the machine allows the working loop and refuses shortcuts", () => {
    expect(canTransition("PROPOSED", "KEPT")).toBe(true);
    expect(canTransition("PROPOSED", "DROPPED")).toBe(true);
    expect(canTransition("PROPOSED", "SUBMITTED")).toBe(false);
    expect(canTransition("PROPOSED", "ANSWERED")).toBe(false);
    expect(canTransition("KEPT", "SUBMITTED")).toBe(true);
    expect(canTransition("SUBMITTED", "ANSWERED")).toBe(true);
    expect(canTransition("ANSWERED", "SUBMITTED")).toBe(true);
    expect(canTransition("ANSWERED", "DROPPED")).toBe(false);
    expect(canTransition("DROPPED", "PROPOSED")).toBe(true);
    // Every status has at least one way out, so nothing is a dead end.
    for (const [from, to] of Object.entries(STATUS_TRANSITIONS)) expect(to.length, from).toBeGreaterThan(0);
  });
});
