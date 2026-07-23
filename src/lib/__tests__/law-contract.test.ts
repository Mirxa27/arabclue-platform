import { describe, expect, test } from "bun:test";
import {
  buildDeterministicContract,
  validateContractDraft,
} from "../agents/law-contract";
import { parseContractArticles } from "../contract-format";
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

function validContractFixture(article2En = "English clause body.", article2Ar = "نص البند بالعربية.") {
  return `# DRAFT CONTRACT | مسودة عقد
> NOT LEGAL ADVICE | ليست استشارة قانونية
> Authorized human legal review required before signature.

# RESEARCH SUMMARY | موجز البحث

## Findings | النتائج
- Finding grounded in tender context.

## Sources (registry) | المصادر (السجل)
- Saudi instrument (current, review 2026-01-01) — registry reference

# OPERATIVE ARTICLES | البنود النافذة

### Article 1 — Parties | المادة 1 — الأطراف
:::en
English parties clause.
:::
:::ar
نص بند الأطراف بالعربية.
:::

### Article 2 — Scope | المادة 2 — النطاق
:::en
${article2En}
:::
:::ar
${article2Ar}
:::

### Article 3 — Term | المادة 3 — المدة
:::en
English term clause.
:::
:::ar
نص بند المدة بالعربية.
:::

### Article 4 — Obligations | المادة 4 — الالتزامات
:::en
English obligations clause.
:::
:::ar
نص بند الالتزامات بالعربية.
:::

### Article 5 — Review | المادة 5 — المراجعة
:::en
Human legal review is required before signature.
:::
:::ar
يلزم مراجعة قانونية بشرية قبل التوقيع.
:::

---
Contract drafts and regulatory comments are drafting aids, not legal advice. Authorized human legal review and approval required before signature.`;
}

function withArticle2Block(articleBlock: string) {
  return validContractFixture().replace(
    /### Article 2 — Scope \| المادة 2 — النطاق[\s\S]*?(?=\n### Article 3 — Term)/,
    articleBlock.trimEnd()
  );
}

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
    const ok = validateContractDraft(validContractFixture());
    expect(ok.blocking).toBe(false);

    const bad = validateContractDraft(
      validContractFixture().replace(
        "English obligations clause.",
        "This clause is 100% certain and guaranteed."
      )
    );
    expect(bad.blocking).toBe(true);
    expect(bad.issues.some((i) => i.code === "false_certainty")).toBe(true);
  });

  test("validation rejects missing mandatory legal disclaimer", () => {
    const bad = validateContractDraft(
      validContractFixture()
        .replace(
          /> NOT LEGAL ADVICE \| ليست استشارة قانونية\n> Authorized human legal review required before signature\.\n/,
          ""
        )
        .replace(
          "Contract drafts and regulatory comments are drafting aids, not legal advice. Authorized human legal review and approval required before signature.",
          "Contract drafts and regulatory comments are drafting aids. Human approval required before signature."
        )
    );
    expect(bad.blocking).toBe(true);
    expect(bad.issues.some((i) => i.code === "missing_legal_disclaimer")).toBe(true);
  });

  test("validation rejects AI pricing language in contracts", () => {
    const bad = validateContractDraft(
      validContractFixture().replace(
        "English obligations clause.",
        "Recommended unit price: 12000 SAR."
      )
    );
    expect(bad.blocking).toBe(true);
    expect(bad.issues.some((i) => i.code === "pricing_language")).toBe(true);
  });

  test("validation rejects AI commercial pricing strategy language in contracts", () => {
    const bad = validateContractDraft(
      validContractFixture().replace(
        "English obligations clause.",
        "Commercial strategy: use a win price to improve bid competitiveness."
      )
    );
    expect(bad.blocking).toBe(true);
    expect(bad.issues.some((i) => i.code === "pricing_language")).toBe(true);
  });

  test("validation rejects bilingual article body asymmetry", () => {
    const missingEnglish = validateContractDraft(validContractFixture("", "نص عربي موجود."));
    const missingArabic = validateContractDraft(validContractFixture("English body present.", ""));

    expect(missingEnglish.blocking).toBe(true);
    expect(missingEnglish.issues.some((i) => i.code === "bilingual_asymmetry")).toBe(true);
    expect(missingArabic.blocking).toBe(true);
    expect(missingArabic.issues.some((i) => i.code === "bilingual_asymmetry")).toBe(true);
  });

  test("validation rejects article headers missing paired bilingual language blocks", () => {
    const missingEnglishBlock = validateContractDraft(
      withArticle2Block(`### Article 2 — Scope | المادة 2 — النطاق
:::ar
نص بند النطاق بالعربية.
:::`)
    );
    const missingArabicBlock = validateContractDraft(
      withArticle2Block(`### Article 2 — Scope | المادة 2 — النطاق
:::en
English scope clause.
:::`)
    );

    expect(missingEnglishBlock.blocking).toBe(true);
    expect(missingEnglishBlock.issues.some((i) => i.code === "bilingual_structure")).toBe(true);
    expect(missingArabicBlock.blocking).toBe(true);
    expect(missingArabicBlock.issues.some((i) => i.code === "bilingual_structure")).toBe(true);
  });

  test("validation rejects malformed bilingual markup skipped by article parsing", () => {
    const malformed = withArticle2Block(`### Article 2 — Scope | المادة 2 — النطاق
:::en
English scope clause.
:::ar
نص بند النطاق بالعربية.
:::`);
    const bad = validateContractDraft(malformed);

    expect(parseContractArticles(malformed).length).toBe(4);
    expect(bad.blocking).toBe(true);
    expect(bad.issues.some((i) => i.code === "bilingual_structure")).toBe(true);
  });

  test("validation rejects contracts without research and source section markers", () => {
    const bad = validateContractDraft(
      validContractFixture().replace(
        /# RESEARCH SUMMARY \| موجز البحث[\s\S]*?# OPERATIVE ARTICLES \| البنود النافذة/,
        "# OPERATIVE ARTICLES | البنود النافذة"
      )
    );
    expect(bad.blocking).toBe(true);
    expect(bad.issues.some((i) => i.code === "missing_research_sources")).toBe(true);
  });

  test("bilingual contract HTML export includes both languages", async () => {
    const { generateBilingualContractHTML } = await import("../contract-export");
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
    const html = generateBilingualContractHTML({
      title: draft.contentMd.slice(0, 20),
      titleAr: "مسودة عقد",
      contentMd: draft.contentMd,
      projectTitle: "Portal Ops",
      etimadRef: "ET-1",
    }).toString("utf8");
    expect(html).toContain("lang=\"en\"");
    expect(html).toContain("lang=\"ar\"");
    expect(html).toContain("not legal advice");
    expect(html).toContain("ليست استشارة قانونية");
  });
});
