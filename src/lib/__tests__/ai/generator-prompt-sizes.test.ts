/**
 * Every system prompt the secondary generators send is bounded, whatever
 * document it is built for. The guide is a fixed block per locale and the
 * glossary is filtered to the document's terms and capped, so the worst case
 * is a document that uses every term in the glossary — which is what is fed
 * here. The cap leaves the user turn (the tender, the draft, the matrix) the
 * room it needs inside a provider's context window.
 *
 * The same pass checks that each prompt still carries the two hard rules it
 * carried before the style guide was added, and the guide itself.
 */

import { describe, expect, test } from "bun:test";
import { NO_PRICING_RULE, REGULATORY_PRECISION_RULE } from "../../agents/prompts";
import {
  SYSTEM_COMPLIANCE,
  SYSTEM_FINANCIAL,
  SYSTEM_INGESTION,
  SYSTEM_TECHNICAL,
} from "../../agents/prompts";
import { enrichSystemPrompt } from "../../agents/enrich";
import { lawContractSystemPrompt } from "../../agents/law-contract";
import {
  buildComplianceScanSystemPrompt,
  buildGapAnalysisSystemPrompt,
} from "../../ai/compliance-analyzer";
import {
  buildClauseGenerationSystemPrompt,
  buildConsistencyCheckSystemPrompt,
  buildVariableInferenceSystemPrompt,
} from "../../ai/contract-drafting-assistant";
import { copilotSystemPrompt } from "../../ai/copilot-suggestions";
import {
  buildScoringSystemPrompt,
  buildSectionOptimizationSystemPrompt,
  buildSuggestionSystemPrompt,
  buildWinProbabilitySystemPrompt,
} from "../../ai/proposal-optimizer";
import {
  buildMatchingSystemPrompt,
  buildPredictionSystemPrompt,
} from "../../ai/vendor-matching-engine";
import { TENDER_GLOSSARY, styleGuideFor } from "../../ai/style-guide";
import type { Locale } from "../../types";

const MAX_SYSTEM_PROMPT_CHARS = 6_000;

/** A document that uses every glossary term in both languages: the glossary filter's worst case. */
const EVERY_TERM = TENDER_GLOSSARY.flatMap((e) => [e.ar, e.en, e.abbr ?? ""]).join(" — ");

const LOCALES: readonly Locale[] = ["ar", "en"];

type Case = {
  name: string;
  build: (locale: Locale) => string;
  /** Prompts that carried these rules before the guide was added must still carry them. */
  hardRules: boolean;
};

const CASES: readonly Case[] = [
  { name: "compliance scan", build: (l) => buildComplianceScanSystemPrompt(l, EVERY_TERM), hardRules: true },
  { name: "compliance gaps", build: (l) => buildGapAnalysisSystemPrompt(l, EVERY_TERM), hardRules: true },
  { name: "clause generation", build: (l) => buildClauseGenerationSystemPrompt(l, EVERY_TERM), hardRules: true },
  { name: "variable inference", build: (l) => buildVariableInferenceSystemPrompt(l, EVERY_TERM), hardRules: false },
  { name: "bilingual consistency", build: (l) => buildConsistencyCheckSystemPrompt(l), hardRules: false },
  { name: "proposal scoring", build: (l) => buildScoringSystemPrompt(l, EVERY_TERM), hardRules: true },
  { name: "proposal suggestions", build: (l) => buildSuggestionSystemPrompt(l, EVERY_TERM), hardRules: true },
  { name: "section optimization", build: (l) => buildSectionOptimizationSystemPrompt(l, EVERY_TERM), hardRules: true },
  { name: "readiness estimate", build: (l) => buildWinProbabilitySystemPrompt(l), hardRules: true },
  { name: "vendor matching", build: (l) => buildMatchingSystemPrompt(l, EVERY_TERM), hardRules: true },
  { name: "vendor readiness", build: (l) => buildPredictionSystemPrompt(l), hardRules: true },
  { name: "copilot (proposal)", build: (l) => copilotSystemPrompt(l, "proposal"), hardRules: true },
  { name: "copilot (contract)", build: (l) => copilotSystemPrompt(l, "contract"), hardRules: true },
  { name: "law contract", build: (l) => lawContractSystemPrompt(l, EVERY_TERM), hardRules: true },
  { name: "enrich: ingestion", build: () => enrichSystemPrompt(SYSTEM_INGESTION, EVERY_TERM), hardRules: true },
  { name: "enrich: compliance", build: () => enrichSystemPrompt(SYSTEM_COMPLIANCE, EVERY_TERM), hardRules: true },
  { name: "enrich: technical", build: () => enrichSystemPrompt(SYSTEM_TECHNICAL, EVERY_TERM), hardRules: false },
  { name: "enrich: financial", build: () => enrichSystemPrompt(SYSTEM_FINANCIAL, EVERY_TERM), hardRules: true },
];

