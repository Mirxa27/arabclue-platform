import { describe, expect, test } from "bun:test";
import {
  brandPatchSchema,
  pastProjectCreateSchema,
  pastProjectUpdateSchema,
  validateBrandPatchForWorkspace,
} from "../../app/api/brand/route";

describe("brand PATCH schema", () => {
  test("accepts and canonicalizes only documented brand fields", () => {
    const result = brandPatchSchema.safeParse({
      logoUrl: "/api/files?path=uploads%2Fworkspace-1%2Flogo.png",
      primaryColor: "#0d9488",
      secondaryColor: "#0F172A",
      accentColor: "#38BDF8",
      fontFamily: "IBM Plex Sans Arabic",
      tagline: "Verified delivery",
      taglineAr: "تنفيذ موثق",
      vision2030Alignment: "thriving-economy",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.primaryColor).toBe("#0D9488");
      expect(result.data.fontFamily).toBe("IBM Plex Sans Arabic");
    }
  });

  test("rejects unknown keys, CSS payloads, arbitrary fonts and controls", () => {
    const invalid = [
      { workspaceId: "other-workspace" },
      { primaryColor: `red}</style><script>alert(1)</script>` },
      { secondaryColor: "#fff" },
      { accentColor: "url(https://attacker.example)" },
      { fontFamily: `x';</style><script>alert(1)</script>` },
      { fontFamily: "Comic Sans MS" },
      { tagline: "line one\nline two" },
      { taglineAr: "نص\u0000ضار" },
      { vision2030Alignment: "government-certified" },
    ];

    for (const value of invalid) {
      expect(brandPatchSchema.safeParse(value).success).toBe(false);
    }
  });

  test("requires a real update and maps an explicit empty logo to null", () => {
    expect(brandPatchSchema.safeParse({}).success).toBe(false);
    const result = brandPatchSchema.safeParse({ logoUrl: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.logoUrl).toBeNull();
  });

  test("enforces the tenant logo allow-list after schema parsing", () => {
    const local =
      "/api/files?path=uploads%2Fworkspace-1%2Flogo.png";
    expect(
      validateBrandPatchForWorkspace({ logoUrl: local }, "workspace-1")
        ?.logoUrl
    ).toBe(local);
    expect(
      validateBrandPatchForWorkspace(
        {
          logoUrl:
            "/api/files?path=uploads%2Fworkspace-2%2Flogo.png",
        },
        "workspace-1"
      )
    ).toBeNull();
    expect(
      validateBrandPatchForWorkspace(
        { logoUrl: "https://attacker.example/logo.png" },
        "workspace-1"
      )
    ).toBeNull();
    expect(
      validateBrandPatchForWorkspace(
        { logoUrl: "data:image/png;base64,AAAA" },
        "workspace-1"
      )
    ).toBeNull();
  });
});

describe("past-project claim update schema", () => {
  test("allows evidence approval, reasoned revocation and bounded edits", () => {
    expect(
      pastProjectUpdateSchema.safeParse({
        id: "project-1",
        approved: false,
        reason: "The source document was withdrawn",
      }).success
    ).toBe(true);
    expect(
      pastProjectUpdateSchema.safeParse({
        id: "project-1",
        approved: true,
        provenance: {
          sourceKind: "UPLOADED_DOCUMENT",
          sourceId: "document-1",
        },
      }).success
    ).toBe(true);
    expect(
      pastProjectUpdateSchema.safeParse({
        id: "project-1",
        title: "Updated, pending reverification",
      }).success
    ).toBe(true);
  });

  test("rejects unbound approvals, unexplained revocation and unknown fields", () => {
    const invalid = [
      { id: "project-1", approved: true },
      { id: "project-1", revokedAt: null },
      { id: "project-1", approved: false },
      {
        id: "project-1",
        approved: true,
        provenance: {
          sourceKind: "OFFICIAL_REGISTRY",
          sourceId: "unresolved",
        },
      },
      { id: "project-1", workspaceId: "workspace-2" },
      { id: "project-1" },
    ];

    for (const value of invalid) {
      expect(pastProjectUpdateSchema.safeParse(value).success).toBe(false);
    }
  });

  test("validates bounded past-project creation", () => {
    expect(
      pastProjectCreateSchema.safeParse({
        title: "Reviewed delivery",
        summary: "A factual project summary awaiting evidence review.",
        outcome: "COMPLETED",
      }).success
    ).toBe(true);
    expect(
      pastProjectCreateSchema.safeParse({
        title: "x",
        summary: "y",
        approved: true,
      }).success
    ).toBe(false);
  });
});
