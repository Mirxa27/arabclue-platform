import { describe, expect, test } from "bun:test";
import type { BusinessProfileSnapshot } from "../business-profile";
import {
  CapabilityStatementExportBlockedError,
  TRANSLATION_UNAVAILABLE,
  assertCapabilityStatementExportable,
  buildCapabilityStatement,
  type CapabilityStatementExportPolicy,
} from "../capability-statement";
import {
  renderBilingualHTML,
  validateBilingualDocument,
} from "../bilingual-layout";

const ALLOW_ALL_DIAGNOSTICS = {
  missingTranslation: "allow",
  missingSource: "allow",
  unsafeText: "allow",
  unsafeAsset: "allow",
  invalidValue: "allow",
  profileReadiness: "allow",
} as const satisfies CapabilityStatementExportPolicy;

function profileFixture(): BusinessProfileSnapshot {
  return {
    workspace: {
      id: "workspace-capability-001",
      name: "ArabClue Procurement",
      nameAr: "أراب كلاو للمشتريات",
      slug: "arabclue-procurement",
      plan: "ENTERPRISE",
      crNumber: "CR-2026-س١٢",
      vatNumber: "VAT-3100000000",
    },
    brand: {
      logoUrl: "/documents/arabclue-logo.png",
      primaryColor: "#0D9488",
      secondaryColor: "#0F172A",
      accentColor: "#38BDF8",
      tagline: "Procurement intelligence for Saudi teams",
      taglineAr: "ذكاء المشتريات للفرق السعودية",
      vision2030Alignment:
        "Supports transparent, digitally enabled procurement.",
    },
    readiness: {
      readyForProposals: true,
      missing: [],
      completedCount: 5,
      totalRequired: 5,
      score: 100,
    },
    stats: {
      pastProjects: 1,
      staff: 1,
      certificates: 1,
      partnerships: 1,
      sectors: 1,
      methodologies: 1,
    },
    highlights: {
      pastProjects: [
        {
          title: "National procurement transformation",
          titleAr: "تحول المشتريات الوطنية",
          clientName: "Public Sector Client",
          sector: "Government",
          outcome: "Cycle time reduced",
          summary:
            "Delivered a governed procurement operating model and evidence library.",
        },
      ],
      staff: [
        {
          name: "Aisha Al Saud",
          nameAr: "عائشة آل سعود",
          title: "Procurement Director",
          titleAr: "مديرة المشتريات",
        },
      ],
      certificates: [
        {
          name: "ISO 9001",
          nameAr: "آيزو 9001",
          issuer: "ISO",
        },
      ],
      partnerships: [
        {
          name: "Delivery Partner",
          nameAr: "شريك التسليم",
          kind: "Technology",
        },
      ],
      sectors: [{ name: "Government", nameAr: "القطاع الحكومي" }],
      methodologies: [
        {
          title: "Evidence-led proposal method",
          titleAr: "منهجية العروض القائمة على الأدلة",
        },
      ],
    },
    generatedAt: "2026-07-24T08:30:00.000Z",
  };
}

function allowIncomplete(profile: BusinessProfileSnapshot) {
  return buildCapabilityStatement(profile, {
    exportPolicy: ALLOW_ALL_DIAGNOSTICS,
  });
}

