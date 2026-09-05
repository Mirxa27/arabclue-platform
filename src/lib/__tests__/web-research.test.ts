import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AUTHORITATIVE_SA_DOMAINS,
  buildResearchQueries,
  formatResearchBlock,
  parseTavilyResponse,
  type WebSearchOutcome,
} from "../ai/web-research";

const ok = (query: string, results: Array<[string, number]>): WebSearchOutcome => ({
  ok: true,
  provider: "tavily",
  query,
  retrievedAt: "2026-09-05T10:00:00.000Z",
  results: results.map(([url, score], i) => ({
    title: `Title ${i}`,
    url,
    snippet: `Snippet for ${url}`,
    score,
  })),
  answer: null,
  cached: false,
});

describe("parseTavilyResponse", () => {
  test("keeps only documented fields and http(s) URLs, trims long snippets", () => {
    const parsed = parseTavilyResponse({
      results: [
        { title: " NCA ECC ", url: "https://nca.gov.sa/ecc", content: "a  b\n c", score: 0.9 },
        { title: "bad", url: "javascript:alert(1)", content: "x", score: 1 },
        { url: "https://x.sa/no-title", content: "y".repeat(2000), score: "n/a" },
        "junk",
      ],
      answer: "  summary ",
    });
    expect(parsed?.results).toHaveLength(2);
    expect(parsed?.results[0]).toEqual({ title: "NCA ECC", url: "https://nca.gov.sa/ecc", snippet: "a b c", score: 0.9 });
    expect(parsed?.results[1].title).toBe("https://x.sa/no-title");
    expect(parsed?.results[1].snippet.length).toBe(700);
    expect(parsed?.results[1].score).toBe(0);
    expect(parsed?.answer).toBe("summary");
  });

  test("anything that is not the documented shape is rejected", () => {
    expect(parseTavilyResponse(null)).toBeNull();
    expect(parseTavilyResponse({ items: [] })).toBeNull();
  });
});

describe("buildResearchQueries", () => {
  test("standing regulatory topics plus one buyer-context query, never more than five", () => {
    const queries = buildResearchQueries({
      tenderTitle: "Government Cloud Hosting Services",
      tenderType: "IT",
      frameworksMentioned: ["NORA", "ISO 27001"],
    });
    expect(queries.length).toBeLessThanOrEqual(5);
    expect(queries.some((q) => q.startsWith("Government Cloud Hosting Services"))).toBe(true);
    expect(queries.filter((q) => /PDPL/.test(q))).toHaveLength(1);
  });

  test("a missing or tiny title adds no buyer query", () => {
    expect(buildResearchQueries({ tenderTitle: "RFP", tenderType: null })).toHaveLength(4);
  });
});

describe("formatResearchBlock", () => {
  test("dedupes by URL, ranks by score, numbers sources and dates them", () => {
    const brief = formatResearchBlock([
      ok("q1", [["https://nca.gov.sa/ecc", 0.5], ["https://laws.boe.gov.sa/gtpl", 0.9]]),
      ok("q2", [["https://nca.gov.sa/ecc", 0.95]]),
      { ok: false, reason: "timeout", query: "q3" },
    ]);
    expect(brief.sources.map((s) => s.url)).toEqual(["https://nca.gov.sa/ecc", "https://laws.boe.gov.sa/gtpl"]);
    expect(brief.sources[0].n).toBe(1);
    expect(brief.block).toContain("[S1] Title 0 — https://nca.gov.sa/ecc (retrieved 2026-09-05)");
    expect(brief.queries).toEqual(["q1", "q2", "q3"]);
    expect(brief.unavailableReason).toBeNull();
  });

  test("no results yields an empty block with the reason, so prompts add nothing", () => {
    const brief = formatResearchBlock([{ ok: false, reason: "not_configured", query: "q" }]);
    expect(brief.block).toBe("");
    expect(brief.unavailableReason).toBe("not_configured");
    expect(formatResearchBlock([]).unavailableReason).toBe("no_queries");
  });

  test("the block is capped so it never crowds out the tender", () => {
    const many = ok("q", Array.from({ length: 12 }, (_, i) => [`https://site${i}.sa/p`, 1 - i / 100] as [string, number]));
    const brief = formatResearchBlock([many], { maxChars: 400 });
    expect(brief.block.length).toBeLessThanOrEqual(400);
    expect(brief.sources.length).toBeLessThan(12);
  });

  test("official Saudi domains are the boosted set", () => {
    for (const d of ["etimad.sa", "nca.gov.sa", "sdaia.gov.sa", "laws.boe.gov.sa", "zatca.gov.sa"]) {
      expect(AUTHORITATIVE_SA_DOMAINS).toContain(d);
    }
  });
});

describe("the platform agent's live search surface", () => {
  const tools = readFileSync(join(process.cwd(), "src/lib/agents/platform/tools.ts"), "utf8");

  test("researchSaudiLaw no longer advertises a real-time check it does not perform", () => {
    expect(tools).not.toMatch(/real-time Saudi regulatory/);
    expect(tools).toContain("liveResearchStatus");
  });

  test("searchWeb is read-only, refuses pricing queries, and names the admin setting when unconfigured", () => {
    const start = tools.indexOf("searchWeb: platformTool({");
    expect(start).toBeGreaterThan(0);
    const body = tools.slice(start, start + 3000);
    expect(body).toMatch(/price\|pricing\|margin/);
    expect(body).toContain("TAVILY_API_KEY");
    expect(body).toContain("AUTHORITATIVE_SA_DOMAINS");
  });

  test("privileged tools are unchanged: search needs no approval", () => {
    const approval = readFileSync(join(process.cwd(), "src/lib/agents/platform/tool-approval.ts"), "utf8");
    expect(approval).not.toContain("searchWeb");
  });
});

describe("the pipeline carries live research and a post-draft review", () => {
  const orchestrator = readFileSync(join(process.cwd(), "src/lib/agents/orchestrator.ts"), "utf8");

  test("research is fetched once in the prepare stage and reaches compliance, drafting and the contract agent", () => {
    expect(orchestrator).toContain("researchTenderContext({");
    expect(orchestrator).toContain("liveRegulatoryResearch: liveResearch.block");
    expect(orchestrator).toContain("liveResearch: ctx.liveResearch.block || undefined");
    // both the drafting inputs and the law stage pass it
    expect(orchestrator.split("liveResearch: ctx.liveResearch.block || undefined").length - 1).toBe(2);
  });

  test("the drafting artifact records the dated sources, never a fabricated list", () => {
    const at = orchestrator.indexOf("liveResearch: {\n            sources: ctx.liveResearch.sources.map");
    expect(at).toBeGreaterThan(0);
    expect(orchestrator.slice(at, at + 600)).toContain("unavailableReason: ctx.liveResearch.unavailableReason");
  });

  test("the finalize stage runs a bounded, best-effort AI review and never fails the run on it", () => {
    expect(orchestrator).toContain("const AI_REVIEW_BUDGET_MS = 75_000;");
    expect(orchestrator).toContain("aiReview = await reviewFinishedDraft(");
    const at = orchestrator.indexOf("aiReview = await reviewFinishedDraft(");
    expect(orchestrator.slice(at - 200, at + 900)).toContain("catch (err)");
    expect(orchestrator).toContain("...(aiReview ? { aiReview } : {})");
  });
});
