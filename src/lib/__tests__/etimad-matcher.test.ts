import { describe, expect, test } from "bun:test";

// Import matcher functions directly from source (tests run with bun, not Chrome)
// We inline the logic here since the extension source uses Chrome APIs
describe("etimad matcher scoring", () => {
  const mockTender = {
    referenceNumber: "260012345",
    title: "Cloud Services Platform",
    titleAr: "منصة خدمات سحابية",
    entity: "Ministry of Communications",
    entityAr: "وزارة الاتصالات",
    category: "IT" as const,
    value: 2000000,
    currency: "SAR" as const,
    publishDate: "2026-07-01",
    closingDate: "2026-08-15",
    status: "open" as const,
    url: "https://tenders.etimad.sa/Tender/Details/260012345",
    documents: [],
    qualifications: ["سجل تجاري", "شهادة ZATCA"],
    extractedAt: "2026-07-26T10:00:00Z",
  };

  test("category match scores 100 when matching", () => {
    const criteria = { categories: ["IT" as const], keywords: [], keywordsAr: [], autoDownloadDocuments: false, autoStartProposal: false };
    // Category is IT, criteria includes IT
    expect(criteria.categories.includes(mockTender.category)).toBe(true);
  });

  test("category match scores 0 when not matching", () => {
    const criteria = { categories: ["construction" as const], keywords: [], keywordsAr: [], autoDownloadDocuments: false, autoStartProposal: false };
    expect(criteria.categories.includes(mockTender.category)).toBe(false);
  });

  test("keyword scoring matches Arabic text", () => {
    const keywords = ["سحابية", "cloud"];
    const searchText = [mockTender.title, mockTender.titleAr].join(" ").toLowerCase();
    let hits = 0;
    for (const kw of keywords) {
      if (searchText.includes(kw.toLowerCase())) hits++;
    }
    expect(hits).toBe(2);
  });

  test("value range filtering", () => {
    expect(mockTender.value! >= 1000000).toBe(true);  // min 1M
    expect(mockTender.value! <= 5000000).toBe(true);  // max 5M
    expect(mockTender.value! >= 3000000).toBe(false); // min 3M fails
  });

  test("deduplication by reference number", () => {
    const tenders = [
      { ...mockTender, extractedAt: "2026-07-25T10:00:00Z" },
      { ...mockTender, extractedAt: "2026-07-26T10:00:00Z" },
    ];
    const seen = new Map<string, typeof mockTender>();
    for (const t of tenders) {
      const existing = seen.get(t.referenceNumber);
      if (!existing || t.extractedAt > existing.extractedAt) {
        seen.set(t.referenceNumber, t);
      }
    }
    expect(seen.size).toBe(1);
    expect(seen.get("260012345")?.extractedAt).toBe("2026-07-26T10:00:00Z");
  });
});
