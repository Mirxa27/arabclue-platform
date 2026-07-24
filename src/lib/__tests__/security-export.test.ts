import { describe, expect, test } from "bun:test";
import JSZip from "jszip";
import {
  extractSafeZip,
  validateUploadAllowlist,
  ZIP_LIMITS,
} from "../safe-zip";
import {
  filterValidCertificates,
  isCertificateValid,
  isPastProjectEligible,
} from "../knowledge-eligibility";
import {
  buildExportManifest,
  CONTRACT_EXPORT_SAFETY,
  sha256Hex,
  GENERATOR_VERSION,
} from "../export-manifest";
import { validateProposalOutput } from "../validation-gate";

// Re-export slip check via testing isZipSlip behavior through extractSafeZip

describe("safe ZIP extraction", () => {
  test("detects ZIP-slip patterns in entry names", async () => {
    const { isZipSlip } = await import("../safe-zip");
    expect(isZipSlip("../../etc/passwd")).toBe(true);
    expect(isZipSlip("foo/../../../etc/passwd")).toBe(true);
    expect(isZipSlip("/etc/passwd")).toBe(true);
    expect(isZipSlip("C:\\Windows\\system32")).toBe(true);
    expect(isZipSlip("tenders/rfp.pdf")).toBe(false);
  });

  test("blocks absolute-path entries from archives", async () => {
    const zip = new JSZip();
    zip.file("/tmp/evil.pdf", "%PDF-1.4 evil");
    zip.file("ok.pdf", "%PDF-1.4 safe");
    const bytes = Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
    const result = await extractSafeZip(bytes);
    expect(result.skipped.some((s) => s.reason === "zip_slip")).toBe(true);
    expect(result.entries.every((e) => !e.name.includes("/") && !e.name.startsWith(".."))).toBe(
      true
    );
    expect(result.entries.some((e) => e.name === "ok.pdf")).toBe(true);
  });

  test("rejects disallowed extensions inside archive", async () => {
    const zip = new JSZip();
    zip.file("malware.exe", "MZ");
    const bytes = Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
    const result = await extractSafeZip(bytes);
    expect(result.entries.length).toBe(0);
    expect(result.skipped.some((s) => s.reason === "extension_not_allowed")).toBe(
      true
    );
  });

  test("enforces max entries", async () => {
    const zip = new JSZip();
    for (let i = 0; i < 5; i++) zip.file(`f${i}.txt`, `content ${i}`);
    const bytes = Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
    const result = await extractSafeZip(bytes, { maxEntries: 2 });
    expect(result.entries.length).toBeLessThanOrEqual(2);
    expect(result.skipped.some((s) => s.reason === "max_entries_exceeded")).toBe(
      true
    );
  });

  test("upload allowlist rejects .exe", () => {
    expect(validateUploadAllowlist("payload.exe", "application/octet-stream").ok).toBe(
      false
    );
    expect(validateUploadAllowlist("tender.pdf", "application/pdf").ok).toBe(true);
    expect(validateUploadAllowlist("pack.zip", "application/zip").ok).toBe(true);
  });

  test("ZIP_LIMITS are conservative", () => {
    expect(ZIP_LIMITS.maxEntries).toBeLessThanOrEqual(200);
    expect(ZIP_LIMITS.maxCompressionRatio).toBeLessThanOrEqual(100);
  });
});

