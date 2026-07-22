import { describe, expect, test } from "bun:test";
import {
  applySectionRewrite,
  evaluateExportPolicy,
  financialForValidationGate,
  getProposalSkill,
  isAgentRunStale,
  parseAgentRunConfig,
  skillInstruction,
  unifiedDiff,
  PROPOSAL_SKILLS,
} from "../proposal-studio";
import { validateProposalOutput } from "../validation-gate";

describe("proposal skills catalog", () => {
  test("exposes all studio skills", () => {
    const ids = PROPOSAL_SKILLS.map((s) => s.id);
    expect(ids).toEqual([
      "rewrite",
      "expand",
      "condense",
      "translate",
      "redesign",
      "section",
    ]);
    expect(getProposalSkill("redesign").id).toBe("redesign");
    expect(skillInstruction("expand", "en")).toContain("Do not invent");
    expect(skillInstruction("rewrite", "en", "Custom")).toBe("Custom");
  });
});

describe("unifiedDiff and section apply", () => {
  test("diff marks changed lines", () => {
    const diff = unifiedDiff("a\nb\nc", "a\nB\nc");
    expect(diff.some((l) => l.startsWith("- b"))).toBe(true);
    expect(diff.some((l) => l.startsWith("+ B"))).toBe(true);
  });

  test("section rewrite replaces selection only", () => {
    const full = "# One\n\nBody\n\n# Two\n\nOther";
    const next = applySectionRewrite(full, "Body", "Expanded body");
    expect(next).toContain("Expanded body");
    expect(next).toContain("# Two");
  });
});

describe("export policy", () => {
  const okValidation = {
    ok: true,
    blocking: false,
    issues: [],
    checkedAt: new Date().toISOString(),
  };
  const blockedValidation = {
    ok: false,
    blocking: true,
    issues: [
      {
        code: "pricing_language",
        severity: "error" as const,
        message: "pricing",
      },
    ],
    checkedAt: new Date().toISOString(),
  };

  test("blocks final export on validation errors", () => {
    const r = evaluateExportPolicy({
      proposalStatus: "APPROVED",
      validation: blockedValidation,
      format: "zip",
      hasApprovalPolicy: true,
    });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.code).toBe("validation_blocked");
  });

  test("requires approval when policy exists", () => {
    const r = evaluateExportPolicy({
      proposalStatus: "GENERATED",
      validation: okValidation,
      format: "pdf",
      hasApprovalPolicy: true,
    });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.code).toBe("approval_required");
  });

  test("allows approved zip and marks exported", () => {
    const r = evaluateExportPolicy({
      proposalStatus: "APPROVED",
      validation: okValidation,
      format: "zip",
      hasApprovalPolicy: true,
    });
    expect(r.allowed).toBe(true);
    if (r.allowed) expect(r.markExported).toBe(true);
  });

  test("html preflight allowed without approval", () => {
    const r = evaluateExportPolicy({
      proposalStatus: "DRAFT",
      validation: okValidation,
      format: "html",
      hasApprovalPolicy: true,
    });
    expect(r.allowed).toBe(true);
  });

  test("without approval policy allows generated final export", () => {
    const r = evaluateExportPolicy({
      proposalStatus: "GENERATED",
      validation: okValidation,
      format: "zip",
      hasApprovalPolicy: false,
    });
    expect(r.allowed).toBe(true);
  });
});

describe("human BoQ exemption", () => {
  test("human-priced BoQ does not block validation gate", () => {
    const financial = financialForValidationGate({
      source: "human",
      boqItems: [
        { item: "A", unit: "LS", qty: 1, unitPrice: 100, total: 100 },
      ],
    });
    const report = validateProposalOutput({
      contentMd: "# Proposal\nNot legal advice.",
      financial,
      entities: null,
      complianceRows: [],
    });
    expect(report.blocking).toBe(false);
    expect(report.issues.some((i) => i.code === "ai_priced_boq")).toBe(false);
  });

  test("agent-priced BoQ still blocks", () => {
    const financial = financialForValidationGate({
      source: "agent_structure_only",
      boqItems: [
        { item: "A", unit: "LS", qty: 1, unitPrice: 100, total: 100 },
      ],
    });
    const report = validateProposalOutput({
      contentMd: "# Proposal\nNot legal advice.",
      financial,
      entities: null,
      complianceRows: [],
    });
    expect(report.blocking).toBe(true);
  });
});

describe("agent run config and stale detection", () => {
  test("parses config", () => {
    const cfg = parseAgentRunConfig(
      JSON.stringify({
        locale: "en",
        workspaceId: "w1",
        userId: "u1",
        projectId: "p1",
        regenerateMode: "fork",
        targetProposalId: "prop1",
      })
    );
    expect(cfg?.regenerateMode).toBe("fork");
    expect(cfg?.targetProposalId).toBe("prop1");
  });

  test("detects stale queued runs", () => {
    const now = Date.now();
    expect(
      isAgentRunStale({
        status: "QUEUED",
        createdAt: new Date(now - 60_000),
        startedAt: null,
        updatedAt: new Date(now - 60_000),
        overallProgress: 0,
        now,
      })
    ).toBe(true);
    expect(
      isAgentRunStale({
        status: "RUNNING",
        createdAt: new Date(now - 60_000),
        startedAt: new Date(now - 60_000),
        updatedAt: new Date(now - 10_000),
        overallProgress: 40,
        now,
      })
    ).toBe(false);
  });
});
