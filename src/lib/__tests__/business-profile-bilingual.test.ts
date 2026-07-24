import { describe, expect, test } from "bun:test";
import {
  BILINGUAL_BUSINESS_PROFILE_DRAFT_POLICY,
  buildBusinessProfileHTML,
  compileBilingualBusinessProfile,
  renderBilingualBusinessProfileHTML,
  type BusinessProfileSnapshot,
} from "../business-profile";
import { CapabilityStatementExportBlockedError } from "../capability-statement";
import { validateBilingualDocument } from "../bilingual-layout";

function profileFixture(): BusinessProfileSnapshot {
  return {
    workspace: {
      id: "workspace-export-001",
      name: "Export Company",
      nameAr: "شركة التصدير",
      slug: "export-company",
      plan: "PRO",
      crNumber: "CR-1001",
      vatNumber: "VAT-2002",
    },
    brand: {
      logoUrl: "/documents/logo.png",
      primaryColor: "#0D9488",
      secondaryColor: "#0F172A",
      accentColor: "#38BDF8",
      tagline: "Verified procurement delivery",
      taglineAr: "تنفيذ موثق للمشتريات",
      vision2030Alignment: "Supports digital procurement workflows.",
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
          title: "Procurement delivery",
          titleAr: "تنفيذ المشتريات",
          clientName: "Client",
          sector: "Government",
          outcome: "Delivered",
          summary: "Verified project summary.",
        },
      ],
      staff: [
        {
          name: "Team Member",
          nameAr: "عضو الفريق",
          title: "Director",
          titleAr: "مدير",
        },
      ],
      certificates: [
        { name: "ISO 9001", nameAr: "آيزو 9001", issuer: "ISO" },
      ],
      partnerships: [
        {
          name: "Technology Partner",
          nameAr: "شريك تقني",
          kind: "Technology",
        },
      ],
      sectors: [{ name: "Government", nameAr: "القطاع الحكومي" }],
      methodologies: [
        { title: "Evidence method", titleAr: "منهجية الأدلة" },
      ],
    },
    generatedAt: "2026-07-24T10:00:00.000Z",
  };
}

describe("business-profile bilingual export library", () => {
  test("uses strict diagnostics for final output and explicit draft opt-in", () => {
    const strict = compileBilingualBusinessProfile(profileFixture(), "strict");
    expect(strict.status).toBe("blocked");
    expect(strict.blockingDiagnostics.length).toBeGreaterThan(0);
    expect(() => renderBilingualBusinessProfileHTML(strict)).toThrow(
      CapabilityStatementExportBlockedError
    );

    const draft = compileBilingualBusinessProfile(profileFixture(), "draft");
    expect(draft.status).toBe("exportable");
    expect(draft.blockingDiagnostics).toHaveLength(0);
    expect(validateBilingualDocument(draft.document).valid).toBe(true);

    const html = renderBilingualBusinessProfileHTML(draft);
    expect(html).toContain('data-bilingual-layout-ready="true"');
    expect(html).toContain("Export Company");
    expect(html).toContain("شركة التصدير");
    expect(html).not.toContain("<script");
  });

  test("keeps the permissive draft policy explicit and immutable", () => {
    expect(BILINGUAL_BUSINESS_PROFILE_DRAFT_POLICY).toEqual({
      missingTranslation: "allow",
      missingSource: "allow",
      unsafeText: "allow",
      unsafeAsset: "allow",
      invalidValue: "allow",
      profileReadiness: "allow",
    });
    expect(Object.isFrozen(BILINGUAL_BUSINESS_PROFILE_DRAFT_POLICY)).toBe(
      true
    );
  });

  test("preserves legacy Arabic and English rendering without residency claims", () => {
    const profile = profileFixture();
    const english = buildBusinessProfileHTML(profile, {
      locale: "en",
      forPrint: true,
    });
    const arabic = buildBusinessProfileHTML(profile, {
      locale: "ar",
      forPrint: true,
    });

    expect(english).toContain("Export Company");
    expect(arabic).toContain("شركة التصدير");
    expect(english).toContain(
      "Operational profile from ArabClue · Not legal advice"
    );
    expect(arabic).toContain(
      "ملف عيّنة تشغيلي من أراب كلاو · ليس استشارة قانونية"
    );
    expect(english).not.toMatch(/KSA data residency|data residency/i);
    expect(arabic).not.toContain("إقامة البيانات");
  });
});
