import { describe, expect, test } from "bun:test";
import { parseTenderText, sanitizeText } from "../agents/ingestion";
import { parseFinancialText, runFinancialAgent } from "../agents/financial";
import { computeQuickLiquidityRatio, SLA_PENALTY_RULES } from "../procurement-rules";
import { localEmbedText } from "../llm";
import { cosineDense, retrieveRelevant } from "../rag";
import { canGrantRole } from "../auth";
import { generateSlidesHTML } from "../generators";
import { markdownToHtml } from "../markdown";
import { buildDeterministicProposal } from "../agents/drafting";

describe("sanitizeText", () => {
  test("strips control characters", () => {
    expect(sanitizeText("hello\u0000world\u0007")).toBe("hello world ");
  });
});

describe("parseTenderText", () => {
  test("extracts evaluation split and caps SLA at 20%", () => {
    const text = `
      Scope of Work: Deliver a national digital platform for citizen services.
      Technical evaluation 70% Financial 30%.
      Delay penalty 5% per week maximum 40%.
      Milestone: Discovery — 4 weeks
      Milestone: Build — 16 weeks
      Phase: Go-Live 3 weeks
    `;
    const entities = parseTenderText(text, "IT");
    expect(entities.evaluation.technical).toBe(70);
    expect(entities.evaluation.financial).toBe(30);
    expect(entities.sla.maxPercent).toBeLessThanOrEqual(20);
    expect(entities.sla.perWeek).toBeLessThanOrEqual(20);
    expect(entities.milestones.length).toBeGreaterThanOrEqual(2);
    expect(entities.scope.toLowerCase()).toContain("digital platform");
  });

  test("falls back milestones when none found", () => {
    const entities = parseTenderText("Simple RFP without schedule.", "IT");
    expect(entities.milestones.length).toBeGreaterThanOrEqual(3);
  });
});

describe("financial QLR", () => {
  test("computes QLR correctly", () => {
    const qlr = computeQuickLiquidityRatio({
      cashEquivalents: 100,
      accountsReceivable: 50,
      currentLiabilities: 100,
    });
    expect(qlr.ratio).toBe(1.5);
    expect(qlr.passes).toBe(true);
  });

  test("parses financial statement text", () => {
    const text = `
      Cash & Equivalents: 2,500,000
      Accounts Receivable: 1,200,000
      Current Liabilities: 2,700,000
      Saudization: 42%
    `;
    const parsed = parseFinancialText(text);
    expect(parsed.cashEquivalents).toBe(2500000);
    expect(parsed.accountsReceivable).toBe(1200000);
    expect(parsed.currentLiabilities).toBe(2700000);
    expect(parsed.saudizationPercent).toBe(42);

    const result = runFinancialAgent({
      financialText: text,
      entities: parseTenderText(
        "Milestone: Design — 6 weeks\nMilestone: Build — 14 weeks",
        "IT"
      ),
      projectBudget: 10_000_000,
    });
    expect(result.quickLiquidityRatio).toBeCloseTo(1.37, 1);
    expect(result.qlrPasses).toBe(true);
    expect(result.boqItems.length).toBeGreaterThanOrEqual(2);
  });
});

describe("SLA caps", () => {
  test("services max 20%", () => {
    const r = SLA_PENALTY_RULES.enforceCap(25, "IT");
    expect(r.max).toBe(20);
    expect(r.capped).toBe(true);
  });
});

describe("local embeddings + RAG", () => {
  test("produces unit vectors with positive similarity for related text", () => {
    const a = localEmbedText("Ministry of Health EHR platform PDPL Saudi Arabia");
    const b = localEmbedText("national electronic health records PDPL hospitals");
    const c = localEmbedText("unrelated telecom 5G radio frequency auction");
    expect(a.length).toBe(256);
    const simAb = cosineDense(a, b);
    const simAc = cosineDense(a, c);
    expect(simAb).toBeGreaterThan(simAc);
  });

  test("retrieveRelevant uses embeddings when provided", () => {
    const docs = [
      {
        id: "1",
        title: "EHR Platform",
        summary: "Health records PDPL hospitals",
        embedding: localEmbedText("EHR Platform Health records PDPL hospitals"),
      },
      {
        id: "2",
        title: "5G Core",
        summary: "Telecom orchestration",
        embedding: localEmbedText("5G Core Telecom orchestration"),
      },
    ];
    const q = localEmbedText("electronic health PDPL");
    const hits = retrieveRelevant("electronic health PDPL", docs, {
      topK: 1,
      queryEmbedding: q,
    });
    expect(hits[0]?.id).toBe("1");
  });
});

