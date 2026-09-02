import { describe, expect, test } from "bun:test";
import {
  applySectionRewrite,
  evaluateExportPolicy,
  financialForValidationGate,
  getProposalSkill,
  isAgentRunStale,
  parseAgentRunConfig,
  pickIngestionEntities,
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

  test("the bid package requires approval when policy exists", () => {
    const r = evaluateExportPolicy({
      proposalStatus: "GENERATED",
      validation: okValidation,
      format: "zip",
      hasApprovalPolicy: true,
    });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.code).toBe("approval_required");
  });

  test("a draft PDF, DOCX or deck renders before approval, never as exported", () => {
    // The first real production run produced a 3,783-word proposal and the
    // bidder could not download it: every binary format was approval-only.
    // The renderer already stamps non-authoritative exports with DRAFT
    // chrome, and the HTML preview with the same content was always
    // allowed, so the gate made the draft harder to get, not safer.
    for (const format of ["pdf", "docx", "pptx", "slides"]) {
      const r = evaluateExportPolicy({
        proposalStatus: "GENERATED",
        validation: okValidation,
        format,
        hasApprovalPolicy: true,
      });
      expect(r.allowed, format).toBe(true);
      if (r.allowed) expect(r.markExported, format).toBe(false);
    }
  });

  test("the package and the matrices stay final-only", () => {
    for (const format of ["zip", "xlsx", "xlsx-matrix", "xlsx-boq", "ea-matrix", "boq"]) {
      const r = evaluateExportPolicy({
        proposalStatus: "GENERATED",
        validation: okValidation,
        format,
        hasApprovalPolicy: true,
      });
      expect(r.allowed, format).toBe(false);
      if (!r.allowed) expect(r.code, format).toBe("approval_required");
    }
  });

  test("a contract PDF stays behind legal approval", () => {
    const r = evaluateExportPolicy({
      proposalStatus: "REVIEW",
      validation: okValidation,
      format: "pdf",
      hasApprovalPolicy: true,
      kind: "contract",
    });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.code).toBe("approval_required");
  });

  test("a blocked validation still stops a draft PDF", () => {
    const r = evaluateExportPolicy({
      proposalStatus: "GENERATED",
      validation: blockedValidation,
      format: "pdf",
      hasApprovalPolicy: true,
    });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.code).toBe("validation_blocked");
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

  test("blocked HTML and manifest are never authoritative final exports", () => {
    for (const format of ["html", "manifest"]) {
      const result = evaluateExportPolicy({
        proposalStatus: "APPROVED",
        validation: blockedValidation,
        format,
        hasApprovalPolicy: true,
      });
      expect(result.allowed, format).toBe(false);
      if (!result.allowed) {
        expect(result.code, format).toBe("validation_blocked");
      }
    }
  });

  test("without approval policy blocks generated final export", () => {
    const r = evaluateExportPolicy({
      proposalStatus: "GENERATED",
      validation: okValidation,
      format: "zip",
      hasApprovalPolicy: false,
    });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.code).toBe("approval_required");
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

describe("pickIngestionEntities — validate/download parity", () => {
  test("prefers document with NORA principles over earlier plain entities", () => {
    const withNora = {
      scope: "s",
      evaluation: { technical: 70, financial: 30 },
      sla: { perWeek: 1, maxPercent: 10 },
      milestones: [],
      evidence: [],
      noraPrinciplesFromTender: [
        { id: "TP99", name: "Test", snippet: "from tender" },
      ],
    };
    const plain = {
      scope: "plain",
      evaluation: { technical: 70, financial: 30 },
      sla: { perWeek: 1, maxPercent: 10 },
      milestones: [],
      evidence: [],
    };
    const picked = pickIngestionEntities([
      { extractedEntities: JSON.stringify(plain) },
      { extractedEntities: JSON.stringify(withNora) },
    ]);
    expect(picked?.noraPrinciplesFromTender?.[0]?.id).toBe("TP99");
  });

  test("ignores bad JSON and returns null when empty", () => {
    expect(pickIngestionEntities([])).toBeNull();
    expect(
      pickIngestionEntities([{ extractedEntities: "{not-json" }])
    ).toBeNull();
  });

  test("same entities yield same validation.blocking for validate and download paths", () => {
    const entities = pickIngestionEntities([
      {
        extractedEntities: JSON.stringify({
          scope: "s",
          evaluation: { technical: 70, financial: 30 },
          sla: { perWeek: 1, maxPercent: 10 },
          milestones: [],
          evidence: [],
          noraPrinciplesFromTender: [
            { id: "TP99", name: "Test", snippet: "tender" },
          ],
        }),
      },
    ]);
    const contentMd =
      "# Proposal\nNot legal advice.\nReferences NORA principle TP99.";
    const validateReport = validateProposalOutput({
      contentMd,
      financial: null,
      entities,
      complianceRows: [],
    });
    const downloadReport = validateProposalOutput({
      contentMd,
      financial: null,
      entities,
      complianceRows: [],
    });
    expect(validateReport.blocking).toBe(downloadReport.blocking);
    expect(
      validateReport.issues
        .filter((i) => i.code === "invented_nora_id")
        .map((i) => i.message)
    ).toEqual(
      downloadReport.issues
        .filter((i) => i.code === "invented_nora_id")
        .map((i) => i.message)
    );
    // TP99 allowed via tender extract — not invented
    expect(
      validateReport.issues.some((i) => i.code === "invented_nora_id")
    ).toBe(false);
  });
});