describe("every generator system prompt is bounded", () => {
  test("the worst-case document really is the worst case for the glossary", () => {
    // Anti-vacuous: the filter must match everything here, or the cap below
    // would be measured against a short glossary.
    const prompt = buildComplianceScanSystemPrompt("en", EVERY_TERM);
    expect(prompt).toContain("GLOSSARY");
    expect(prompt.length).toBeGreaterThan(buildComplianceScanSystemPrompt("en", "").length + 800);
  });

  for (const c of CASES) {
    for (const locale of LOCALES) {
      test(`${c.name} [${locale}] stays under ${MAX_SYSTEM_PROMPT_CHARS} characters`, () => {
        const prompt = c.build(locale);
        expect(prompt.length).toBeGreaterThan(300);
        expect(prompt.length, `${c.name} [${locale}] is ${prompt.length} chars`).toBeLessThanOrEqual(
          MAX_SYSTEM_PROMPT_CHARS
        );
      });
    }
  }
});

describe("every generator system prompt carries the house style", () => {
  for (const c of CASES) {
    test(`${c.name} includes a style guide`, () => {
      // The enrichment legs pick the guide from the payload's script, so
      // either guide is acceptable there; the others follow the locale.
      const guides = LOCALES.map((l) => styleGuideFor(l));
      for (const locale of LOCALES) {
        const prompt = c.build(locale);
        expect(guides.some((g) => prompt.includes(g)), `${c.name} [${locale}]`).toBe(true);
      }
    });

    if (c.hardRules) {
      test(`${c.name} keeps the pricing and regulatory-precision rules verbatim`, () => {
        for (const locale of LOCALES) {
          const prompt = c.build(locale);
          expect(prompt).toContain(NO_PRICING_RULE);
          expect(prompt).toContain(REGULATORY_PRECISION_RULE);
        }
      });
    }
  }

  test("the locale picks the guide where a locale is given", () => {
    expect(buildComplianceScanSystemPrompt("ar")).toContain(styleGuideFor("ar"));
    expect(buildComplianceScanSystemPrompt("en")).toContain(styleGuideFor("en"));
    expect(buildComplianceScanSystemPrompt("en")).not.toContain(styleGuideFor("ar"));
    expect(copilotSystemPrompt("ar", "proposal")).toContain(styleGuideFor("ar"));
    expect(lawContractSystemPrompt("en")).toContain(styleGuideFor("en"));
  });

  test("the enrichment legs follow the script of what they polish", () => {
    expect(enrichSystemPrompt(SYSTEM_TECHNICAL, "نطاق العمل ومنهجية التنفيذ والمعالم")).toContain(
      styleGuideFor("ar")
    );
    expect(enrichSystemPrompt(SYSTEM_TECHNICAL, "scope of work and delivery milestones")).toContain(
      styleGuideFor("en")
    );
  });

  test("a document's terms reach the glossary, and only they do", () => {
    const prompt = buildScoringSystemPrompt("en", "The BoQ and the SLA are attached.");
    expect(prompt).toContain("bill of quantities (BoQ)");
    expect(prompt).toContain("service level agreement (SLA)");
    expect(prompt).not.toContain("force majeure");
  });
});