describe("RBAC grant hierarchy", () => {
  test("ADMIN cannot grant ADMIN or SUPER_ADMIN", () => {
    expect(canGrantRole("ADMIN", "BIDDER")).toBe(true);
    expect(canGrantRole("ADMIN", "ADMIN")).toBe(false);
    expect(canGrantRole("ADMIN", "SUPER_ADMIN")).toBe(false);
    expect(canGrantRole("SUPER_ADMIN", "ADMIN")).toBe(true);
  });
});

describe("slides metrics", () => {
  test("uses real QLR and Saudization in HTML", () => {
    const proposal = {
      id: "p1",
      title: "Test Proposal",
      complianceScore: 96,
    } as Parameters<typeof generateSlidesHTML>[0];
    const project = {
      title: "Digital Platform RFP",
      etimadRef: "ETM-TEST",
      category: "IT",
      currency: "SAR",
      budget: 5_000_000,
      saudizationTarget: 35,
    } as Parameters<typeof generateSlidesHTML>[1];
    const html = generateSlidesHTML(proposal, project, null, {
      quickLiquidityRatio: 1.38,
      qlrPasses: true,
      saudizationPercent: 42,
      saudizationTarget: 35,
      complianceScore: 96,
    });
    expect(html).toContain("1.38");
    expect(html).toContain("42%");
    expect(html).not.toContain("1.24");
    expect(html).toContain("96%");
  });
});

describe("markdown renderer", () => {
  test("renders headings lists tables and bold", () => {
    const html = markdownToHtml(`# Title
## Section
- item **one**
| A | B |
| --- | --- |
| 1 | 2 |
`);
    expect(html).toContain("<h1");
    expect(html).toContain("<h2");
    expect(html).toContain("<li");
    expect(html).toContain("<strong>one</strong>");
    expect(html).toContain("<table");
    expect(html).toContain("<th");
  });
});

describe("bilingual deterministic drafting", () => {
  test("Arabic draft contains Arabic section headings", () => {
    const md = buildDeterministicProposal({
      projectTitle: "منصة رقمية",
      etimadRef: "ETM-1",
      tenderTypeName: "IT / تقنية المعلومات",
      entities: {
        scope: "بناء منصة",
        evaluation: { technical: 70, financial: 30 },
        sla: { perWeek: 2, maxPercent: 20, capped: false },
        milestones: [{ name: "Build", weeks: 10 }],
        evidence: [],
      },
      complianceRows: [
        {
          frameworkId: "PDPL",
          controlId: "PDPL-1",
          title: "Residency",
          status: "COMPLIANT",
          evidence: "KSA",
          remediation: null,
        },
      ],
      technical: {
        methodology: [
          { id: 1, name: "Discover", nameAr: "اكتشاف", rationale: "r" },
        ],
        matchedProjects: [],
        solutionApproach: "Zero Trust",
        vision2030Notes: "pillar",
        ragContext: "none",
      },
      financial: {
        cashEquivalents: 1,
        accountsReceivable: 1,
        currentLiabilities: 1,
        quickLiquidityRatio: 2,
        qlrPasses: true,
        saudizationPercent: 40,
        boqItems: [{ item: "Build", unit: "LS", qty: 1, unitPrice: 100, total: 100 }],
        localContentPreferenceApplied: 0.1,
        notes: ["n"],
      },
      brandTagline: "Arabclue",
      vision2030: "thriving-economy",
      locale: "ar",
    });
    expect(md).toContain("الملخص التنفيذي");
    expect(md).toContain("العطاء الفني والمالي");
  });
});