describe("knowledge eligibility", () => {
  const evidenceChecksum = "a".repeat(64);
  const approvedReview = {
    approved: true,
    reviewStatus: "APPROVED",
    evidenceRef: `uploaded-document:doc-1:v1:sha256:${evidenceChecksum}`,
    evidenceDocumentId: "doc-1",
    evidenceVersion: 1,
    evidenceChecksum,
    provenanceJson: JSON.stringify({
      sourceKind: "UPLOADED_DOCUMENT",
      sourceId: "doc-1",
      version: 1,
      checksum: evidenceChecksum,
      originalName: "evidence.pdf",
      capturedAt: "2026-07-01T00:00:00.000Z",
    }),
    reviewedById: "reviewer-1",
    approvedAt: new Date("2026-07-01T00:00:00Z"),
    contentHash: `sha256:${"b".repeat(64)}`,
    revokedAt: null,
  };

  test("rejects expired and revoked certificates", () => {
    const now = new Date("2026-07-22T00:00:00Z");
    expect(
      isCertificateValid({
        ...approvedReview,
        expiresAt: new Date("2026-01-01"),
        now,
      }).eligible
    ).toBe(false);
    expect(
      isCertificateValid({
        ...approvedReview,
        expiresAt: new Date("2027-01-01"),
        revokedAt: new Date("2026-06-01"),
        now,
      }).eligible
    ).toBe(false);
    expect(
      isCertificateValid({
        ...approvedReview,
        expiresAt: new Date("2027-01-01"),
        now,
      }).eligible
    ).toBe(true);
  });

  test("filters certificate lists", () => {
    const now = new Date("2026-07-22T00:00:00Z");
    const valid = filterValidCertificates(
      [
        { id: "1", expiresAt: new Date("2027-01-01"), ...approvedReview },
        { id: "2", expiresAt: new Date("2025-01-01"), ...approvedReview },
        { id: "3", expiresAt: null, ...approvedReview, approved: false },
      ],
      now
    );
    expect(valid.map((c) => c.id)).toEqual(["1"]);
  });

  test("past projects require approval", () => {
    expect(isPastProjectEligible(approvedReview).eligible).toBe(true);
    expect(
      isPastProjectEligible({ ...approvedReview, approved: false }).eligible
    ).toBe(false);
    expect(
      isPastProjectEligible({ ...approvedReview, revokedAt: new Date() }).eligible
    ).toBe(false);
    expect(
      isPastProjectEligible({
        ...approvedReview,
        reviewStatus: "UNREVIEWED",
      }).eligible
    ).toBe(false);
  });
});

describe("export manifest", () => {
  test("includes content hashes and generator version", () => {
    const validation = validateProposalOutput({
      contentMd: "# Proposal\nSafe content without pricing.",
      financial: {
        cashEquivalents: null,
        accountsReceivable: null,
        currentLiabilities: null,
        quickLiquidityRatio: null,
        qlrPasses: null,
        qlrThreshold: null,
        qlrFormula: null,
        saudizationPercent: null,
        boqItems: [
          { item: "A", unit: "LS", qty: 1, unitPrice: null, total: null },
        ],
        localContentPreferenceApplied: null,
        notes: [],
      },
      entities: null,
      complianceRows: [],
    });
    const artifact = Buffer.from("pdf-bytes");
    const manifest = buildExportManifest({
      project: { id: "p1", title: "Tender", etimadRef: "ETM-1" },
      proposal: {
        id: "prop1",
        version: 2,
        status: "GENERATED",
        locale: "en",
        contentMd: "# Proposal\nSafe content without pricing.",
      },
      validation,
      contractSafety: CONTRACT_EXPORT_SAFETY,
      artifacts: [{ name: "Technical_Proposal.pdf", type: "PDF", bytes: artifact }],
    });
    expect(manifest.generatorVersion).toBe(GENERATOR_VERSION);
    expect(manifest.proposal.contentHash).toBe(
      sha256Hex("# Proposal\nSafe content without pricing.")
    );
    expect(manifest.artifacts[0].contentHash).toBe(sha256Hex(artifact));
    expect(manifest.validation.status).toBe("PASS");
    expect(manifest.humanAuthorityNotice.toLowerCase()).toContain("final author");
    expect(manifest.contractSafety).toEqual({
      legalReviewStatus: "UNREVIEWED",
      counselReviewRequired: true,
      isExecutable: false,
    });
  });
});
