import { describe, expect, test } from "bun:test";
import { structuredProposalSnapshotFixture } from "./fixtures/structured-proposal-snapshot";
import {
  proposalSnapshotServerIdentityFromRecords,
  validateProposalSnapshotServerIdentity,
} from "../proposal-snapshot-identity";

const identity = proposalSnapshotServerIdentityFromRecords({
  project: {
    title: "Bound project",
    titleAr: "المشروع المرتبط",
    etimadRef: "ETIMAD-1",
  },
  workspace: { name: "Bound bidder", nameAr: "مقدم العرض المرتبط" },
  brand: {
    primaryColor: "#173F5F",
    secondaryColor: "#132238",
    accentColor: "#D68C20",
  },
});

describe("structured proposal server identity", () => {
  test("rejects forged header identity, tenant branding, and privileged source kinds", () => {
    const fixture = structuredProposalSnapshotFixture("proposal-1", 1);
    const forged = {
      ...fixture,
      sources: fixture.sources.map((source, index) =>
        index === 0
          ? {
              ...source,
              kind: "TENDER" as const,
              locator: "client-authored:fake-tender",
            }
          : source
      ),
    };
    const codes = validateProposalSnapshotServerIdentity(
      forged,
      identity
    ).map((diagnostic) => diagnostic.code);

    expect(codes).toContain("PROJECT_IDENTITY_MISMATCH");
    expect(codes).toContain("BIDDER_IDENTITY_MISMATCH");
    expect(codes).toContain("TENDER_IDENTITY_MISMATCH");
    expect(codes).toContain("BRAND_IDENTITY_MISMATCH");
    expect(codes).toContain("UNBOUND_PRIVILEGED_SOURCE");
  });

  test("uses exact server source names as Arabic fallback without translating", () => {
    const fallback = proposalSnapshotServerIdentityFromRecords({
      project: {
        title: "Source Project Name",
        titleAr: null,
        etimadRef: null,
      },
      workspace: { name: "Source Bidder Name", nameAr: null },
      brand: null,
    });
    expect(fallback.projectTitle.ar).toBe("Source Project Name");
    expect(fallback.bidderName.ar).toBe("Source Bidder Name");
  });
});
