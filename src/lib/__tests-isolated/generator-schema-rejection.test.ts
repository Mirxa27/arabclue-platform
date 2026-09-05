/**
 * A model that answers, but not in the shape the generator asked for.
 *
 * Before, every generator walked such an answer with `String(x ?? "")` and
 * shipped the result under an `AI_GENERATED` provenance — or, when even that
 * failed, took its deterministic path silently, bypassing the real-AI-only
 * guard that a provider failure would have hit. Now the answer goes through a
 * schema and a mismatch is handed to `guardOrThrow` shaped exactly like the
 * LLM layer's own `guardrail_rejected` result: a strict deploy refuses with
 * the failing path in the detail, a permissive one falls back and says so.
 *
 * `generateCompletion` is mocked at the module boundary so the answer can be
 * chosen per test; nothing here reaches a provider or a database.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { ProviderUnavailableError } from "../ai/provider-unavailable";
import type { LLMMessage, LLMResult } from "../llm";

/** The next answer the mocked model gives, and every prompt it was sent. */
let nextAnswer = "";
const sent: LLMMessage[][] = [];

// The other isolated suites that mock `../llm` (platform-agent-*.test.ts)
// export `getProviderForEngine` and nothing else. Mocks of one module are
// process-wide across the files of a run, and an export one suite's mock
// lacks is an export the other suite's code cannot find — so this mock
// carries both names, and the platform-agent suites' own stubs take over
// `getProviderForEngine` when they load.
mock.module("../llm", () => ({
  getProviderForEngine: mock(() => Promise.resolve(null)),
  generateCompletion: mock(async (messages: LLMMessage[]): Promise<LLMResult> => {
    sent.push(messages);
    return {
      content: nextAnswer,
      provider: "openai",
      model: "test-model",
      tokensUsed: 42,
      confidence: 0.9,
      fallback: false,
      engine: "COMPLIANCE",
      failureKind: "none",
    };
  }),
}));

const priorRealAiOnly = process.env.AUTONOMY_REAL_AI_ONLY;

function strict(): void {
  delete process.env.AUTONOMY_REAL_AI_ONLY;
}
function permissive(): void {
  process.env.AUTONOMY_REAL_AI_ONLY = "0";
}

beforeEach(() => {
  sent.length = 0;
  nextAnswer = "";
});

afterEach(() => {
  if (priorRealAiOnly === undefined) delete process.env.AUTONOMY_REAL_AI_ONLY;
  else process.env.AUTONOMY_REAL_AI_ONLY = priorRealAiOnly;
});

/**
 * The tender's own SLA clause puts three rows into the deterministic matrix
 * (SLA-TENDER, SLA-STATUTORY-CANDIDATE, SLA-CAP) whatever the framework
 * catalog holds. That matters here: `bootstrap.test.ts` mocks `../constants`
 * with an empty `COMPLIANCE_FRAMEWORKS` for the rest of an isolated run, and
 * a test anchored on catalog controls would see an empty matrix after it.
 */
const scanInput = {
  documentText:
    "The SLA fixes a 2% weekly delay penalty, capped at 10%. Data is hosted in KSA. NCA ECC controls are addressed.",
  documentType: "PROPOSAL" as const,
  entities: {
    scope: "Managed IT services",
    evaluation: { technical: 70, financial: 30 },
    sla: { perWeek: 2, maxPercent: 10, originalWording: "2% per week, capped at 10%" },
    milestones: [],
    evidence: [],
  },
  tenderCategory: "SERVICES",
  locale: "en" as const,
  workspaceId: "ws-1",
};

