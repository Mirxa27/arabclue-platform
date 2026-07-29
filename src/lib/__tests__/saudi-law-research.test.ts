import { describe, expect, test } from "bun:test";
import { researchSaudiLawForContract } from "../saudi-law-research";
import type { IngestionEntities, ComplianceMatrixRow } from "../types";

function makeEntities(
  overrides: Partial<IngestionEntities> = {}
): IngestionEntities {
  return {
    scope: "IT infrastructure development and maintenance services",
    evaluation: { technical: 70, financial: 30 },
    sla: { perWeek: 2, maxPercent: 20 },
    milestones: [{ name: "Design Phase", weeks: 4 }],
    evidence: [],
    ...overrides,
  };
}

function makeComplianceRows(
  overrides: Partial<ComplianceMatrixRow>[] = []
): ComplianceMatrixRow[] {
  return [
    {
      frameworkId: "gtpl",
      controlId: "CTRL-001",
      title: "Local content requirement",
      status: "PARTIAL",
      evidence: "Certificate XYZ",
    },
    ...overrides,
  ];
}

describe("researchSaudiLawForContract", () => {
  test("returns a well-formed brief with jurisdiction SA", () => {
    const brief = researchSaudiLawForContract({
      entities: makeEntities(),
      complianceRows: makeComplianceRows(),
      projectTitle: "Test Project",
    });
    expect(brief.jurisdiction).toBe("SA");
    expect(brief.researchedAt).toBeTruthy();
    expect(brief.disclaimerEn).toBeTruthy();
    expect(brief.disclaimerAr).toBeTruthy();
    expect(brief.updatePostureEn).toBeTruthy();
    expect(brief.updatePostureAr).toBeTruthy();
    expect(brief.sources.length).toBeGreaterThan(0);
    expect(brief.findings.length).toBeGreaterThan(0);
  });

  test("includes governing law finding", () => {
    const brief = researchSaudiLawForContract({
      entities: makeEntities(),
      complianceRows: [],
      projectTitle: "Test",
    });
    const gov = brief.findings.find((f) => f.id === "governing-law");
    expect(gov).toBeDefined();
    expect(gov!.certainty).toBe("REGISTRY_BACKED");
    expect(gov!.legalReviewStatus).toBe("REQUIRED");
    expect(gov!.topicEn).toContain("Governing law");
    expect(gov!.topicAr).toBeTruthy();
  });

  test("includes procurement context finding", () => {
    const brief = researchSaudiLawForContract({
      entities: makeEntities(),
      complianceRows: [],
      projectTitle: "Test",
    });
    const proc = brief.findings.find((f) => f.id === "procurement-context");
    expect(proc).toBeDefined();
    expect(proc!.statementEn).toContain("Government Tenders");
  });

  test("includes PDPL finding", () => {
    const brief = researchSaudiLawForContract({
      entities: makeEntities(),
      complianceRows: [],
      projectTitle: "Test",
    });
    const pdpl = brief.findings.find((f) => f.id === "pdpl");
    expect(pdpl).toBeDefined();
    expect(pdpl!.topicEn).toContain("Personal data protection");
  });

  test("includes SLA tender finding when entities.sla is present", () => {
    const brief = researchSaudiLawForContract({
      entities: makeEntities({ sla: { perWeek: 3, maxPercent: 15 } }),
      complianceRows: [],
      projectTitle: "Test",
    });
    const sla = brief.findings.find((f) => f.id === "sla-tender");
    expect(sla).toBeDefined();
    expect(sla!.certainty).toBe("TENDER_EXPLICIT");
    expect(sla!.statementEn).toContain("3%");
    expect(sla!.statementEn).toContain("15%");
  });

  test("omits SLA tender finding when entities.sla is absent", () => {
    const brief = researchSaudiLawForContract({
      entities: null,
      complianceRows: [],
      projectTitle: "Test",
    });
    const sla = brief.findings.find((f) => f.id === "sla-tender");
    expect(sla).toBeUndefined();
  });

  test("includes compliance open items finding when rows have issues", () => {
    const brief = researchSaudiLawForContract({
      entities: makeEntities(),
      complianceRows: makeComplianceRows(),
      projectTitle: "Test",
    });
    const comp = brief.findings.find((f) => f.id === "compliance-open-items");
    expect(comp).toBeDefined();
    expect(comp!.certainty).toBe("REQUIRES_COUNSEL");
    expect(comp!.statementEn).toContain("1 item");
  });

  test("omits compliance open items when all rows are compliant", () => {
    const rows: ComplianceMatrixRow[] = [
      {
        frameworkId: "gtpl",
        controlId: "CTRL-001",
        title: "All good",
        status: "COMPLIANT",
        evidence: "cert",
      },
    ];
    const brief = researchSaudiLawForContract({
      entities: makeEntities(),
      complianceRows: rows,
      projectTitle: "Test",
    });
    const comp = brief.findings.find((f) => f.id === "compliance-open-items");
    expect(comp).toBeUndefined();
  });

  test("includes update verification finding", () => {
    const brief = researchSaudiLawForContract({
      entities: null,
      complianceRows: [],
      projectTitle: "Test",
    });
    const upd = brief.findings.find((f) => f.id === "update-verification");
    expect(upd).toBeDefined();
    expect(upd!.certainty).toBe("REQUIRES_COUNSEL");
  });

  test("populates tender anchors from entities", () => {
    const brief = researchSaudiLawForContract({
      entities: makeEntities({
        scope: "Custom scope text here",
        milestones: [{ name: "Phase 1", weeks: 2 }],
      }),
      complianceRows: [],
      projectTitle: "Test",
      restrictions: ["No subcontracting", "KSA residency required"],
    });
    expect(brief.tenderAnchors.some((a) => a.startsWith("Scope:"))).toBe(true);
    expect(brief.tenderAnchors.some((a) => a.startsWith("Milestones:"))).toBe(
      true
    );
    expect(brief.tenderAnchors.some((a) => a.startsWith("Restriction:"))).toBe(
      true
    );
  });

  test("limits restrictions to 8 anchors", () => {
    const restrictions = Array.from({ length: 20 }, (_, i) => `R${i}`);
    const brief = researchSaudiLawForContract({
      entities: null,
      complianceRows: [],
      projectTitle: "Test",
      restrictions,
    });
    const restrictionAnchors = brief.tenderAnchors.filter((a) =>
      a.startsWith("Restriction:")
    );
    expect(restrictionAnchors.length).toBe(8);
  });

  test("includes compliance highlights from rows", () => {
    const rows: ComplianceMatrixRow[] = [
      {
        frameworkId: "fw1",
        controlId: "C1",
        title: "Control 1",
        status: "PARTIAL",
        evidence: "e",
        legalReviewStatus: "REQUIRED",
      },
      {
        frameworkId: "fw2",
        controlId: "C2",
        title: "Control 2",
        status: "COMPLIANT",
        evidence: "e",
      },
    ];
    const brief = researchSaudiLawForContract({
      entities: null,
      complianceRows: rows,
      projectTitle: "Test",
    });
    expect(brief.complianceHighlights.length).toBe(2);
    expect(brief.complianceHighlights[0].controlId).toBe("C1");
  });

  test("handles null entities gracefully", () => {
    const brief = researchSaudiLawForContract({
      entities: null,
      complianceRows: [],
      projectTitle: "Test",
    });
    expect(brief.findings.length).toBeGreaterThan(0);
    expect(brief.tenderAnchors.length).toBe(0);
  });

  test("sources come from non-superseded registry entries", () => {
    const brief = researchSaudiLawForContract({
      entities: null,
      complianceRows: [],
      projectTitle: "Test",
    });
    expect(brief.sources.length).toBeGreaterThan(0);
    for (const s of brief.sources) {
      expect(s.id).toBeTruthy();
      expect(s.instrumentEn).toBeTruthy();
      expect(s.authority).toBeTruthy();
    }
  });
});
