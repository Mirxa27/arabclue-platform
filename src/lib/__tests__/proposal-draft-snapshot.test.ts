import { describe, expect, test } from "bun:test";
import { compileProposalLayout } from "@/lib/proposal-layouts";
import { exportProposalLayout } from "@/lib/proposal-layout-export";
import {
  applyWorkspaceBrandToSnapshot,
  compileDraftProposalSnapshot,
} from "@/lib/proposal-draft-snapshot";

const baseInput = {
  proposalId: "prop-draft-1",
  version: 2,
  contentMd: null as string | null,
  locale: "en" as const,
  projectTitle: "Cloud operations tender",
  projectTitleAr: "مناقصة تشغيل السحابة",
  etimadRef: "ETM-100",
  bidderNameEn: "Riyadh Systems",
  bidderNameAr: "أنظمة الرياض",
  brand: {
    primaryColor: "#123456",
    secondaryColor: "#654321",
    accentColor: "#ABCDEF",
  },
};

describe("compileDraftProposalSnapshot", () => {
  test("compiles a government-formal snapshot with empty diagnostics", () => {
    const snapshot = compileDraftProposalSnapshot(baseInput);
    const compiled = compileProposalLayout(snapshot, { channel: "PDF" });
    expect(compiled.status).toBe("VALID");
    expect(compiled.diagnostics).toEqual([]);
    expect(compiled.presetKey).toBe("government-formal");
  });

  test("never invents approved knowledge", () => {
    const snapshot = compileDraftProposalSnapshot({
      ...baseInput,
      contentMd: "## Technical solution\nUse the uploaded architecture.",
    });
    expect(snapshot.sources.every((s) => s.kind !== "APPROVED_KNOWLEDGE")).toBe(
      true
    );
  });

  test("maps a technical heading into the technical module", () => {
    const snapshot = compileDraftProposalSnapshot({
      ...baseInput,
      contentMd: "## Technical solution\nRedundant dual-region design.",
    });
    const technical = snapshot.modules.find((m) => m.key === "technical-solution");
    const body = technical?.blocks[0];
    expect(body && body.type === "NARRATIVE" ? body.body.en : "").toContain(
      "Redundant dual-region"
    );
  });

  test("designed HTML export succeeds for a draft snapshot", async () => {
    const snapshot = compileDraftProposalSnapshot(baseInput);
    const artifact = await exportProposalLayout(snapshot, {
      channel: "HTML",
      presetKey: "government-formal",
      render: { target: "screen", includeDocumentShell: true },
    });
    expect(artifact.mediaType).toContain("text/html");
    expect(artifact.buffer.length).toBeGreaterThan(200);
    expect(artifact.buffer.toString("utf8")).toContain("Cloud operations");
  });

  test("applyWorkspaceBrandToSnapshot overlays workspace colors", () => {
    const snapshot = compileDraftProposalSnapshot(baseInput);
    const branded = applyWorkspaceBrandToSnapshot(snapshot, {
      primaryColor: "#0A1B2C",
      secondaryColor: "#112233",
      accentColor: "#445566",
    });
    expect(branded.brand.primaryColor).toBe("#0A1B2C");
    expect(branded.brand.secondaryColor).toBe("#112233");
    expect(branded.brand.accentColor).toBe("#445566");
  });
});
