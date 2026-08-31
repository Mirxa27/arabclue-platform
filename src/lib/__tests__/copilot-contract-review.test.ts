/**
 * The contract studio edits a `GeneratedProposal` row with `type: "CONTRACT"`
 * and saves through `/api/proposals/[id]`, so the existing co-pilot route
 * already covers it — but the rail was never mounted there, and the system
 * prompt told the model it was reading a bid document.
 *
 * A bid co-pilot on a contract suggests the wrong things: cite tender
 * evidence, close a requirement gap, align to evaluation criteria. A contract
 * needs the opposite reading — vague obligations, uncapped exposure, missing
 * termination or governing-law terms.
 *
 * The two hard rules (no pricing, regulatory precision) apply to both and must
 * survive the split.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { copilotSystemPrompt } from "../ai/copilot-suggestions";

const REPO_ROOT = join(import.meta.dir, "..", "..", "..");

function read(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), "utf8");
}

describe("copilotSystemPrompt", () => {
  test("a proposal is still reviewed as a bid", () => {
    const prompt = copilotSystemPrompt("en", "proposal");
    expect(prompt).toContain("bid");
    expect(prompt).not.toContain("contract co-pilot");
  });

  test("a contract is reviewed as a contract, not as a bid", () => {
    const prompt = copilotSystemPrompt("en", "contract");
    expect(prompt).toContain("contract");
    // The bid-specific priority must not leak into a contract review.
    expect(prompt).not.toMatch(/requirement gap/);
  });

  test("a contract review is pointed at contract risk", () => {
    const prompt = copilotSystemPrompt("en", "contract");
    expect(prompt).toMatch(/obligation/i);
    expect(prompt).toMatch(/termination|governing law/i);
  });

  test("both hard rules survive in both framings", () => {
    for (const kind of ["proposal", "contract"] as const) {
      const prompt = copilotSystemPrompt("en", kind);
      // Pricing stays off-limits in a contract too: the co-pilot does not get
      // to move money figures in a document a company signs.
      expect(prompt).toContain("HARD RULE");
      expect(prompt).toContain("REGULATORY PRECISION");
      expect(prompt).toMatch(/character-for-character/);
      expect(prompt).toMatch(/Never invent/);
    }
  });

  test("the output language still follows the locale", () => {
    expect(copilotSystemPrompt("ar", "contract")).toContain("in Arabic");
    expect(copilotSystemPrompt("en", "contract")).toContain("in English");
  });
});

describe("the route picks the framing from the stored record", () => {
  const ROUTE = read("src/app/api/proposals/[id]/copilot/route.ts");

  test("it reads the record's type, not a client-supplied kind", () => {
    // A client-chosen framing would let a caller ask for contract review of a
    // bid; the stored row is the only trustworthy source.
    expect(ROUTE).toMatch(/select: \{[^}]*type: true/s);
    expect(ROUTE).toMatch(/=== "CONTRACT"/);
    expect(ROUTE).not.toMatch(/parsed\.data\.docKind/);
  });

  test("the ownership check is still what gates the record", () => {
    // Anti-vacuous: the new select must not have replaced the guard.
    expect(ROUTE).toMatch(/assertWorkspaceMatch\(proposal\.workspaceId/);
    expect(ROUTE).toMatch(/jsonApiFailure\("RESOURCE_NOT_FOUND"\)/);
  });
});

describe("the contract studio has the rail", () => {
  const STUDIO = read("src/components/dashboard/contract-studio.tsx");

  test("the editor mode mounts the co-pilot beside the buffer", () => {
    expect(STUDIO).toMatch(/import \{ CopilotRail \}/);
    expect(STUDIO).toMatch(/<CopilotRail/);
    expect(STUDIO).toMatch(/onApply=\{setDraftMd\}/);
  });

  test("it edits the same buffer the rail reads", () => {
    // Anti-vacuous: rail and editor must be driven by one piece of state, or
    // Accept lands in a document the writer is not looking at.
    expect(STUDIO).toMatch(/onChange=\{setDraftMd\}/);
    expect(STUDIO).toMatch(/markdown=\{draftMd\}[\s\S]*?<CopilotRail[\s\S]*?markdown=\{draftMd\}/);
  });

  test("the rail is not offered where its edits cannot land", () => {
    // No record to save against, or a locked contract: Accept would be a
    // button that does nothing.
    expect(STUDIO).toMatch(/proposalId && !locked && \(\s*<CopilotRail/);
  });
});
