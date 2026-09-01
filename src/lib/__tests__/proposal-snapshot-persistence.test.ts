import { describe, expect, test } from "bun:test";
import {
  STRUCTURED_SNAPSHOT_INVALIDATION,
  canonicalizeProposalSnapshot,
  offerableProposalDownloadFormats,
  requiresStructuredSnapshotForAuthoritativeExport,
  selectProposalDownloadEngine,
  type StructuredApprovedEvidenceBinding,
  validateStructuredProposalOutput,
  validateStructuredSnapshotEvidence,
  validatePersistedProposalSnapshot,
} from "../proposal-snapshot-persistence";
import { structuredProposalSnapshotFixture } from "./fixtures/structured-proposal-snapshot";

function approvedBinding(
  id: string,
  overrides: Partial<StructuredApprovedEvidenceBinding> = {}
): StructuredApprovedEvidenceBinding {
  const contentHash = `sha256:${"a".repeat(64)}`;
  return {
    id,
    title: { en: "Approved record", ar: "سجل معتمد" },
    locator: `approved-knowledge:past_project:${id}:${contentHash}`,
    asOf: "2026-07-24T12:00:00.000Z",
    knowledgeBinding: {
      recordType: "PAST_PROJECT",
      contentHash,
      evidenceRef: `uploaded-document:doc-1:v3:sha256:${"b".repeat(64)}`,
      reviewStatus: "APPROVED",
      reviewedById: "reviewer-1",
      approvedAt: "2026-07-24T12:00:00.000Z",
      provenance: {
        sourceKind: "UPLOADED_DOCUMENT",
        sourceId: "doc-1",
        version: 3,
        checksum: "b".repeat(64),
        originalName: "evidence.pdf",
        capturedAt: "2026-07-24T12:00:00.000Z",
      },
    },
    ...overrides,
  };
}

function snapshotWithApprovedSource(
  binding: StructuredApprovedEvidenceBinding
) {
  const snapshot = structuredProposalSnapshotFixture("proposal-1", 1);
  const sourceId = snapshot.sources[0].id;
  return {
    ...snapshot,
    sources: snapshot.sources.map((source) =>
      source.id === sourceId
        ? {
            id: binding.id,
            kind: "APPROVED_KNOWLEDGE" as const,
            title: binding.title,
            locator: binding.locator,
            asOf: binding.asOf,
            knowledgeBinding: binding.knowledgeBinding,
          }
        : source
    ),
    modules: snapshot.modules.map((module, moduleIndex) =>
      moduleIndex === 0
        ? {
            ...module,
            blocks: module.blocks.map((block, blockIndex) =>
              blockIndex === 0
                ? {
                    ...block,
                    sourceRefs: [binding.id],
                  }
                : block
            ),
          }
        : module
    ),
  };
}

