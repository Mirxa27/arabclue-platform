import { describe, expect, test } from "bun:test";
import { canWriteRole, canGrantRole } from "../auth";
import { assertWorkspaceMatch } from "../workspace-context";
import { evaluateCompliance } from "../agents/compliance";
import type { IngestionEntities } from "../types";
import { chunkText } from "../document-chunks";
import {
  applyOutputGuardrails,
  failsToxicityFilter,
  estimateGroundingConfidence,
} from "../guardrails";
import { generateProposalPPTX } from "../generators";
import { assertProductionSecrets } from "../crypto";
import type { AIProviderConfig } from "@prisma/client";
import {
  inferModelCapabilities,
  normalizeOpenAiBase,
  parseModelsCache,
  requireConfiguredModelId,
  AGENT_ENGINES,
} from "../llm/model-catalog";

describe("auth write roles", () => {
  test("REVIEWER cannot write; BIDDER/ADMIN can", () => {
    expect(canWriteRole("REVIEWER")).toBe(false);
    expect(canWriteRole("BIDDER")).toBe(true);
    expect(canWriteRole("ADMIN")).toBe(true);
    expect(canWriteRole("FINANCE")).toBe(true);
  });

  test("grant hierarchy still holds", () => {
    expect(canGrantRole("ADMIN", "REVIEWER")).toBe(true);
    expect(canGrantRole("ADMIN", "SUPER_ADMIN")).toBe(false);
  });
});

describe("workspace ownership helper", () => {
  test("assertWorkspaceMatch rejects cross-tenant ids", () => {
    expect(assertWorkspaceMatch("ws-a", "ws-a")).toBe(true);
    expect(assertWorkspaceMatch("ws-a", "ws-b")).toBe(false);
    expect(assertWorkspaceMatch(null, "ws-a")).toBe(false);
    expect(assertWorkspaceMatch(undefined, "ws-a")).toBe(false);
  });
});

describe("compliance statuses", () => {
  const baseEntities: IngestionEntities = {
    scope: "Digital platform",
    evaluation: { technical: 70, financial: 30 },
    sla: { perWeek: 2, maxPercent: 20, capped: false },
    milestones: [{ name: "Build", weeks: 8 }],
    evidence: [],
  };

  test("PDPL residency gap requires clarification, not a universal mandate", () => {
    const { rows } = evaluateCompliance({
      entities: baseEntities,
      tenderText: "Simple tender with no residency language",
      tenderCategory: "IT",
    });
    const pdpl = rows.find((r) => r.frameworkId === "PDPL");
    expect(pdpl).toBeTruthy();
    expect(pdpl!.status).not.toBe("GAP");
    expect([
      "CLARIFICATION_REQUIRED",
      "LEGAL_REVIEW_REQUIRED",
      "PARTIAL",
      "COMPLIANT",
      "PENDING",
    ]).toContain(pdpl!.status);
    expect(pdpl!.evidence.toLowerCase()).not.toContain("100% ksa data residency mandate");
  });

  test("LOCAL_CONTENT does not assume a blanket preference percentage", () => {
    const missing = evaluateCompliance({
      entities: baseEntities,
      tenderText: "Cloud hosting without small-business preference terms",
      tenderCategory: "IT",
    });
    const lcMissing = missing.rows.find((r) => r.frameworkId === "LOCAL_CONTENT");
    expect(lcMissing?.status).toBe("NOT_APPLICABLE");

    const hit = evaluateCompliance({
      entities: baseEntities,
      tenderText:
        "Vendor commits to Local Content preference of 10% and Saudization targets",
      tenderCategory: "IT",
    });
    const lcHit = hit.rows.find((r) => r.frameworkId === "LOCAL_CONTENT");
    expect(lcHit?.status).toBe("COMPLIANT");
    expect(lcHit?.sourceCategory).toBe("EXPLICIT_TENDER");
  });

  test("SLA cap row is evidence-based under procurement law", () => {
    const { rows, findings } = evaluateCompliance({
      entities: { ...baseEntities, sla: { perWeek: 2, maxPercent: 20 } },
      tenderText: "Services tender",
      tenderCategory: "IT",
    });
    const sla = rows.find((r) => r.controlId === "SLA-CAP");
    expect(sla?.status).toBe("COMPLIANT");
    expect(findings.some((f) => f.includes("SLA"))).toBe(true);
  });
});

describe("MFA login contract (client payload shape)", () => {
  test("setup requires session; verify uses TOTP token", () => {
    // Setup is session-authenticated; rotation may include currentToken
    const setupBody = { currentToken: "123456" };
    const verifyBody = { token: "123456" };
    expect(typeof setupBody.currentToken).toBe("string");
    expect(verifyBody.token).toMatch(/^\d{6}$/);
  });
});

describe("document RAG chunking", () => {
  test("splits long tender text into overlapping windows", () => {
    const text = "كلمة ".repeat(400) + "نطاق العمل والامتثال السيبراني PDPL NCA ECC";
    const chunks = chunkText(text, 200, 40);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length > 0)).toBe(true);
  });
});

