import { describe, expect, test } from "bun:test";
import {
  asciiDigits,
  clipQuote,
  normalizeForMatch,
  splitSentences,
} from "@/lib/tender-interrogation/text";
import {
  fingerprintFinding,
  fingerprintUserQuestion,
} from "@/lib/tender-interrogation/fingerprint";
import {
  buildGroundingIndex,
  groundQuote,
} from "@/lib/tender-interrogation/grounding";
import type { SourcePassage } from "@/lib/tender-interrogation/types";

function passage(over: Partial<SourcePassage> & { id: string; text: string }): SourcePassage {
  return {
    documentId: "doc-1",
    documentName: "RFP.pdf",
    chunkIndex: 0,
    pageRef: "3",
    sectionHeading: null,
    language: "mixed",
    ...over,
  };
}

describe("text normalization", () => {
  test("Arabic-Indic digits and the Arabic percent sign become ASCII", () => {
    expect(asciiDigits("الوزن الفني ٧٠٪ والمالي ۳۰٪")).toBe("الوزن الفني 70% والمالي 30%");
  });

  test("harakat, tatweel, alef and taa-marbuta variants compare equal", () => {
    expect(normalizeForMatch("الغَرامَةُ الأُسبوعيّة")).toBe(normalizeForMatch("الغرامه الاسبوعيه"));
    expect(normalizeForMatch("مـدة   التنفيـذ")).toBe("مده التنفيذ");
  });

  test("punctuation is dropped but the percent sign survives", () => {
    expect(normalizeForMatch("Technical: 70%, financial — 30%.")).toBe("technical 70% financial 30%");
  });

  test("sentences split on terminal punctuation, Arabic question marks and form feeds", () => {
    const parts = splitSentences("First sentence here. هل هذا سؤال؟ Third one is fine\fPage two starts here");
    expect(parts).toEqual([
      "First sentence here.",
      "هل هذا سؤال؟",
      "Third one is fine",
      "Page two starts here",
    ]);
  });

  test("a clipped quote stays a verbatim run of whole words around the match", () => {
    const sentence = `${"alpha ".repeat(40)}DEADLINE 2026-01-01 ${"omega ".repeat(40)}`.trim();
    const idx = sentence.indexOf("DEADLINE");
    const quote = clipQuote(sentence, idx, 120);
    expect(quote.startsWith("…")).toBe(true);
    expect(quote.endsWith("…")).toBe(true);
    const inner = quote.replace(/^…|…$/g, "");
    expect(inner).toContain("DEADLINE 2026-01-01");
    expect(sentence).toContain(inner);
    expect(inner.length).toBeLessThanOrEqual(120);
  });
});

describe("fingerprint", () => {
  test("is stable under harakat, spacing and punctuation differences", () => {
    const a = fingerprintFinding("CONTRADICTION", { quoteText: "آخر موعد لتقديم العروض: 15/03/2026." });
    const b = fingerprintFinding("CONTRADICTION", { quoteText: "آخِر  موعد لتقديم العروض  15/03/2026" });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  test("changes with the kind and with the rule key of an absence finding", () => {
    const q = { quoteText: "within 30 days" };
    expect(fingerprintFinding("AMBIGUITY", q)).not.toBe(fingerprintFinding("RISK_CLAUSE", q));
    expect(
      fingerprintFinding("MISSING_INFO", { detectorId: "missing-mandatory", key: "deadline" })
    ).not.toBe(fingerprintFinding("MISSING_INFO", { detectorId: "missing-mandatory", key: "sla" }));
  });

  test("a person's question has its own identity", () => {
    expect(fingerprintUserQuestion("Is VAT included?", "هل يشمل ضريبة القيمة المضافة؟")).toBe(
      fingerprintUserQuestion("Is VAT  included ?", "هل يشمل ضريبة القيمة المضافة")
    );
  });
});

describe("grounding gate", () => {
  const passages = [
    passage({ id: "p1", chunkIndex: 0, text: "يجب تقديم العروض قبل تاريخ 15/03/2026 عبر منصة اعتماد. تُطبَّق غرامة تأخير 1% أسبوعياً." }),
    passage({ id: "p2", chunkIndex: 1, text: "بحد أقصى 10% من قيمة العقد. The technical weight is 70% and the financial weight is 30%." }),
  ];
  const index = buildGroundingIndex(passages);

  test("accepts a verbatim quote and names its passage", () => {
    expect(groundQuote("The technical weight is 70%", index)).toEqual({ passageId: "p2", grounded: true });
  });

  test("tolerates harakat and punctuation differences in the quote", () => {
    expect(groundQuote("تُطبق غرامة تأخير 1% أسبوعيا", index).grounded).toBe(true);
  });

  test("prefers the passage the model named when it contains the quote", () => {
    expect(groundQuote("بحد أقصى 10% من قيمة العقد", index, "p2").passageId).toBe("p2");
  });

  test("accepts a quote that straddles two adjacent chunks of one document", () => {
    expect(groundQuote("أسبوعياً. بحد أقصى 10%", index).grounded).toBe(true);
  });

  test("rejects a fabricated quote and a quote too short to be a citation", () => {
    expect(groundQuote("The penalty is capped at 25% of the contract value", index).grounded).toBe(false);
    expect(groundQuote("70%", index).grounded).toBe(false);
  });
});
