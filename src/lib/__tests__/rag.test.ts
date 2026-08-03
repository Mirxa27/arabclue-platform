import { describe, expect, test } from "bun:test";
import {
  cosineDense,
  retrieveLexical,
  retrieveByEmbedding,
  retrieveRelevant,
  formatRagContext,
  type RagDocument,
} from "../rag";

const docs: RagDocument[] = [
  {
    id: "1",
    title: "Riyadh Data Center Build",
    summary: "Construction of tier-3 data center in Riyadh",
    sector: "Construction",
    clientName: "STC",
    contractValue: 50000000,
    tags: "data center, riyadh",
  },
  {
    id: "2",
    title: "Jeddah Hospital Expansion",
    summary: "Medical facility expansion project in Jeddah",
    sector: "Healthcare",
    clientName: "MOH",
    contractValue: 30000000,
    tags: "hospital, jeddah",
  },
  {
    id: "3",
    title: "NEOM Infrastructure",
    summary: "Large-scale infrastructure development for NEOM",
    sector: "Infrastructure",
    clientName: "NEOM",
    contractValue: 100000000,
    tags: "infrastructure, neom",
  },
];

describe("cosineDense", () => {
  test("returns 1 for identical vectors", () => {
    expect(cosineDense([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 5);
  });

  test("returns 0 for orthogonal vectors", () => {
    expect(cosineDense([1, 0], [0, 1])).toBeCloseTo(0, 5);
  });

  test("returns 0 for empty vectors", () => {
    expect(cosineDense([], [])).toBe(0);
  });

  test("returns 0 for mismatched lengths", () => {
    expect(cosineDense([1, 2, 3], [1, 2])).toBe(0);
  });

  test("returns 0 for zero vectors", () => {
    expect(cosineDense([0, 0, 0], [1, 2, 3])).toBe(0);
  });
});

describe("retrieveLexical", () => {
  test("returns ranked hits by relevance", () => {
    const hits = retrieveLexical("data center riyadh", docs, 5);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].id).toBe("1");
    expect(hits[0].score).toBeGreaterThan(0);
  });

  test("respects topK limit", () => {
    const hits = retrieveLexical("project", docs, 2);
    expect(hits.length).toBeLessThanOrEqual(2);
  });

  test("filters out zero-score results", () => {
    const hits = retrieveLexical("zzzzzzz", docs, 5);
    expect(hits.length).toBe(0);
  });

  test("matches on sector and tags fields", () => {
    const hits = retrieveLexical("healthcare", docs, 5);
    expect(hits.some((h) => h.id === "2")).toBe(true);
  });

  test("handles empty query", () => {
    const hits = retrieveLexical("", docs, 5);
    expect(hits.length).toBe(0);
  });

  test("handles empty docs array", () => {
    const hits = retrieveLexical("test", [], 5);
    expect(hits.length).toBe(0);
  });
});

describe("retrieveByEmbedding", () => {
  test("returns ranked hits by cosine similarity", () => {
    const docsWithEmb = docs.map((d, i) => ({
      ...d,
      embedding: [1, i, 0],
    }));
    const hits = retrieveByEmbedding([1, 0, 0], docsWithEmb, 5);
    expect(hits.length).toBe(3);
    expect(hits[0].id).toBe("1");
  });

  test("filters out docs without embeddings", () => {
    const mixed: RagDocument[] = [
      { ...docs[0], embedding: [1, 0] },
      { ...docs[1], embedding: null },
    ];
    const hits = retrieveByEmbedding([1, 0], mixed, 5);
    expect(hits.length).toBe(1);
    expect(hits[0].id).toBe("1");
  });

  test("respects topK", () => {
    const docsWithEmb = docs.map((d, i) => ({
      ...d,
      embedding: [1, i, 0],
    }));
    const hits = retrieveByEmbedding([1, 0, 0], docsWithEmb, 2);
    expect(hits.length).toBeLessThanOrEqual(2);
  });
});

describe("retrieveRelevant", () => {
  test("uses embedding when available and returns hits", () => {
    const docsWithEmb = docs.map((d, i) => ({
      ...d,
      embedding: [1, i, 0],
    }));
    const hits = retrieveRelevant("test", docsWithEmb, {
      topK: 3,
      queryEmbedding: [1, 0, 0],
    });
    expect(hits.length).toBe(3);
    expect(hits[0].id).toBe("1");
  });

  test("falls back to lexical when no query embedding", () => {
    const hits = retrieveRelevant("data center", docs, { topK: 3 });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].id).toBe("1");
  });

  test("falls back to lexical when embedding returns no hits", () => {
    const docsWithEmb = docs.map((d) => ({
      ...d,
      embedding: [0, 0, 0],
    }));
    const hits = retrieveRelevant("data center", docsWithEmb, {
      topK: 3,
      queryEmbedding: [1, 0, 0],
    });
    // All-zero embeddings → cosine 0 → falls back to lexical
    expect(hits.length).toBeGreaterThan(0);
  });

  test("uses default topK of 5", () => {
    const manyDocs: RagDocument[] = Array.from({ length: 10 }, (_, i) => ({
      id: String(i),
      title: "data center project",
      summary: "data center",
    }));
    const hits = retrieveRelevant("data center", manyDocs);
    expect(hits.length).toBeLessThanOrEqual(5);
  });
});

describe("formatRagContext", () => {
  test("formats hits with index, score, and metadata", () => {
    const hits = retrieveLexical("data center riyadh", docs, 2);
    const ctx = formatRagContext(hits);
    expect(ctx).toContain("1.");
    expect(ctx).toContain("score=");
    expect(ctx).toContain("sector=");
    expect(ctx).toContain("client=");
    expect(ctx).toContain("value=");
  });

  test("returns no-match message for empty hits", () => {
    const ctx = formatRagContext([]);
    expect(ctx).toContain("No matching past projects found");
  });
});