describe("compliance-analyzer: a wrong-shaped answer", () => {
  test("is refused as guardrail_rejected under real-AI-only, naming the failing path", async () => {
    strict();
    nextAnswer = '```json\n{"findings": "not an array"}\n```';
    const { scanCompliance } = await import("../ai/compliance-analyzer");

    let caught: unknown;
    try {
      await scanCompliance(scanInput);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ProviderUnavailableError);
    const err = caught as ProviderUnavailableError;
    expect(err.llmFailureKind).toBe("guardrail_rejected");
    expect(err.context).toBe("compliance-analyzer:scanCompliance");
    expect(err.provider).toBe("openai");
    expect(err.detail).toContain("schema_mismatch");
    expect(err.detail).toMatch(/findings/);
    // Anti-vacuous: the model was actually consulted before the refusal.
    expect(sent).toHaveLength(1);
  });

  test("falls back to the deterministic matrix, labelled as such, on a permissive deploy", async () => {
    permissive();
    nextAnswer = '{"findings": [{"controlId": "ECC-1.1"}]}'; // missing status/evidence
    const { scanCompliance } = await import("../ai/compliance-analyzer");

    const findings = await scanCompliance(scanInput);

    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      expect(f.provenance.source).toBe("DETERMINISTIC_FALLBACK");
      expect(f.provenance.fallback).toBe(true);
    }
  });

  test("a well-shaped answer is admitted only for known controls, and cites its passage", async () => {
    strict();
    nextAnswer = JSON.stringify({
      findings: [
        {
          controlId: "SLA-TENDER",
          frameworkId: "PROCUREMENT_LAW",
          status: "PASS",
          evidenceEn: "The tender states the penalty.",
          evidenceAr: "تنص كراسة الشروط على الغرامة.",
          remediationEn: null,
          remediationAr: null,
          sourceCategory: "EXPLICIT_TENDER",
          policyVersionId: "gtpl-ksa-baseline",
          sourceRef: "2% weekly delay penalty, capped at 10%",
          legalReviewStatus: "NOT_LEGAL_ADVICE",
        },
        {
          controlId: "SLA-TENDER",
          status: "PASS",
          evidenceEn: "duplicate",
          evidenceAr: "مكرر",
          sourceRef: "x",
        },
        {
          controlId: "INVENTED-42",
          frameworkId: "NCA_ECC1",
          status: "PASS",
          evidenceEn: "made up",
          evidenceAr: "مختلق",
          sourceRef: "x",
        },
        {
          controlId: "SLA-CAP",
          status: "PASS",
          evidenceEn: "asserted without a quote",
          evidenceAr: "بلا اقتباس",
          sourceRef: null,
        },
      ],
    });
    const { scanCompliance } = await import("../ai/compliance-analyzer");

    const findings = await scanCompliance(scanInput);

    expect(findings.map((f) => f.controlId)).toEqual(["SLA-TENDER", "SLA-CAP"]);
    expect(findings[0].provenance).toMatchObject({
      source: "AI_GENERATED",
      provider: "openai",
      model: "test-model",
      fallback: false,
    });
    expect(findings[0].status).toBe("PASS");
    expect(findings[0].sourceRef).toBe("2% weekly delay penalty, capped at 10%");
    // The framework and registry entry come from the matrix row.
    expect(findings[0].frameworkId).toBe("PROCUREMENT_LAW");
    expect(findings[0].policyVersionId).toBe("gtpl-ksa-baseline");
    // An uncited PASS is not a PASS.
    expect(findings[1].status).toBe("WARNING");
    expect(findings[1].legalReviewStatus).toBe("REQUIRED");
  });

  test("the system turn carries the style guide and the document's own glossary terms", async () => {
    permissive();
    nextAnswer = "{}"; // shape failure; only the prompt matters here
    const { scanCompliance } = await import("../ai/compliance-analyzer");
    const { styleGuideFor } = await import("../ai/style-guide");

    await scanCompliance(scanInput);

    const system = sent[0]?.find((m) => m.role === "system")?.content ?? "";
    expect(system).toContain(styleGuideFor("en"));
    expect(system).toContain("service level agreement (SLA)");
    expect(system).toContain("delay penalty");
    expect(system).not.toContain("force majeure");
    expect(system.length).toBeLessThanOrEqual(6_000);
    // The controls in scope travel in the user turn, so the model reports on
    // those and nothing else.
    const user = sent[0]?.find((m) => m.role === "user")?.content ?? "";
    expect(user).toContain('"controls"');
    expect(user).toContain("SLA-TENDER");
  });
});

describe("enrichment legs: a wrong-shaped answer", () => {
  test("a status outside the matrix vocabulary is refused under real-AI-only", async () => {
    strict();
    nextAnswer = '{"findings": ["ok"], "rowUpdates": [{"controlId": "ECC-1.1", "status": "MOSTLY_FINE"}]}';
    const { enrichComplianceWithAi } = await import("../agents/enrich");

    let caught: unknown;
    try {
      await enrichComplianceWithAi({ rows: [] });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ProviderUnavailableError);
    const err = caught as ProviderUnavailableError;
    expect(err.llmFailureKind).toBe("guardrail_rejected");
    expect(err.context).toBe("enrich:compliance");
    expect(err.detail).toMatch(/rowUpdates\.0\.status/);
  });

  test("and reports data: null, fallback: true on a permissive deploy", async () => {
    permissive();
    nextAnswer = "Here you go: not JSON at all.";
    const { enrichComplianceWithAi } = await import("../agents/enrich");

    const result = await enrichComplianceWithAi({ rows: [] });

    expect(result).toMatchObject({ data: null, fallback: true, provider: "openai" });
  });

  test("a status that only differs in formatting is normalized, not refused", async () => {
    strict();
    nextAnswer = '{"rowUpdates": [{"controlId": "PDPL-14", "status": "legal review required", "evidence": "e"}], "findings": ["f", null]}';
    const { enrichComplianceWithAi } = await import("../agents/enrich");

    const result = await enrichComplianceWithAi({ rows: [] });

    expect(result.fallback).toBe(false);
    expect(result.data).toMatchObject({
      rowUpdates: [{ controlId: "PDPL-14", status: "LEGAL_REVIEW_REQUIRED" }],
      findings: ["f"],
    });
  });

  test("the system turn follows the script of the payload it polishes", async () => {
    permissive();
    nextAnswer = "{}";
    const { enrichTechnicalWithAi } = await import("../agents/enrich");
    const { styleGuideFor } = await import("../ai/style-guide");

    await enrichTechnicalWithAi({ solutionApproach: "تُنظَّم المعمارية وفق تغطية متطلبات المنافسة وجدول الكميات." });
    await enrichTechnicalWithAi({ solutionApproach: "Architecture follows the requirement coverage matrix and the BoQ." });

    const [arabic, english] = sent.map((m) => m.find((x) => x.role === "system")?.content ?? "");
    expect(arabic).toContain(styleGuideFor("ar"));
    expect(arabic).toContain("جدول الكميات = bill of quantities (BoQ)");
    expect(english).toContain(styleGuideFor("en"));
    expect(english).toContain("bill of quantities (BoQ) = جدول الكميات");
  });
});
