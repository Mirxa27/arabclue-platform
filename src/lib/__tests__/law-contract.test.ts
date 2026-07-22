import { describe, expect, test } from "bun:test";
import {
  buildDeterministicContract,
  parseContractArticles,
  validateContractDraft,
} from "../agents/law-contract";
import { researchSaudiLawForContract } from "../saudi-law-research";
import { AGENT_ENGINES } from "../llm/model-catalog";
import { AGENTS } from "../constants";
import type { IngestionEntities } from "../types";

const entities: IngestionEntities = {
  scope: "Managed cloud services for ministry portal.",
  evaluation: { technical: 70, financial: 30 },
  sla: { perWeek: 1, maxPercent: 10, capped: true },
  milestones: [{ name: "Go-live", weeks: 12 }],
  evidence: [],
  noraPrinciplesFromTender: [],
};

describe("Saudi law research + bilingual contract agent", () => {
  test("registers LAW_CONTRACT agent and LAW engine", () => {
    expect(AGENTS.some((a) => a.id === "LAW_CONTRACT")).toBe(true);
    expect(AGENT_ENGINES).toContain("LAW");
  });

  test("research brief cites registry and never claims 100% certainty", () => {
    const brief = researchSaudiLawForContract({
      entities,
      complianceRows: [],
      projectTitle: "Portal Ops",
    });
    expect(brief.sources.length).toBeGreaterThan(0);
    expect(brief.findings.some((f) => f.id === "update-verification")).toBe(true);
    expect(brief.disclaimerEn.toLowerCase()).toContain("not legal advice");
    const blob = JSON.stringify(brief);
    expect(blob).toMatch(/never asserts 100%|لا يدّعي الوكيل يقيناً/i);
  });

  test("deterministic bilingual contract has front-to-front articles", () => {
    const research = researchSaudiLawForContract({
      entities,
      complianceRows: [],
      projectTitle: "Portal Ops",
    });
    const draft = buildDeterministicContract({
      projectTitle: "Portal Ops",
      etimadRef: "ET-1",
      parties: {
        clientEn: "Client",
        clientAr: "العميل",
        vendorEn: "Vendor",
        vendorAr: "المتعاقد",
      },
      entities,
      research,
    });
    const articles = parseContractArticles(draft.contentMd);
    expect(articles.length).toBeGreaterThanOrEqual(10);
    expect(articles[0]?.bodyEn.length).toBeGreaterThan(20);
    expect(articles[0]?.bodyAr.length).toBeGreaterThan(10);
    expect(draft.contentMd).toMatch(/NOT LEGAL ADVICE|ليست استشارة قانونية/);
    expect(draft.contentMd).toMatch(/1% per week|1% أسبوع/);
  });

  test("validation rejects false 100% certainty claims", () => {
    const ok = validateContractDraft(
      "# DRAFT\n> NOT LEGAL ADVICE | ليست استشارة قانونية\n### Article 1 — A | المادة 1 — أ\n:::en\nx\n:::\n:::ar\nص\n:::"
    );
    expect(ok.blocking).toBe(false);

    const bad = validateContractDraft(
      "# DRAFT\n> NOT LEGAL ADVICE\nThis clause is 100% certain and guaranteed.\n### Article 1 — A | المادة 1 — أ\n:::en\nx\n:::\n:::ar\nص\n:::"
    );
    expect(bad.blocking).toBe(true);
    expect(bad.issues.some((i) => i.code === "false_certainty")).toBe(true);
  });
});