describe("capability statement AST adapter", () => {
  test("builds every required Phase 6 section as a valid parallel document", () => {
    const profile = profileFixture();
    const before = structuredClone(profile);
    const result = allowIncomplete(profile);

    expect(result.status).toBe("exportable");
    expect(result.canExport).toBe(true);
    expect(result.document.layout?.mode).toBe("parallel");
    expect(result.document.layout?.columnRatio).toEqual([50, 50]);
    expect(result.document.sections.map((section) => section.id)).toEqual([
      "cover-company-identity",
      "verified-statistics",
      "projects",
      "team",
      "certificates",
      "partnerships",
      "target-sectors",
      "methodologies",
      "readiness-evidence",
    ]);
    expect(validateBilingualDocument(result.document)).toEqual({
      valid: true,
      issues: [],
    });
    expect(Object.isFrozen(result.document)).toBe(true);
    expect(Object.isFrozen(result.document.sections)).toBe(true);
    expect(Object.isFrozen(result.diagnostics)).toBe(true);
    expect(profile).toEqual(before);

    const blockTypes = new Set(
      result.document.sections.flatMap((section) =>
        section.blocks.map((block) => block.type)
      )
    );
    expect(blockTypes).toEqual(
      new Set(["image", "table", "list", "heading", "paragraph"])
    );
    expect(JSON.stringify(result.document)).not.toContain('"type":"html"');
  });

  test("never represents unreviewed staff or partnerships as verified claims", () => {
    const profile = profileFixture();
    const strict = allowIncomplete(profile);
    const strictHtml = renderBilingualHTML(strict.document);

    expect(strictHtml).not.toContain("Aisha Al Saud");
    expect(strictHtml).not.toContain("Delivery Partner");
    expect(strictHtml).toContain(
      "Workspace entries were omitted because this record type does not yet have an evidence-review model."
    );
    expect(strictHtml).toContain("Evidence-reviewed profile statistics");
    expect(strictHtml).not.toContain(">Team members<");
    expect(strictHtml).not.toContain(">Partnerships<");
    expect(strict.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "UNREVIEWED_SOURCE_OMITTED",
        path: "highlights.staff",
        sourceKind: "staff",
      })
    );
    expect(strict.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "UNREVIEWED_SOURCE_OMITTED",
        path: "highlights.partnerships",
        sourceKind: "partnerships",
      })
    );

    const draft = buildCapabilityStatement(profile, {
      exportPolicy: ALLOW_ALL_DIAGNOSTICS,
      includeUnreviewedWorkspaceEntries: true,
    });
    const draftHtml = renderBilingualHTML(draft.document);
    expect(draftHtml).toContain("Aisha Al Saud");
    expect(draftHtml).toContain("Delivery Partner");
    expect(draftHtml).toContain(
      "User-entered team (not evidence reviewed)"
    );
    expect(draftHtml).toContain(
      "User-entered partnerships (not evidence reviewed)"
    );
    expect(draftHtml).toContain(
      "User-declared target-sector preferences"
    );
    expect(draft.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "UNREVIEWED_SOURCE_INCLUDED",
        sourceKind: "staff",
        blocking: false,
      })
    );
    expect(draft.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "SELF_DECLARED_PREFERENCE_INCLUDED",
        sourceKind: "target-sectors",
        blocking: false,
      })
    );
  });

  test("never copies English source into a missing Arabic field", () => {
    const profile = profileFixture();
    profile.highlights.pastProjects[0].title =
      "Project Without Arabic Translation";
    profile.highlights.pastProjects[0].titleAr = null;

    const result = buildCapabilityStatement(profile);
    expect(result.status).toBe("blocked");
    expect(result.canExport).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "MISSING_TRANSLATION",
        path: "highlights.pastProjects[0].titleAr",
        missingLanguage: "ar",
        blocking: true,
      })
    );

    const html = renderBilingualHTML(result.document, {
      includeDocumentShell: false,
    });
    expect(
      html.match(/Project Without Arabic Translation/g) ?? []
    ).toHaveLength(1);
    expect(html).toContain(TRANSLATION_UNAVAILABLE.ar);
    expect(html).not.toContain(
      `dir="rtl">Project Without Arabic Translation`
    );
  });

  test("isolates shared identifiers and mixed-direction values", () => {
    const result = allowIncomplete(profileFixture());
    const html = renderBilingualHTML(result.document);

    expect(html).toContain(
      'bilingual-value--mixed bilingual-value--identifier'
    );
    expect(html.match(/>CR-2026-س١٢<\/bdi>/g) ?? []).toHaveLength(2);
    expect(html).toContain('dir="ltr">CR-2026-س١٢</bdi>');
    expect(html).toContain('dir="rtl">CR-2026-س١٢</bdi>');
    expect(html).toContain("bilingual-value--number");
  });

  test("sanitizes unsafe bidi controls, escapes markup, and omits remote logos", () => {
    const profile = profileFixture();
    profile.workspace.name = "Arab\u202Ecod.exe";
    profile.brand!.logoUrl = "https://attacker.example/tracker.svg";
    profile.highlights.pastProjects[0].summary =
      `<script>alert("not markup")</script>`;

    const result = allowIncomplete(profile);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "UNSAFE_BIDI_CONTROL_REMOVED",
        path: "workspace.name",
        removedControlCount: 1,
      })
    );
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "UNSAFE_ASSET_OMITTED",
        path: "brand.logoUrl",
        assetKind: "logo",
      })
    );
    expect(validateBilingualDocument(result.document).valid).toBe(true);

    const html = renderBilingualHTML(result.document);
    expect(html).not.toContain("\u202E");
    expect(html).not.toContain("attacker.example");
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;alert");
  });

  test("keeps complete empty-state sections and reports absent collections", () => {
    const profile = profileFixture();
    profile.highlights = {
      pastProjects: [],
      staff: [],
      certificates: [],
      partnerships: [],
      sectors: [],
      methodologies: [],
    };
    profile.stats = {
      pastProjects: 0,
      staff: 0,
      certificates: 0,
      partnerships: 0,
      sectors: 0,
      methodologies: 0,
    };

    const result = buildCapabilityStatement(profile);
    const missingCollections = result.diagnostics.filter(
      (diagnostic) =>
        diagnostic.code === "MISSING_SOURCE" &&
        diagnostic.sourceKind === "collection"
    );
    expect(missingCollections).toHaveLength(6);
    expect(result.document.sections).toHaveLength(9);

    const html = renderBilingualHTML(result.document);
    expect(html).toContain(
      "No source records are available for this section."
    );
    expect(html).toContain("لا تتوفر سجلات مصدرية لهذا القسم.");
  });

  test("exposes a configurable final-export gate and narrowing assertion", () => {
    const strict = buildCapabilityStatement(profileFixture());
    expect(strict.status).toBe("blocked");
    expect(strict.blockingDiagnostics.length).toBeGreaterThan(0);
    expect(() => assertCapabilityStatementExportable(strict)).toThrow(
      CapabilityStatementExportBlockedError
    );

    const permissive = allowIncomplete(profileFixture());
    expect(permissive.status).toBe("exportable");
    expect(permissive.blockingDiagnostics).toHaveLength(0);
    expect(
      permissive.diagnostics.every(
        (diagnostic) =>
          diagnostic.severity === "warning" && !diagnostic.blocking
      )
    ).toBe(true);
    expect(() => assertCapabilityStatementExportable(permissive)).not.toThrow();
  });

  test("reports invalid numeric and date evidence without producing invalid AST", () => {
    const profile = profileFixture();
    profile.stats.staff = Number.NaN;
    profile.readiness.completedCount = 7;
    profile.readiness.totalRequired = 5;
    profile.readiness.score = 101;
    profile.generatedAt = "not-a-date";

    const result = allowIncomplete(profile);
    const invalidKinds = result.diagnostics
      .filter((diagnostic) => diagnostic.code === "INVALID_SOURCE_VALUE")
      .map((diagnostic) => diagnostic.valueKind);
    expect(invalidKinds).toContain("count");
    expect(invalidKinds).toContain("percentage");
    expect(invalidKinds).toContain("date");
    expect(validateBilingualDocument(result.document).valid).toBe(true);
    expect(renderBilingualHTML(result.document)).toContain(
      TRANSLATION_UNAVAILABLE.en
    );
  });

  test("maps proposal-readiness gaps into evidence notes and diagnostics", () => {
    const profile = profileFixture();
    profile.readiness = {
      readyForProposals: false,
      missing: ["certificate-evidence"],
      completedCount: 4,
      totalRequired: 5,
      score: 80,
    };

    const result = allowIncomplete(profile);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "PROFILE_NOT_READY",
        path: "readiness.readyForProposals",
        missingRequirementCount: 1,
      })
    );
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "MISSING_TRANSLATION",
        path: "readiness.missing[0]Ar",
        missingLanguage: "ar",
      })
    );

    const html = renderBilingualHTML(result.document);
    expect(html.match(/certificate-evidence/g) ?? []).toHaveLength(1);
    expect(html).toContain(TRANSLATION_UNAVAILABLE.ar);
    expect(html).toContain("Not ready");
    expect(html).toContain("غير جاهز");
  });

  test("is deterministic for identical snapshots and produces safe IDs", () => {
    const profile = profileFixture();
    profile.workspace.id = "مساحة عمل / capability 01";

    const first = allowIncomplete(structuredClone(profile));
    const second = allowIncomplete(structuredClone(profile));

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.document.id).toMatch(
      /^capability-[A-Za-z0-9._:-]+-[a-f0-9]{8}$/
    );
    expect(first.document.id.length).toBeLessThanOrEqual(128);
  });
});