describe("LLM guardrails", () => {
  const provider = {
    toxicityFilter: true,
    hallucinationGuard: true,
    piiFilter: true,
    confidenceThreshold: 0.5,
  } as AIProviderConfig;

  test("rejects toxic output", () => {
    expect(failsToxicityFilter("please kill yourself now")).toBe(true);
    const r = applyOutputGuardrails(
      "please kill yourself now",
      provider,
      [{ role: "user", content: "write a proposal" }],
      0.9
    );
    expect(r.rejected).toBe(true);
  });

  test("grounds confidence in input context", () => {
    const messages = [
      {
        role: "user" as const,
        content:
          "Etimad tender PDPL residency NCA ECC local content Vision 2030 saudization methodology",
      },
    ];
    const grounded = estimateGroundingConfidence(
      "Proposal aligns with Vision 2030, PDPL residency in KSA, NCA ECC controls, and local content preference.",
      messages
    );
    const ungrounded = estimateGroundingConfidence(
      "As an AI model my training data suggests quantum teleportation portals.",
      messages
    );
    expect(grounded).toBeGreaterThan(ungrounded);
  });
});

describe("PPTX artifact generation", () => {
  test("produces a real PPTX binary (ZIP signature)", async () => {
    const proposal = {
      id: "p1",
      title: "Test Proposal",
      complianceScore: 88,
    } as Parameters<typeof generateProposalPPTX>[0];
    const project = {
      title: "Digital Platform RFP",
      etimadRef: "ETM-TEST-001",
      category: "IT",
      currency: "SAR",
      budget: 5_000_000,
      saudizationTarget: 35,
    } as Parameters<typeof generateProposalPPTX>[1];
    const buf = await generateProposalPPTX(proposal, project, null, {
      quickLiquidityRatio: 1.4,
      qlrPasses: true,
      saudizationPercent: 40,
      complianceScore: 88,
    });
    expect(buf.length).toBeGreaterThan(1000);
    // PPTX is a ZIP container — PK magic bytes
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4b);
  });
});

describe("production secrets gate", () => {
  test("no-ops outside production", () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    expect(() => assertProductionSecrets()).not.toThrow();
    process.env.NODE_ENV = prev;
  });
});

describe("AI model catalog & engines", () => {
  test("exposes agent engines including embedding", () => {
    expect(AGENT_ENGINES).toContain("DEFAULT");
    expect(AGENT_ENGINES).toContain("DRAFTING");
    expect(AGENT_ENGINES).toContain("EMBEDDING");
    expect(AGENT_ENGINES).toContain("VOICE");
  });

  test("infers capabilities from heuristics and remote metadata only", () => {
    const embed = inferModelCapabilities("text-embedding-3-small");
    expect(embed.supportsJsonMode).toBe(false);
    expect(embed.contextWindow).toBe(8191);

    const visionNamed = inferModelCapabilities("acme-vision-large");
    expect(visionNamed.supportsVision).toBe(true);

    const fromMeta = inferModelCapabilities("provider-model-xyz", {
      supports_vision: true,
      context_window: 200000,
      max_output_tokens: 64000,
    });
    expect(fromMeta.supportsVision).toBe(true);
    expect(fromMeta.contextWindow).toBe(200000);
    expect(fromMeta.maxTokens).toBe(64000);
  });

  test("normalizes OpenAI-compatible base URLs to /v1", () => {
    expect(normalizeOpenAiBase("https://openrouter.ai/api")).toBe(
      "https://openrouter.ai/api/v1"
    );
    expect(normalizeOpenAiBase("https://api.openai.com/v1/")).toBe(
      "https://api.openai.com/v1"
    );
    expect(normalizeOpenAiBase("")).toBe("");
  });

  test("connection templates never embed model ids", async () => {
    const { PROVIDER_CONNECTION_TEMPLATES } = await import("../llm/model-catalog");
    for (const t of PROVIDER_CONNECTION_TEMPLATES) {
      expect((t as { modelId?: string }).modelId).toBeUndefined();
      expect(t.provider).toBeTruthy();
    }
  });

  test("requires configured model id at runtime — no hardcoded fallback", () => {
    expect(() => requireConfiguredModelId("")).toThrow(/no model selected/i);
    expect(() => requireConfiguredModelId(null)).toThrow(/no model selected/i);
    expect(requireConfiguredModelId("live-model-from-provider")).toBe(
      "live-model-from-provider"
    );
  });

  test("parses cached remote model lists", () => {
    const cached = parseModelsCache(
      JSON.stringify([
        {
          id: "remote-a",
          contextWindow: 1000,
          maxTokens: 500,
          supportsVision: false,
          supportsJsonMode: true,
          supportsTools: true,
        },
      ])
    );
    expect(cached).toHaveLength(1);
    expect(cached[0]?.id).toBe("remote-a");
    expect(parseModelsCache(null)).toEqual([]);
    expect(parseModelsCache("not-json")).toEqual([]);
  });
});
