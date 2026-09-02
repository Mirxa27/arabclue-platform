/**
 * The output guardrail was failing the product it protects.
 *
 * Production run 2026-09-01 died in 28 seconds with
 * `Provider unavailable in real-AI-only mode (enrich:ingestion,
 * guardrail_rejected)`. The provider had answered. `applyOutputGuardrails`
 * then clamped confidence to `0.7 × lexical-overlap + 0.35`, every provider
 * row asks for 0.85, and a structured JSON enrichment shares perhaps a third
 * of its tokens with the prompt. So every generative step — enrichment,
 * drafting, the contract — was rejected by construction, strict real-AI mode
 * turned the rejection into a throw, and the only run that ever COMPLETED was
 * the one-second deterministic one from July.
 *
 * Lexical overlap is a proxy, not a detector. A model that paraphrases or
 * returns JSON is not thereby fabricating. The rule now: the hard guards stay
 * (empty, pricing, toxicity), ungrounded Etimad references are still redacted,
 * and low confidence is fatal only next to a fabrication signal — an AI
 * self-reference phrase or a reference that had to be redacted. Otherwise the
 * confidence travels with the result for the UI and the audit row.
 *
 * The other half: the reason was being dropped. `reasons[]` said
 * `confidence_0.52_below_0.85`; the run record said `guardrail_rejected`.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AIProviderConfig } from "@prisma/client";
import { applyOutputGuardrails } from "../guardrails";
import { SYSTEM_INGESTION, enrichUserPrompt } from "../agents/prompts";
import { guardOrThrow, ProviderUnavailableError } from "../ai/provider-unavailable";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");

// The production rows, as read from /api/admin/ai-providers on 2026-09-02.
const productionProvider = {
  toxicityFilter: true,
  hallucinationGuard: true,
  piiFilter: true,
  confidenceThreshold: 0.85,
} as AIProviderConfig;

// What the orchestrator actually sends for `enrich:ingestion`: the parsed
// payload of a small RFP, through the real system prompt and user template.
const payload = {
  scope: "Cloud hosting migration for a ministry portal, 24 months, Riyadh region.",
  evaluation: { technical: 70, financial: 30 },
  sla: { perWeek: 1, maxPercent: 10 },
  milestones: [
    { name: "Assessment", weeks: 4 },
    { name: "Migration", weeks: 12 },
  ],
  requirements: [
    { text: "Data residency inside the Kingdom", sectionRef: "3.2", pageRef: "7" },
    { text: "NCA ECC compliance evidence", sectionRef: "4.1", pageRef: "9" },
  ],
  etimadRef: "ETM-2026-0417-88A1B2",
};
const messages = [
  { role: "system" as const, content: SYSTEM_INGESTION },
  { role: "user" as const, content: enrichUserPrompt("ingestion", payload) },
];

// A faithful enrichment: same facts, evaluator-facing wording, JSON only.
const faithfulJson = JSON.stringify({
  scope:
    "Migrate the ministry's citizen portal to a Kingdom-resident cloud platform over 24 months, operated from the Riyadh region with a staged cut-over.",
  evaluation: { technical: 70, financial: 30 },
  sla: { perWeek: 1, maxPercent: 10 },
  milestones: [
    { name: "Assessment", weeks: 4 },
    { name: "Migration", weeks: 12 },
  ],
  requirements: [
    {
      text: "All production data remains inside the Kingdom (data residency)",
      sectionRef: "3.2",
      pageRef: "7",
    },
    {
      text: "Documented NCA ECC control evidence submitted with the bid",
      sectionRef: "4.1",
      pageRef: "9",
    },
  ],
  evidence: ["Section 3.2 residency clause", "Section 4.1 ECC annex"],
  refinementNotes: ["Penalty ceiling stated as 10 percent; confirm weekly rate in annex B."],
});

describe("a faithful generative answer passes the production guardrail", () => {
  test("structured ingestion JSON is not rejected at threshold 0.85", () => {
    const r = applyOutputGuardrails(faithfulJson, productionProvider, messages, 0.93);
    expect(r.rejected, `reasons: ${r.reasons.join(",")}`).toBe(false);
    expect(r.content.length).toBeGreaterThan(100);
  });

  test("a low overlap score is still reported, just not fatal on its own", () => {
    const r = applyOutputGuardrails(
      "The bidder will deliver the migration in two phases with weekly reporting.",
      productionProvider,
      messages,
      0.93,
    );
    expect(r.rejected).toBe(false);
    expect(r.reasons.some((x) => x.startsWith("confidence_"))).toBe(true);
    expect(r.confidence).toBeLessThan(0.85);
  });

  test("citing the RFP's own Etimad reference is not a hallucination", () => {
    // The cue list matched any Etimad reference at all, so a proposal that
    // quoted the tender's real number was penalised for being specific.
    const r = applyOutputGuardrails(
      `${faithfulJson.slice(0, -1)},"reference":"Submitted against Etimad ref ETM-2026-0417-88A1B2 as stated in the notice."}`,
      productionProvider,
      messages,
      0.93,
    );
    expect(r.rejected, `reasons: ${r.reasons.join(",")}`).toBe(false);
    expect(r.content).toContain("ETM-2026-0417-88A1B2");
    expect(r.reasons).not.toContain("hallucination_cues");
  });

  test("a faithful Arabic enrichment passes — clitics defeat token overlap", () => {
    // The workspace is Arabic-first. Arabic prefixes (ال، و، ب، ل) make a
    // restated word a different token, so a faithful Arabic answer shares
    // almost nothing lexically with its own source and the clamp sank it.
    const arabicPayload = {
      scope: "ترحيل بوابة الوزارة إلى سحابة داخل المملكة خلال 24 شهراً",
      evaluation: { technical: 70, financial: 30 },
      requirements: [
        { text: "إقامة البيانات داخل المملكة", sectionRef: "3.2", pageRef: "7" },
        { text: "أدلة الامتثال لضوابط الهيئة الوطنية للأمن السيبراني", sectionRef: "4.1", pageRef: "9" },
      ],
    };
    const arabicMessages = [
      { role: "system" as const, content: SYSTEM_INGESTION },
      { role: "user" as const, content: enrichUserPrompt("ingestion", arabicPayload) },
    ];
    const arabicOutput = JSON.stringify({
      scope:
        "يشمل نطاق العمل ترحيل بوابة الوزارة بالكامل إلى منصة سحابية مستضافة بالمملكة على مدى أربعة وعشرين شهراً مع خطة انتقال مرحلية",
      evaluation: { technical: 70, financial: 30 },
      requirements: [
        { text: "تبقى جميع بيانات الإنتاج مقيمةً بالمملكة دون استثناء", sectionRef: "3.2", pageRef: "7" },
        { text: "تُرفق مع العرض أدلةٌ موثقةٌ للامتثال للضوابط الأساسية للأمن السيبراني", sectionRef: "4.1", pageRef: "9" },
      ],
      evidence: ["البند 3.2 لإقامة البيانات", "الملحق 4.1 للضوابط"],
      refinementNotes: ["تأكيد نسبة الغرامة الأسبوعية من الملحق ب"],
    });
    const r = applyOutputGuardrails(arabicOutput, productionProvider, arabicMessages, 0.93);
    expect(r.rejected, `reasons: ${r.reasons.join(",")}`).toBe(false);
    expect(r.content).toContain("بالمملكة");
  });
});

describe("the hard guards still bite", () => {
  test("an AI self-reference next to low confidence is rejected, with the reason", () => {
    const r = applyOutputGuardrails(
      "As an AI language model I don't have access to the tender documents, but typically such portals need a migration plan.",
      productionProvider,
      messages,
      0.93,
    );
    expect(r.rejected).toBe(true);
    expect(r.reasons).toContain("hallucination_cues");
    expect(r.reasons.some((x) => x.startsWith("confidence_"))).toBe(true);
  });

  test("an Etimad reference not in the context is a fabrication signal", () => {
    // A made-up reference is exactly what the guard exists for: counted,
    // and with the overlap score below threshold, the answer is refused —
    // and the refusal says why.
    const r = applyOutputGuardrails(
      `${faithfulJson.slice(0, -1)},"relatedTender":"Etimad ref ETM-2031-9999-ZZZZ99"}`,
      productionProvider,
      messages,
      0.93,
    );
    expect(r.rejected).toBe(true);
    expect(r.content).not.toContain("ETM-2031-9999-ZZZZ99");
    expect(r.reasons).toContain("refs_omitted_1");
    expect(r.reasons.some((x) => x.startsWith("confidence_"))).toBe(true);
  });

  test("pricing and empty output are rejected regardless of grounding", () => {
    const priced = applyOutputGuardrails(
      "Recommended price: SAR 4,200,000, with a margin of 12% on the base.",
      productionProvider,
      messages,
      0.93,
    );
    expect(priced.rejected).toBe(true);
    expect(priced.reasons).toContain("pricing_guardrail");
    const empty = applyOutputGuardrails("   ", productionProvider, messages, 0.93);
    expect(empty.rejected).toBe(true);
    expect(empty.reasons).toContain("empty_output");
  });
});

describe("the rejection reason reaches the run record", () => {
  test("guardOrThrow names the guardrail reasons in the error", () => {
    const prev = process.env.AUTONOMY_REAL_AI_ONLY;
    delete process.env.AUTONOMY_REAL_AI_ONLY; // unset = strict
    try {
      let thrown: unknown;
      try {
        guardOrThrow(
          {
            fallback: true,
            failureKind: "guardrail_rejected",
            provider: "zai",
            guardrailReasons: ["confidence_0.52_below_0.85", "hallucination_cues"],
          },
          "enrich:ingestion",
        );
      } catch (e) {
        thrown = e;
      }
      expect(thrown).toBeInstanceOf(ProviderUnavailableError);
      const message = (thrown as Error).message;
      expect(message).toContain("guardrail_rejected");
      expect(message).toContain("confidence_0.52_below_0.85");
      expect(message).toContain("hallucination_cues");
    } finally {
      if (prev !== undefined) process.env.AUTONOMY_REAL_AI_ONLY = prev;
    }
  });

  test("generateCompletion forwards the reasons on the result", () => {
    // Source ratchet: the LLM layer has to copy `guarded.reasons` onto the
    // result, or guardOrThrow above has nothing to name.
    const src = readFileSync(join(REPO_ROOT, "src/lib/llm/index.ts"), "utf8");
    expect(/guardrailReasons:\s*guarded\.reasons/.test(src)).toBe(true);
  });
});
