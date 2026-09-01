import { describe, expect, test } from "bun:test";
import {
  AUTOPILOT_CONFIDENCE,
  buildClassificationMessages,
  classifyAttachment,
  classifyAttachmentWithAi,
  parseClassificationResponse,
} from "@/lib/agents/platform/classify-attachment";
import { ProviderUnavailableError } from "@/lib/ai/provider-unavailable";

const PRIOR = classifyAttachment({
  originalName: "scan_0042.pdf",
  mimeType: "application/pdf",
  textPreview: "Ministry procurement package, evaluation weights attached.",
});

/** Restores after the promise settles, so a flag cannot leak into another file. */
async function withEnv<T>(
  vars: Record<string, string | undefined>,
  run: () => Promise<T>
): Promise<T> {
  const previous = Object.keys(vars).map(
    (key) => [key, process.env[key]] as const
  );
  try {
    for (const [key, value] of Object.entries(vars)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    return await run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe("model-led attachment classification", () => {
  test("the keyword pass alone cannot read this filename", () => {
    // Guards the premise of every test below: the prior is the low-signal
    // branch, so any RFP verdict here came from the model.
    expect(PRIOR.category).toBe("OTHER");
    expect(PRIOR.createProject).toBe(false);
  });

  test("the model's verdict overrides the keyword prior", () => {
    const decision = parseClassificationResponse(
      '```json\n{"category":"RFP","confidence":0.93,"suggestedTitle":"Cloud migration tender","reason":"Bid conditions and evaluation criteria"}\n```',
      PRIOR
    );

    expect(decision).not.toBeNull();
    expect(decision?.category).toBe("RFP");
    expect(decision?.confidence).toBe(0.93);
    expect(decision?.createProject).toBe(true);
    expect(decision?.runPipeline).toBe(true);
    expect(decision?.clarifyingQuestion).toBeNull();
    expect(decision?.suggestedTitle).toBe("Cloud migration tender");
  });

  test("an unrecognised category is refused rather than coerced", () => {
    expect(
      parseClassificationResponse('{"category":"TENDER_ISH","confidence":0.9}', PRIOR)
    ).toBeNull();
    expect(parseClassificationResponse("I think it is an RFP.", PRIOR)).toBeNull();
    expect(parseClassificationResponse("", PRIOR)).toBeNull();
  });

  test("an unsure model asks instead of acting", () => {
    const decision = parseClassificationResponse(
      '{"category":"RFP","confidence":0.4,"clarifyingQuestion":"Is this the tender itself or a summary?"}',
      PRIOR
    );

    expect(decision?.confidence).toBeLessThan(AUTOPILOT_CONFIDENCE);
    expect(decision?.createProject).toBe(false);
    expect(decision?.runPipeline).toBe(false);
    expect(decision?.clarifyingQuestion).toBe(
      "Is this the tender itself or a summary?"
    );
  });

  test("a confidence outside 0..1 is clamped, never trusted as given", () => {
    expect(
      parseClassificationResponse('{"category":"FINANCIAL","confidence":7}', PRIOR)
        ?.confidence
    ).toBe(1);
    expect(
      parseClassificationResponse('{"category":"FINANCIAL","confidence":-2}', PRIOR)
        ?.confidence
    ).toBe(0);
    expect(
      parseClassificationResponse('{"category":"FINANCIAL"}', PRIOR)?.confidence
    ).toBe(PRIOR.confidence);
  });

  test("the prompt carries the evidence the model needs and bounds the excerpt", () => {
    const messages = buildClassificationMessages(
      {
        originalName: "scan_0042.pdf",
        mimeType: "application/pdf",
        textPreview: "x".repeat(50_000),
        source: "upload",
      },
      PRIOR
    );

    expect(messages[0]?.role).toBe("system");
    const user = messages[1]?.content ?? "";
    expect(user).toContain("scan_0042.pdf");
    expect(user).toContain("application/pdf");
    expect(user).toContain("upload");
    expect(user).toContain(PRIOR.category);
    expect(user.length).toBeLessThan(12_000);
    expect(messages[0]?.content).toContain("RFP");
  });

  test("no provider, real-AI-only opted out: keeps the keyword decision", async () => {
    // `"0"` rather than unset: unset is strict, so the permissive path is only
    // reachable where a deploy asked for it.
    const decision = await withEnv(
      { ARABCLUE_LLM_DETERMINISTIC: "1", AUTONOMY_REAL_AI_ONLY: "0" },
      () =>
        classifyAttachmentWithAi({
          originalName: "Etimad-RFP-Cloud-2026.pdf",
          mimeType: "application/pdf",
          textPreview: "كراسة الشروط لمناقصة خدمات تقنية المعلومات",
        })
    );

    expect(decision.category).toBe("RFP");
  });

  test("no provider under real-AI-only: refuses instead of guessing", async () => {
    const attempt = withEnv(
      { ARABCLUE_LLM_DETERMINISTIC: "1", AUTONOMY_REAL_AI_ONLY: "1" },
      () =>
        classifyAttachmentWithAi({
          originalName: "Etimad-RFP-Cloud-2026.pdf",
          mimeType: "application/pdf",
          textPreview: "كراسة الشروط لمناقصة خدمات تقنية المعلومات",
        })
    );

    await expect(attempt).rejects.toBeInstanceOf(ProviderUnavailableError);
  });
});
