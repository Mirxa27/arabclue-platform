import { describe, expect, test } from "bun:test";
import {
  canonicalizeProposalSnapshot,
  validateStructuredSnapshotEvidence,
} from "../proposal-snapshot-persistence";
import { hydrateProposalSnapshotFromMarkdown } from "../proposal-snapshot-hydration";
import {
  proposalSnapshotServerIdentityFromRecords,
  validateProposalSnapshotServerIdentity,
} from "../proposal-snapshot-identity";

const identity = proposalSnapshotServerIdentityFromRecords({
  project: {
    title: "Digital Services",
    titleAr: "الخدمات الرقمية",
    etimadRef: "ETIMAD-42",
  },
  workspace: { name: "Arabclue Bidder", nameAr: "مقدم العرض" },
  brand: {
    primaryColor: "#173F5F",
    secondaryColor: "#132238",
    accentColor: "#D68C20",
  },
});

describe("proposal Markdown snapshot hydration", () => {
  test("creates a canonical bilingual snapshot only from explicit language inputs", () => {
    const snapshot = hydrateProposalSnapshotFromMarkdown({
      proposalId: "proposal-1",
      proposalVersion: 4,
      expectedSnapshotRevision: 2,
      contentMd: {
        en: `# Digital Services

## Executive summary
**Exact user-authored content** remains exact.

## Technical solution
- Secure platform
- Saudi-hosted deployment

## Delivery methodology
Delivery follows the approved plan.`,
        ar: `# الخدمات الرقمية

## الملخص التنفيذي
يبقى المحتوى العربي الصريح كما أدخله المستخدم.

## الحل الفني
- منصة آمنة
- استضافة سعودية

## منهجية التنفيذ
يتبع التنفيذ الخطة المعتمدة.`,
      },
      sourceUpdatedAt: "2026-07-24T12:00:00.000Z",
      identity,
    });

    expect(snapshot.version).toBe(3);
    expect(snapshot.intent).toBe("BILINGUAL_SUBMISSION");
    expect(snapshot.languageMode).toBe("BILINGUAL");
    expect(snapshot.projectTitle).toEqual(identity.projectTitle);
    expect(snapshot.bidderName).toEqual(identity.bidderName);
    expect(snapshot.sources).toHaveLength(2);
    expect(snapshot.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "USER_ENTRY" }),
      ])
    );
    const renderedText = JSON.stringify(snapshot.modules);
    expect(renderedText).toContain("Exact user-authored content");
    expect(renderedText).toContain("يبقى المحتوى العربي الصريح");
    expect(
      validateProposalSnapshotServerIdentity(snapshot, identity)
    ).toEqual([]);
    expect(validateStructuredSnapshotEvidence(snapshot, [])).toEqual([]);
    expect(
      canonicalizeProposalSnapshot(snapshot, {
        proposalId: "proposal-1",
        expectedRevision: 2,
        presetKey: "bilingual-parallel",
      })
    ).toMatchObject({ ok: true });
  });

  test("keeps missing formal sections visible as NOT_AVAILABLE gaps", () => {
    const snapshot = hydrateProposalSnapshotFromMarkdown({
      proposalId: "proposal-1",
      proposalVersion: 1,
      expectedSnapshotRevision: 0,
      contentMd: {
        en: "## Executive summary\nOnly the supplied summary.",
        ar: "## الملخص التنفيذي\nالملخص المقدم فقط.",
      },
      sourceUpdatedAt: "2026-07-24T12:00:00.000Z",
      identity,
    });
    const requirements = snapshot.modules.find(
      (module) => module.key === "requirements-understanding"
    );
    expect(requirements?.blocks).toEqual([
      expect.objectContaining({
        type: "EVIDENCE_REGISTER",
        entries: [
          expect.objectContaining({ status: "NOT_AVAILABLE" }),
        ],
      }),
    ]);
  });

  test("fails closed for empty, same-language, and wrong-direction drafts", () => {
    const base = {
      proposalId: "proposal-1",
      proposalVersion: 1,
      expectedSnapshotRevision: 0,
      sourceUpdatedAt: "2026-07-24T12:00:00.000Z",
      identity,
    };

    expect(() =>
      hydrateProposalSnapshotFromMarkdown({
        ...base,
        contentMd: { en: "English content", ar: "" },
      })
    ).toThrow("bilingual script validation");
    expect(() =>
      hydrateProposalSnapshotFromMarkdown({
        ...base,
        contentMd: {
          en: "English content with API-2026 and 99.5%.",
          ar: "Another English draft with SKU-42.",
        },
      })
    ).toThrow("bilingual script validation");
    expect(() =>
      hydrateProposalSnapshotFromMarkdown({
        ...base,
        contentMd: {
          en: "هذه مسودة عربية فقط.",
          ar: "وهذه مسودة عربية أخرى.",
        },
      })
    ).toThrow("bilingual script validation");
  });

  test("allows mixed technical terms when each side has its expected strong script", () => {
    expect(() =>
      hydrateProposalSnapshotFromMarkdown({
        proposalId: "proposal-1",
        proposalVersion: 1,
        expectedSnapshotRevision: 0,
        contentMd: {
          en: "English API-2026 integrates منصة رقمية and ISO 27001.",
          ar: "تتكامل المنصة مع API-2026 و ISO 27001 بنسبة 99.9%.",
        },
        sourceUpdatedAt: "2026-07-24T12:00:00.000Z",
        identity,
      })
    ).not.toThrow();
  });
});
