import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  capPerGroup,
  lexicalTsQuery,
  normalizeForSearch,
  rrfFuse,
  searchTerms,
} from "../rag-search";
import { chunkDocument, detectLanguage, looksLikeHeading } from "../document-chunks";

describe("normalizeForSearch mirrors the generated tsv column", () => {
  test("strips harakat and tatweel, folds alef, taa marbuta and alef maqsura", () => {
    expect(normalizeForSearch("مُتَطَلَّبَات")).toBe("متطلبات");
    expect(normalizeForSearch("أإآ ة ى ـــ")).toBe("ااا ه ي ");
  });

  test("the migration applies the same folds (kept in one place each)", () => {
    const sql = readFileSync(
      join(process.cwd(), "prisma/migrations/20260905200000_rag_pgvector/migration.sql"),
      "utf8"
    );
    expect(sql).toContain("translate(");
    expect(sql).toContain("'أإآةى', 'اااهي'");
    expect(sql).toContain("GENERATED ALWAYS AS");
    expect(sql).toContain("CREATE EXTENSION IF NOT EXISTS vector");
  });
});

describe("searchTerms and lexicalTsQuery", () => {
  test("Arabic query words lose the definite article and become prefix matches", () => {
    const terms = searchTerms("متطلبات الأمن السيبراني");
    expect(terms).toContain("امن");
    expect(terms).toContain("سيبراني");
    expect(terms).not.toContain("الامن");
    expect(lexicalTsQuery("الأمن")).toBe("'امن':*");
  });

  test("English is lowercased, deduplicated, short tokens dropped, punctuation escaped", () => {
    expect(searchTerms("NCA ECC controls, controls; a b")).toEqual(["controls", "nca", "ecc"]);
    // Punctuation splits words, so no tsquery syntax can leak in from a query.
    expect(lexicalTsQuery("O'Brien policy & (x)")).toBe("'policy':* | 'brien':*");
  });

  test("a query with no usable term yields an empty tsquery", () => {
    expect(lexicalTsQuery("a b !")).toBe("");
  });
});

describe("rrfFuse", () => {
  test("an id ranked by both signals beats an id ranked first by one", () => {
    const fused = rrfFuse([
      [{ id: "both", rank: 2, score: 0.5 }, { id: "dense-only", rank: 1, score: 0.9 }],
      [{ id: "both", rank: 1, score: 3 }, { id: "lex-only", rank: 2, score: 2 }],
    ]);
    expect(fused[0].id).toBe("both");
    expect(fused[0].signals).toEqual({ 0: 0.5, 1: 3 });
    expect(fused.map((f) => f.id)).toEqual(["both", "dense-only", "lex-only"]);
  });

  test("ties break deterministically and empty rankings are fine", () => {
    expect(rrfFuse([[], []])).toEqual([]);
    const fused = rrfFuse([[{ id: "b", rank: 1, score: 1 }], [{ id: "a", rank: 1, score: 1 }]]);
    expect(fused.map((f) => f.id)).toEqual(["a", "b"]);
  });
});

describe("capPerGroup", () => {
  test("keeps order and at most the cap per group", () => {
    const items = ["d1", "d1", "d2", "d1", "d3", "d2"].map((doc, i) => ({ doc, i }));
    expect(capPerGroup(items, (x) => x.doc, 2).map((x) => x.i)).toEqual([0, 1, 2, 4, 5]);
  });
});

