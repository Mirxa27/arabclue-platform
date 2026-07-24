import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dir, "../../..");

async function source(path: string): Promise<string> {
  return Bun.file(resolve(repositoryRoot, path)).text();
}

describe("proposal workflow integrity invariants", () => {
  test("every interactive proposal mutation locks reviewed states and invalidates prior approvals", async () => {
    const mutationRoutes = [
      "src/app/api/proposals/[id]/route.ts",
      "src/app/api/proposals/[id]/financial/route.ts",
      "src/app/api/proposals/[id]/rewrite/route.ts",
      "src/app/api/proposals/[id]/versions/[version]/revert/route.ts",
    ];
    for (const path of mutationRoutes) {
      const text = await source(path);
      expect(text, path).toContain("isProposalEditLocked");
      expect(text, path).toContain("generatedProposal.updateMany");
      expect(text, path).toContain("updatedAt:");
      expect(text, path).toContain("proposalReview.deleteMany");
      expect(text, path).toContain('status: "DRAFT"');
      expect(text, path).toContain("submittedAt: null");
      expect(text, path).toContain("approvedAt: null");
    }
    const financial = await source(
      "src/app/api/proposals/[id]/financial/route.ts"
    );
    const [financialGet, financialPatch] = financial.split(
      "export async function PATCH"
    );
    expect(financialGet).not.toContain("isProposalEditLocked(");
    expect(financialPatch).toContain("isProposalEditLocked(proposal.status)");
  });

  test("snapshot replacement uses revision CAS and invalidates review state", async () => {
    const text = await source(
      "src/app/api/proposals/[id]/snapshot/route.ts"
    );
    expect(text).toContain("isProposalEditLocked");
    expect(text).toContain("structuredSnapshotRevision:");
    expect(text).toContain("expectedRevision");
    expect(text).toContain("expectedStatus");
    expect(text).toContain("proposalReview.deleteMany");
    expect(text).toContain('status: "DRAFT"');
    expect(text).toContain("artifactsJson: null");
  });

  test("submit atomically stores immutable review bindings", async () => {
    const text = await source(
      "src/app/api/proposals/[id]/submit/route.ts"
    );
    expect(text).toContain("proposalReviewBinding");
    expect(text).toContain("generatedProposal.updateMany");
    expect(text).toContain("updatedAt: current.updatedAt");
    expect(text).toContain("proposalReview.createMany");
    expect(text).toContain("...binding");
    expect(text).toContain("STRUCTURED_SNAPSHOT_REQUIRED");
    expect(text).toContain("createContractRenderSnapshot");
    expect(text).toContain("contractRenderSnapshotHash:");
    expect(text).toContain("TransactionIsolationLevel.Serializable");
  });

  test("HTTP and platform-agent decisions share the serializable decision service", async () => {
    const route = await source("src/app/api/reviews/[id]/route.ts");
    const platform = await source("src/lib/agents/platform/tools.ts");
    const service = await source("src/lib/proposal-review-service.ts");
    expect(route).toContain("decideProposalReview");
    expect(platform).toContain("decideProposalReview");
    expect(service).toContain("TransactionIsolationLevel.Serializable");
    expect(service).toContain("proposalMatchesReviewBinding");
    expect(service).toContain("validateStructuredSnapshotEvidence");
    expect(service).toContain("validatePersistedContractRenderSnapshot");
    expect(service).toContain("proposalReview.updateMany");
    expect(service).toContain("generatedProposal.updateMany");
  });

  test("agent regeneration cannot overwrite a reviewed proposal", async () => {
    const text = await source("src/lib/agents/orchestrator.ts");
    expect(text).toContain("isProposalEditLocked(existing.status)");
    expect(text).toContain("status: existing.status");
    expect(text).toContain("version: existing.version");
    expect(text).toContain("updatedAt: existing.updatedAt");
    expect(text).toContain("proposalReview.deleteMany");
  });

  test("contract obligation mutations lock review and invalidate frozen render state atomically", async () => {
    const text = await source(
      "src/app/api/proposals/[id]/obligations/route.ts"
    );
    expect(text).toContain("isProposalEditLocked");
    expect(text).toContain("generatedProposal.updateMany");
    expect(text).toContain("CONTRACT_RENDER_SNAPSHOT_INVALIDATION");
    expect(text).toContain("proposalReview.deleteMany");
  });

  test("export transition is authoritative-only and compare-and-set bound to its snapshot", async () => {
    const text = await source(
      "src/app/api/proposals/[id]/download/route.ts"
    );
    expect(text).toContain("shouldMarkProposalExported");
    expect(text).toContain("generatedProposal.updateMany");
    expect(text).toContain('status: "APPROVED"');
    expect(text).toContain("structuredSnapshotHash:");
    expect(text).toContain("contractRenderSnapshotHash:");
    expect(text).toContain("EXPORT_STATE_CHANGED");
  });

  test("generic contract approval never represents itself as legal sign-off", async () => {
    const panel = await source(
      "src/components/dashboard/contracts-panel.tsx"
    );
    expect(panel).toContain("Submit for approval");
    expect(panel).toContain("configured approval workflow");
    expect(panel).toContain("Counsel review remains required before signature");
    expect(panel).not.toContain("Submit for legal review");
    expect(panel).not.toContain("Contract sent for legal review");
    expect(panel).not.toContain("Complete legal review");

    const download = await source(
      "src/app/api/proposals/[id]/download/route.ts"
    );
    expect(download).toContain('"X-Contract-Legal-Review-Status": "UNREVIEWED"');
    expect(download).toContain('"X-Contract-Counsel-Review-Required": "true"');
    expect(download).toContain('"X-Contract-Executable": "false"');
    expect(download).toContain("CONTRACT_EXPORT_SAFETY");
  });
});