describe("structured proposal snapshot persistence", () => {
  test("validates one explicit bilingual snapshot across HTML, PDF, and PPTX", () => {
    const snapshot = structuredProposalSnapshotFixture("proposal-1", 1);
    const result = canonicalizeProposalSnapshot(snapshot, {
      proposalId: "proposal-1",
      expectedRevision: 0,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected a valid canonical snapshot");
    expect(result.value.hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result.value.revision).toBe(1);
    expect(result.value.presetKey).toBe("compact-addendum");
    expect(JSON.parse(result.value.canonicalJson)).toEqual(snapshot);
  });

  test("does not synthesize a missing translation or accept unknown fields", () => {
    const missingArabic = structuredProposalSnapshotFixture(
      "proposal-1",
      1
    ) as unknown as {
      projectTitle: { en: string; ar?: string };
    };
    delete missingArabic.projectTitle.ar;
    const result = canonicalizeProposalSnapshot(missingArabic, {
      proposalId: "proposal-1",
      expectedRevision: 0,
    });

    expect(result).toMatchObject({
      ok: false,
      code: "INVALID_SNAPSHOT_SHAPE",
    });

    const withUnknown = {
      ...structuredProposalSnapshotFixture("proposal-1", 1),
      synthesizedClaim: "not accepted",
    };
    expect(
      canonicalizeProposalSnapshot(withUnknown, {
        proposalId: "proposal-1",
        expectedRevision: 0,
      })
    ).toMatchObject({ ok: false, code: "INVALID_SNAPSHOT_SHAPE" });
  });

  test("binds snapshot identity and version to the target revision", () => {
    expect(
      canonicalizeProposalSnapshot(
        structuredProposalSnapshotFixture("wrong-proposal", 1),
        { proposalId: "proposal-1", expectedRevision: 0 }
      )
    ).toMatchObject({ ok: false, code: "INVALID_SNAPSHOT_IDENTITY" });

    expect(
      canonicalizeProposalSnapshot(
        structuredProposalSnapshotFixture("proposal-1", 4),
        { proposalId: "proposal-1", expectedRevision: 1 }
      )
    ).toMatchObject({ ok: false, code: "INVALID_SNAPSHOT_REVISION" });
  });

  test("fails closed when persisted content and canonical metadata diverge", () => {
    const snapshot = structuredProposalSnapshotFixture("proposal-1", 1);
    const canonical = canonicalizeProposalSnapshot(snapshot, {
      proposalId: "proposal-1",
      expectedRevision: 0,
    });
    if (!canonical.ok) throw new Error("Expected a valid canonical snapshot");

    const valid = validatePersistedProposalSnapshot(snapshot, {
      proposalId: "proposal-1",
      hash: canonical.value.hash,
      revision: 1,
      presetKey: "compact-addendum",
    });
    expect(valid.ok).toBe(true);

    expect(
      validatePersistedProposalSnapshot(snapshot, {
        proposalId: "proposal-1",
        hash: `sha256:${"0".repeat(64)}`,
        revision: 1,
        presetKey: "compact-addendum",
      })
    ).toMatchObject({
      ok: false,
      code: "PERSISTED_SNAPSHOT_METADATA_MISMATCH",
    });
  });

  test("selects legacy only when no structured snapshot exists", () => {
    expect(selectProposalDownloadEngine(false, "pdf")).toEqual({
      kind: "LEGACY",
    });
    expect(selectProposalDownloadEngine(true, "html")).toEqual({
      kind: "STRUCTURED",
      channel: "HTML",
    });
    expect(selectProposalDownloadEngine(true, "pdf")).toEqual({
      kind: "STRUCTURED",
      channel: "PDF",
    });
    expect(selectProposalDownloadEngine(true, "pptx")).toEqual({
      kind: "STRUCTURED",
      channel: "PPTX",
    });
    expect(selectProposalDownloadEngine(true, "xlsx")).toEqual({
      kind: "STRUCTURED",
      channel: "XLSX",
    });
    expect(selectProposalDownloadEngine(true, "zip")).toEqual({
      kind: "STRUCTURED_SUPPLEMENTAL",
    });
    expect(selectProposalDownloadEngine(true, "xlsx-matrix")).toEqual({
      kind: "STRUCTURED_SUPPLEMENTAL",
    });
  });

  describe("offerableProposalDownloadFormats", () => {
    // The editor used to decide whether to show its Word button from the
    // proposal's *status* (`!== APPROVED && !== EXPORTED`). But the download
    // route refuses docx whenever a structured snapshot exists, and a DRAFT
    // gets a snapshot as soon as one is generated — so the button was offered
    // on proposals the route answers with a 409. Deriving the list from the
    // same selector the route uses is the only way the two cannot drift.

    test("offers every format before a snapshot exists", () => {
      expect(offerableProposalDownloadFormats(false)).toEqual([
        "zip",
        "pdf",
        "docx",
      ]);
    });

    test("drops Word once a snapshot exists, whatever the status says", () => {
      expect(offerableProposalDownloadFormats(true)).toEqual(["zip", "pdf"]);
    });

    test("never offers a format the download route would refuse", () => {
      // Anti-vacuity: the loop below is worthless if the lists are empty or if
      // no format is actually filtered out in either direction.
      const withSnapshot = offerableProposalDownloadFormats(true);
      const withoutSnapshot = offerableProposalDownloadFormats(false);
      expect(withSnapshot.length).toBeGreaterThan(0);
      expect(withoutSnapshot.length).toBeGreaterThan(withSnapshot.length);

      for (const hasSnapshot of [true, false]) {
        for (const format of offerableProposalDownloadFormats(hasSnapshot)) {
          expect(selectProposalDownloadEngine(hasSnapshot, format).kind).not.toBe(
            "STRUCTURED_FORMAT_UNSUPPORTED"
          );
        }
      }
    });

    test("the returned list cannot be mutated by a caller", () => {
      const formats = offerableProposalDownloadFormats(true);
      expect(() =>
        (formats as string[]).push("docx")
      ).toThrow();
    });
  });

  test("requires immutable structured output after proposal approval", () => {
    expect(
      requiresStructuredSnapshotForAuthoritativeExport({
        proposalType: "COMBINED",
        proposalStatus: "APPROVED",
      })
    ).toBe(true);
    expect(
      requiresStructuredSnapshotForAuthoritativeExport({
        proposalType: "COMBINED",
        proposalStatus: "EXPORTED",
      })
    ).toBe(true);
    expect(
      requiresStructuredSnapshotForAuthoritativeExport({
        proposalType: "COMBINED",
        proposalStatus: "DRAFT",
      })
    ).toBe(false);
    expect(
      requiresStructuredSnapshotForAuthoritativeExport({
        proposalType: "CONTRACT",
        proposalStatus: "APPROVED",
      })
    ).toBe(false);
  });

  test("provides one deterministic invalidation mutation for stale snapshots", () => {
    expect(STRUCTURED_SNAPSHOT_INVALIDATION).toMatchObject({
      structuredSnapshotHash: null,
      structuredSnapshotPreset: null,
      structuredSnapshotUpdatedAt: null,
      structuredSnapshotUpdatedById: null,
      structuredSnapshotRevision: { increment: 1 },
    });
  });

  test("never accepts USER_ENTRY as VERIFIED evidence", () => {
    const snapshot = structuredProposalSnapshotFixture("proposal-1", 1);
    const firstModule = snapshot.modules[0];
    const evidenceSnapshot = {
      ...snapshot,
      modules: [
        {
          ...firstModule,
          requiredBlockKeys: ["verified-evidence"],
          blocks: [
            {
              type: "EVIDENCE_REGISTER" as const,
              key: "verified-evidence",
              title: { en: "Evidence", ar: "الأدلة" },
              sourceRequired: true,
              sourceRefs: [snapshot.sources[0].id],
              entries: [
                {
                  key: "entry-1",
                  label: { en: "Claim", ar: "المطالبة" },
                  status: "VERIFIED" as const,
                  sourceRefs: [snapshot.sources[0].id],
                },
              ],
            },
          ],
        },
        ...snapshot.modules.slice(1),
      ],
    };

    expect(
      validateStructuredSnapshotEvidence(evidenceSnapshot, [])
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "UNVERIFIED_EVIDENCE_STATUS" }),
      ])
    );
  });

  test("never labels user-entered commercial amounts as verified source values", () => {
    const snapshot = structuredProposalSnapshotFixture("proposal-1", 1);
    const firstModule = snapshot.modules[0];
    const userSource = snapshot.sources[0];
    const commercialSnapshot = {
      ...snapshot,
      modules: [
        {
          ...firstModule,
          requiredBlockKeys: ["commercial-values"],
          blocks: [
            {
              type: "COMMERCIAL_HANDOFF" as const,
              key: "commercial-values",
              title: { en: "Commercial values", ar: "القيم التجارية" },
              sourceRequired: true,
              sourceRefs: [userSource.id],
              instruction: {
                en: "Commercial value supplied by the user.",
                ar: "قيمة تجارية أدخلها المستخدم.",
              },
              pricingStatus: "VERIFIED_SOURCE_VALUES" as const,
              entries: [
                {
                  key: "total",
                  description: { en: "Total", ar: "الإجمالي" },
                  amount: "999999999",
                  currency: "SAR",
                  sourceRefs: [userSource.id],
                },
              ],
            },
          ],
        },
        ...snapshot.modules.slice(1),
      ],
    };

    const result = canonicalizeProposalSnapshot(commercialSnapshot, {
      proposalId: "proposal-1",
      expectedRevision: 0,
    });

    expect(result).toMatchObject({
      ok: false,
      code: "INVALID_SNAPSHOT_CONTENT",
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: "UNVERIFIED_COMMERCIAL_VALUES" }),
      ]),
    });
    expect(
      validateStructuredSnapshotEvidence(commercialSnapshot, [])
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "UNVERIFIED_COMMERCIAL_VALUES" }),
      ])
    );
  });

  test("requires an exact immutable binding for approved knowledge", () => {
    const binding = approvedBinding("approved-project-1");
    const snapshot = snapshotWithApprovedSource(binding);
    expect(validateStructuredSnapshotEvidence(snapshot, [binding])).toEqual(
      []
    );

    const falsifiedLocator = {
      ...snapshot,
      sources: snapshot.sources.map((source) =>
        source.id === binding.id
          ? { ...source, locator: "client-authored:false-claim" }
          : source
      ),
    };
    expect(
      validateStructuredSnapshotEvidence(falsifiedLocator, [binding])
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "KNOWLEDGE_BINDING_MISMATCH" }),
      ])
    );
  });

  test("blocks the same id after content-hash or record-type reapproval changes", () => {
    const stored = approvedBinding("approved-project-1");
    const snapshot = snapshotWithApprovedSource(stored);
    const changedHash = approvedBinding(stored.id, {
      knowledgeBinding: {
        ...stored.knowledgeBinding,
        contentHash: `sha256:${"c".repeat(64)}`,
      },
    });
    const changedType = approvedBinding(stored.id, {
      knowledgeBinding: {
        ...stored.knowledgeBinding,
        recordType: "CERTIFICATE",
      },
    });

    for (const current of [changedHash, changedType]) {
      expect(
        validateStructuredSnapshotEvidence(snapshot, [current])
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "KNOWLEDGE_BINDING_MISMATCH" }),
        ])
      );
    }
  });
});

