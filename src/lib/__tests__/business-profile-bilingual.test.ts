import { describe, expect, test } from "bun:test";
import sharp from "sharp";
import {
  BILINGUAL_BUSINESS_PROFILE_DRAFT_POLICY,
  buildBusinessProfileHTML,
  compileBilingualBusinessProfile,
  isCertificateEligibleForBusinessProfile,
  isMethodologyEligibleForBusinessProfile,
  resolveBusinessProfilePdfDocument,
  renderBilingualBusinessProfileHTML,
  type BusinessProfileSnapshot,
} from "../business-profile";
import { CapabilityStatementExportBlockedError } from "../capability-statement";
import { validateBilingualDocument } from "../bilingual-layout";
import {
  certificateKnowledgeContent,
  hashKnowledgeContent,
  methodologyKnowledgeContent,
} from "../knowledge-approval";

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
          clientNameAr: "عميل",
          sector: "Government",
          outcome: "Delivered",
          summary: "Verified project summary.",
          summaryAr: "ملخص مشروع موثق.",
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
    const incomplete = profileFixture();
    incomplete.readiness = {
      readyForProposals: false,
      missing: ["approvalChain"],
      completedCount: 4,
      totalRequired: 5,
      score: 80,
    };
    const strictBlocked = compileBilingualBusinessProfile(incomplete, "strict");
    expect(strictBlocked.status).toBe("blocked");
    expect(strictBlocked.blockingDiagnostics.length).toBeGreaterThan(0);
    expect(() => renderBilingualBusinessProfileHTML(strictBlocked)).toThrow(
      CapabilityStatementExportBlockedError
    );

    const strictReady = compileBilingualBusinessProfile(
      profileFixture(),
      "strict"
    );
    expect(strictReady.status).toBe("exportable");
    expect(strictReady.blockingDiagnostics).toHaveLength(0);

    const draft = compileBilingualBusinessProfile(incomplete, "draft");
    expect(draft.status).toBe("exportable");
    expect(draft.blockingDiagnostics).toHaveLength(0);
    expect(validateBilingualDocument(draft.document).valid).toBe(true);

    const html = renderBilingualBusinessProfileHTML(draft);
    expect(html).toContain('data-bilingual-layout-state="pending"');
    expect(html).toContain("Export Company");
    expect(html).toContain("شركة التصدير");
    expect(html).toContain("User-entered team (not evidence reviewed)");
    expect(html).toContain(
      "User-declared target-sector preferences"
    );
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
    expect(english).toContain(
      "User-entered team · not evidence reviewed"
    );
    expect(english).toContain(
      "User-declared target-sector preferences"
    );
    expect(arabic).toContain(
      "ملف عيّنة تشغيلي من أراب كلاو · ليس استشارة قانونية"
    );
    expect(english).not.toMatch(/KSA data residency|data residency/i);
    expect(arabic).not.toContain("إقامة البيانات");
  });

  test("normalizes persisted CSS payloads and omits remote logos at render time", () => {
    const profile = profileFixture();
    profile.brand = {
      ...profile.brand!,
      logoUrl: "https://attacker.example/tracker.svg",
      primaryColor: `red}</style><script>alert(1)</script>`,
      secondaryColor: "url(https://attacker.example)",
      accentColor: "#38BDF8",
    };

    const html = buildBusinessProfileHTML(profile, {
      locale: "en",
      forPrint: true,
    });

    expect(html).not.toContain("attacker.example");
    expect(html).not.toContain("<script");
    expect(html).toContain("--p:#1E3A8A");
    expect(html).toContain("--s:#0F172A");
  });

  test("inlines a decoded workspace logo before bilingual PDF rendering", async () => {
    const profile = profileFixture();
    profile.workspace.id = "workspace-export-logo-test";
    const bytes = await sharp({
      create: {
        width: 6,
        height: 4,
        channels: 4,
        background: "#0D9488",
      },
    })
      .png()
      .toBuffer();

    profile.brand!.logoUrl =
      "/api/files?path=uploads%2Fworkspace-export-logo-test%2Flogo.png";
    const compilation = compileBilingualBusinessProfile(profile, "draft");
    const document = await resolveBusinessProfilePdfDocument(compilation, {
      inlineLogo: async (_brand, workspaceId) => {
        expect(workspaceId).toBe(profile.workspace.id);
        return {
          inlined: true,
          brand: {
            logoUrl: `data:image/png;base64,${bytes.toString("base64")}`,
          },
        };
      },
    });
    const logo = document.sections
      .flatMap((section) => section.blocks)
      .find((block) => block.type === "image");

    expect(logo?.type).toBe("image");
    if (logo?.type === "image") {
      expect(logo.source.kind).toBe("data");
      if (logo.source.kind === "data") {
        expect(logo.source.uri).toStartWith("data:image/png;base64,");
      }
    }
  });

  test("blocks unresolved public images without workspace asset context", async () => {
    const compilation = compileBilingualBusinessProfile(
      profileFixture(),
      "draft"
    );
    const withoutContext = {
      document: compilation.document,
      diagnostics: compilation.diagnostics,
      blockingDiagnostics: compilation.blockingDiagnostics,
      policy: compilation.policy,
      status: "exportable" as const,
      canExport: true as const,
    };

    await expect(
      resolveBusinessProfilePdfDocument(withoutContext)
    ).rejects.toThrow("asset context");
  });

  test("excludes unapproved, revoked and expired credential evidence", () => {
    const asOf = new Date("2026-07-24T12:00:00.000Z");
    const evidenceChecksum = "a".repeat(64);
    const evidenceReview = {
      evidenceRef: `uploaded-document:doc-1:v1:sha256:${evidenceChecksum}`,
      evidenceDocumentId: "doc-1",
      evidenceVersion: 1,
      evidenceChecksum,
      provenanceJson: JSON.stringify({
        sourceKind: "UPLOADED_DOCUMENT",
        sourceId: "doc-1",
        version: 1,
        checksum: evidenceChecksum,
        originalName: "review-evidence.pdf",
        capturedAt: "2026-07-24T11:00:00.000Z",
      }),
    };
    const certificateContent = {
      certType: "ISO",
      name: "ISO 9001",
      number: null,
      issuer: "ISO",
      issuedAt: null,
      expiresAt: null,
      filePath: null,
      notes: null,
    };
    const approvedCertificate = {
      ...certificateContent,
      id: "certificate-1",
      workspaceId: "workspace-1",
      alertDays: 30,
      approved: true,
      reviewStatus: "APPROVED",
      ...evidenceReview,
      reviewedById: "reviewer-1",
      approvedAt: asOf,
      revokedAt: null,
      contentHash: hashKnowledgeContent(
        certificateKnowledgeContent(certificateContent)
      ),
      createdAt: asOf,
      updatedAt: asOf,
    } as Parameters<typeof isCertificateEligibleForBusinessProfile>[0];
    expect(
      isCertificateEligibleForBusinessProfile(approvedCertificate, asOf)
    ).toBe(true);
    expect(
      isCertificateEligibleForBusinessProfile(
        { ...approvedCertificate, approved: false },
        asOf
      )
    ).toBe(false);
    expect(
      isCertificateEligibleForBusinessProfile(
        {
          ...approvedCertificate,
          revokedAt: new Date("2026-07-01T00:00:00.000Z"),
        },
        asOf
      )
    ).toBe(false);
    expect(
      isCertificateEligibleForBusinessProfile(
        {
          ...approvedCertificate,
          expiresAt: new Date("2026-07-23T23:59:59.000Z"),
        },
        asOf
      )
    ).toBe(false);
    const methodologyContent = {
      category: "QC",
      title: "Reviewed quality method",
      titleAr: null,
      bodyMd: "Reviewed method body",
    };
    const approvedMethodology = {
      ...methodologyContent,
      id: "methodology-1",
      workspaceId: "workspace-1",
      approved: true,
      reviewStatus: "APPROVED",
      ...evidenceReview,
      reviewedById: "reviewer-1",
      approvedAt: asOf,
      revokedAt: null,
      contentHash: hashKnowledgeContent(
        methodologyKnowledgeContent(methodologyContent)
      ),
      createdAt: asOf,
      updatedAt: asOf,
    } as Parameters<typeof isMethodologyEligibleForBusinessProfile>[0];
    expect(
      isMethodologyEligibleForBusinessProfile(approvedMethodology)
    ).toBe(true);
    expect(
      isMethodologyEligibleForBusinessProfile({
        ...approvedMethodology,
        reviewStatus: "UNREVIEWED",
      })
    ).toBe(false);
  });
});