describe("structure-aware chunking", () => {
  const arabicRfp = [
    "كراسة الشروط والمواصفات",
    "",
    "المادة 1 نطاق العمل",
    "توفير خدمات استضافة سحابية حكومية داخل المملكة مع مراكز بيانات في الرياض والدمام. " .repeat(6),
    "",
    "المادة 2 الأمن السيبراني",
    "يلتزم المتعاقد بالضوابط الأساسية للأمن السيبراني الصادرة عن الهيئة الوطنية للأمن السيبراني. ".repeat(6),
    "\f",
    "3.1 Service levels",
    "Availability shall be 99.9% measured monthly; a delay penalty of 2% per week applies, capped at 20%. ".repeat(5),
  ].join("\n");

  test("headings become sectionHeading metadata and pages are tracked from form feeds", () => {
    const parts = chunkDocument(arabicRfp);
    expect(parts.length).toBeGreaterThanOrEqual(3);
    const security = parts.find((p) => p.content.includes("الضوابط الأساسية"));
    expect(security?.sectionHeading).toBe("المادة 2 الأمن السيبراني");
    expect(security?.language).toBe("ar");
    const sla = parts.find((p) => p.content.includes("99.9%"));
    expect(sla?.sectionHeading).toBe("3.1 Service levels");
    expect(sla?.pageRef).toBe("2");
    expect(sla?.language).toBe("en");
    // A trailing form feed (pdf-parse appends the joiner after the last page) adds no page.
    expect(chunkDocument(arabicRfp + "\n\f\n\n").length).toBe(parts.length);
  });

  test("chunks stay near the target size and long unstructured text still splits", () => {
    const wall = "sentence about tender scope and delivery. ".repeat(400);
    const parts = chunkDocument(wall);
    expect(parts.length).toBeGreaterThan(5);
    for (const p of parts) expect(p.content.length).toBeLessThanOrEqual(1_400);
  });

  test("consecutive chunks overlap so a boundary sentence is findable twice", () => {
    const paragraphs = Array.from({ length: 12 }, (_, i) => `Paragraph ${i} ${"lorem ipsum dolor ".repeat(12)}`).join("\n\n");
    const parts = chunkDocument(paragraphs);
    expect(parts.length).toBeGreaterThan(1);
    const tail = parts[0].content.slice(-60);
    expect(parts[1].content.startsWith(tail.slice(0, 20)) || parts[1].content.includes(tail.slice(-30))).toBe(true);
  });

  test("looksLikeHeading and detectLanguage", () => {
    expect(looksLikeHeading("## Scope of Work")).toBe(true);
    expect(looksLikeHeading("4.2.1 Data residency")).toBe(true);
    expect(looksLikeHeading("البند 5 الغرامات")).toBe(true);
    expect(looksLikeHeading("TECHNICAL REQUIREMENTS")).toBe(true);
    expect(looksLikeHeading("The contractor shall deliver the platform within 12 weeks.")).toBe(false);
    // A mostly Arabic line is not an ALL-CAPS heading because of one Latin phrase in it.
    expect(looksLikeHeading("عيّنة تدريبية / SAMPLE ONLY — وثيقة وهمية لأغراض العرض والتجربة")).toBe(false);
    expect(detectLanguage("نص عربي بالكامل")).toBe("ar");
    expect(detectLanguage("Plain English text")).toBe("en");
    expect(detectLanguage("Service level اتفاقية مستوى الخدمة SLA")).toBe("mixed");
  });
});

describe("retrieval evaluation harness", () => {
  test("the labelled sample queries keep MRR above the floor (chunker + normalization regression guard)", async () => {
    const { evaluateRetrieval, SAMPLE_EVAL_QUERIES } = await import("../rag-eval");
    const { loadSampleCorpus, RAG_EVAL_MRR_FLOOR } = await import("../../../scripts/eval-rag");
    const docs = await loadSampleCorpus();
    const report = evaluateRetrieval(docs, SAMPLE_EVAL_QUERIES);
    expect(report.chunks).toBeGreaterThan(10);
    expect(report.mrr).toBeGreaterThanOrEqual(RAG_EVAL_MRR_FLOOR);
    // Arabic queries must not be the ones failing: the corpus is bilingual.
    // A miss here means "not rank 1"; an ambiguous query may legitimately sit
    // at rank 2 or 3, but never outside the top three.
    const arabicOutsideTop3 = report.misses.filter(
      (m) => /[؀-ۿ]/.test(m.query) && !m.got.includes(m.expectDoc)
    );
    expect(arabicOutsideTop3).toEqual([]);
    expect(report.precisionAt3).toBeGreaterThanOrEqual(0.95);
  }, 60_000);

  test("Arabic stem variants widen recall for inflected query words", async () => {
    const { arabicStemVariant } = await import("../rag-search");
    expect(arabicStemVariant("غرامات")).toBe("غرام");
    expect(arabicStemVariant("اسبوعيه")).toBe("اسبوع");
    expect(arabicStemVariant("موظفين")).toBe("موظف");
    // Ta-marbuta singular → sound plural, a precise prefix; never the generic stem.
    expect(arabicStemVariant("غرامه")).toBe("غرامات");
    expect(arabicStemVariant("سعوده")).toBe("سعودات");
    expect(searchTerms("السعودة")).not.toContain("سعود");
    // Short stems and nisba adjectives are left as typed (prefix match covers their inflections).
    expect(arabicStemVariant("تامين")).toBeNull();
    expect(arabicStemVariant("محلي")).toBeNull();
    expect(arabicStemVariant("امن")).toBeNull();
    expect(arabicStemVariant("controls")).toBeNull();
  });
});