function snapshotWithNarrative(text: string) {
  const snapshot = structuredProposalSnapshotFixture("proposal-1", 1);
  return {
    ...snapshot,
    modules: snapshot.modules.map((module, index) =>
      index === 0
        ? {
            ...module,
            blocks: module.blocks.map((block, blockIndex) =>
              blockIndex === 0 && block.type === "NARRATIVE"
                ? {
                    ...block,
                    body: { ...block.body, en: text },
                  }
                : block
            ),
          }
        : module
    ),
  };
}

describe("structured proposal export safety projection", () => {
  test.each([
    ["recommended unit price: 25,000", "pricing_language"],
    ["TODO replace this paragraph", "unresolved_placeholder"],
    ["The solution complies with TP99.", "invented_nora_id"],
    ["Apply 10% local content preference.", "blanket_local_content_preference"],
  ])("blocks %s through the existing gate", (text, expectedCode) => {
    const report = validateStructuredProposalOutput(
      snapshotWithNarrative(text),
      {
        entities: null,
        complianceRows: [],
      }
    );
    expect(report.blocking).toBe(true);
    expect(report.issues.map((issue) => issue.code)).toContain(expectedCode);
  });

  test("blocks tenant restriction leakage from structured content", () => {
    const report = validateStructuredProposalOutput(
      snapshotWithNarrative("This contains SECRET-TENANT-PHRASE."),
      {
        entities: null,
        complianceRows: [],
        restrictions: ["SECRET-TENANT-PHRASE"],
      }
    );
    expect(report.issues.map((issue) => issue.code)).toContain(
      "restricted_content"
    );
  });

  test("blocks a claimed approved-knowledge id absent from the eligible set", () => {
    const snapshot = structuredProposalSnapshotFixture("proposal-1", 1);
    const claimedId = snapshot.sources[0].id;
    const claimed = {
      ...snapshot,
      sources: snapshot.sources.map((source) =>
        source.id === claimedId
          ? { ...source, kind: "APPROVED_KNOWLEDGE" as const }
          : source
      ),
    };
    const report = validateStructuredProposalOutput(claimed, {
      entities: null,
      complianceRows: [],
      approvedEvidenceIds: [],
    });
    expect(report.issues.map((issue) => issue.code)).toContain(
      "unapproved_evidence"
    );
  });
});