describe("large capability statement performance", () => {
  test("builds and renders a large multi-section fixture within budget", () => {
    const profile = profileFixture();
    const itemCount = 160;

    profile.highlights.pastProjects = Array.from(
      { length: itemCount },
      (_, index) => ({
        title: `Procurement transformation ${index}`,
        titleAr: `تحول المشتريات ${index}`,
        clientName: `Client ${index}`,
        sector: `Sector ${index % 12}`,
        outcome: `Outcome ${index}`,
        summary:
          `Evidence-backed delivery summary ${index}. `.repeat(4).trim(),
      })
    );
    profile.highlights.staff = Array.from(
      { length: itemCount },
      (_, index) => ({
        name: `Team Member ${index}`,
        nameAr: `عضو الفريق ${index}`,
        title: `Specialist ${index}`,
        titleAr: `أخصائي ${index}`,
      })
    );
    profile.highlights.certificates = Array.from(
      { length: itemCount },
      (_, index) => ({
        name: `Certificate ${index}`,
        nameAr: `شهادة ${index}`,
        issuer: `Issuer ${index}`,
      })
    );
    profile.highlights.partnerships = Array.from(
      { length: itemCount },
      (_, index) => ({
        name: `Partner ${index}`,
        nameAr: `شريك ${index}`,
        kind: `Type ${index % 5}`,
      })
    );
    profile.highlights.sectors = Array.from(
      { length: itemCount },
      (_, index) => ({
        name: `Target Sector ${index}`,
        nameAr: `القطاع المستهدف ${index}`,
      })
    );
    profile.highlights.methodologies = Array.from(
      { length: itemCount },
      (_, index) => ({
        title: `Methodology ${index}`,
        titleAr: `المنهجية ${index}`,
      })
    );
    profile.stats = {
      pastProjects: itemCount,
      staff: itemCount,
      certificates: itemCount,
      partnerships: itemCount,
      sectors: itemCount,
      methodologies: itemCount,
    };

    const startedAt = performance.now();
    const result = allowIncomplete(profile);
    const html = renderBilingualHTML(result.document);
    const elapsedMs = performance.now() - startedAt;

    expect(result.status).toBe("exportable");
    expect(validateBilingualDocument(result.document).valid).toBe(true);
    expect(result.diagnostics.length).toBeGreaterThan(itemCount);
    expect(html.length).toBeGreaterThan(500_000);
    expect(elapsedMs).toBeLessThan(2_500);
  });
});
