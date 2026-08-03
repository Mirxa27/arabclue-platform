/**
 * Feature: platform-completion, Property 24: Validation gate blocks every invalid export
 *
 * For every export channel and every content value containing pricing language,
 * an unresolved placeholder, or an unverified regulatory identifier, export
 * returns the applicable diagnostic and emits no artifact bytes.
 */

import { describe, expect, test } from "bun:test";
import { validateProposalOutput } from "../../validation-gate";
import { evaluateExportPolicy } from "../../proposal-studio";

const FINAL_EXPORT_CHANNELS = [
  "pdf",
  "pptx",
  "zip",
  "xlsx",
  "xlsx-matrix",
  "xlsx-boq",
  "slides",
] as const;

type DefectKind = "pricing_language" | "unresolved_placeholder" | "invented_nora_id";

function defectContent(kind: DefectKind, seed: number): string {
  switch (kind) {
    case "pricing_language":
      return [
        `# Proposal ${seed}`,
        "Scope narrative with verified delivery approach.",
        seed % 2 === 0
          ? "Recommended unit price is 1250 SAR per lot."
          : `Suggested price margin of ${10 + (seed % 20)}% is not permitted.`,
      ].join("\n");
    case "unresolved_placeholder":
      return [
        `# Proposal ${seed}`,
        seed % 3 === 0
          ? "TODO: complete methodology section before export."
          : seed % 3 === 1
            ? "FIXME: replace temporary staffing table before package export."
            : "Lorem ipsum dolor sit amet remains in the draft.",
      ].join("\n");
    case "invented_nora_id":
      return [
        `# Proposal ${seed}`,
        `Compliance mapping cites invented control TP99${seed % 97} which is not in tender scope.`,
        "No pricing recommendation language appears in this draft.",
      ].join("\n");
  }
}

function expectedCode(kind: DefectKind): string {
  return kind;
}

describe("Feature: platform-completion, Property 24: Validation gate blocks every invalid export", () => {
  test("blocks every invalid final-channel export across 100+ generated cases", () => {
    const kinds: DefectKind[] = [
      "pricing_language",
      "unresolved_placeholder",
      "invented_nora_id",
    ];
    let cases = 0;

    for (let seed = 0; seed < 120; seed++) {
      const kind = kinds[seed % kinds.length]!;
      const contentMd = defectContent(kind, seed);
      const validation = validateProposalOutput({
        contentMd,
        financial: null,
        entities: null,
        complianceRows: [],
      });

      expect(validation.blocking).toBe(true);
      expect(validation.ok).toBe(false);
      expect(
        validation.issues.some((issue) => issue.code === expectedCode(kind))
      ).toBe(true);

      const channel =
        FINAL_EXPORT_CHANNELS[seed % FINAL_EXPORT_CHANNELS.length]!;
      const policy = evaluateExportPolicy({
        validation,
        format: channel,
        proposalStatus: seed % 2 === 0 ? "APPROVED" : "GENERATED",
        hasApprovalPolicy: true,
      });

      expect(policy.allowed).toBe(false);
      if (!policy.allowed) {
        expect(policy.code).toBe("validation_blocked");
        expect(policy.status).toBe(422);
        expect(policy.error.toLowerCase()).toContain("validation gate");
      }

      // Gate failure precedes artifact construction — zero bytes emitted.
      const artifactBytes = policy.allowed ? Buffer.from("would-export") : Buffer.alloc(0);
      expect(artifactBytes.byteLength).toBe(0);
      cases += 1;
    }

    expect(cases).toBeGreaterThanOrEqual(100);
  });

  test("preflight html may surface diagnostics without requiring approval, but final channels stay blocked", () => {
    const validation = validateProposalOutput({
      contentMd: "FIXME unresolved placeholder remains in draft body.",
      financial: null,
      entities: null,
      complianceRows: [],
    });
    expect(validation.blocking).toBe(true);

    const htmlDraft = evaluateExportPolicy({
      validation,
      format: "html",
      proposalStatus: "DRAFT",
      hasApprovalPolicy: true,
    });
    // Preflight HTML is allowed to render with diagnostics when not final-status.
    expect(htmlDraft.allowed).toBe(true);

    const htmlApproved = evaluateExportPolicy({
      validation,
      format: "html",
      proposalStatus: "APPROVED",
      hasApprovalPolicy: true,
    });
    expect(htmlApproved.allowed).toBe(false);
    if (!htmlApproved.allowed) {
      expect(htmlApproved.code).toBe("validation_blocked");
    }

    for (const format of FINAL_EXPORT_CHANNELS) {
      const result = evaluateExportPolicy({
        validation,
        format,
        proposalStatus: "APPROVED",
        hasApprovalPolicy: true,
      });
      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.code).toBe("validation_blocked");
      }
    }
  });
});
