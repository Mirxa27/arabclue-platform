import { describe, expect, test } from "bun:test";
import {
  handleProposalSnapshotGet,
  handleProposalSnapshotPut,
  type ProposalSnapshotRouteDependencies,
} from "../../app/api/proposals/[id]/snapshot/route";
import { canonicalizeProposalSnapshot } from "../proposal-snapshot-persistence";
import { structuredProposalSnapshotFixture } from "./fixtures/structured-proposal-snapshot";

type StoredProposal = Awaited<
  ReturnType<ProposalSnapshotRouteDependencies["findProposal"]>
>;

function request(snapshot: unknown, expectedRevision = 0): Request {
  return new Request("http://localhost/api/proposals/proposal-1/snapshot", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ snapshot, expectedRevision }),
  });
}

function harness(overrides: {
  writer?: boolean;
  reader?: boolean;
  workspaceId?: string;
  proposalWorkspaceId?: string;
  revision?: number;
  status?: string;
} = {}): {
  dependencies: ProposalSnapshotRouteDependencies;
  state: {
    proposal: Exclude<StoredProposal, null>;
    writes: number;
    audits: number;
  };
} {
  const state = {
    proposal: {
      id: "proposal-1",
      workspaceId: overrides.proposalWorkspaceId ?? "workspace-1",
      type: "COMBINED",
      status: overrides.status ?? "DRAFT",
      structuredSnapshot: null,
      structuredSnapshotHash: null,
      structuredSnapshotRevision: overrides.revision ?? 0,
      structuredSnapshotPreset: null,
      structuredSnapshotUpdatedAt: null,
      structuredSnapshotUpdatedById: null,
    },
    writes: 0,
    audits: 0,
  };

  const dependencies: ProposalSnapshotRouteDependencies = {
    getWriter: async () =>
      overrides.writer === false ? null : { userId: "writer-1" },
    getReader: async () =>
      overrides.reader === false ? null : { userId: "reader-1" },
    getWorkspace: async () => ({
      id: overrides.workspaceId ?? "workspace-1",
    }),
    findProposal: async () => state.proposal,
    replaceSnapshot: async (input) => {
      if (
        input.expectedRevision !==
          state.proposal.structuredSnapshotRevision ||
        input.workspaceId !== state.proposal.workspaceId ||
        input.expectedStatus !== state.proposal.status
      ) {
        return null;
      }
      state.writes += 1;
      state.proposal = {
        ...state.proposal,
        status: "DRAFT",
        structuredSnapshot: JSON.parse(input.snapshot.canonicalJson),
        structuredSnapshotHash: input.snapshot.hash,
        structuredSnapshotRevision: input.snapshot.revision,
        structuredSnapshotPreset: input.snapshot.presetKey,
        structuredSnapshotUpdatedAt: new Date("2026-07-24T12:00:00.000Z"),
        structuredSnapshotUpdatedById: input.updatedById,
      };
      return state.proposal;
    },
    resolveApprovedEvidence: async () => [],
    recordWrite: async () => {
      state.audits += 1;
    },
  };
  return { dependencies, state };
}

describe("proposal structured snapshot route", () => {
  test("authenticates a writer before reading or persisting the body", async () => {
    const { dependencies, state } = harness({ writer: false });
    const response = await handleProposalSnapshotPut(
      request(structuredProposalSnapshotFixture("proposal-1", 1)),
      "proposal-1",
      dependencies
    );

    expect(response.status).toBe(403);
    expect(state.writes).toBe(0);
  });

  test("does not reveal a proposal from another workspace", async () => {
    const { dependencies, state } = harness({
      proposalWorkspaceId: "workspace-other",
    });
    const response = await handleProposalSnapshotPut(
      request(structuredProposalSnapshotFixture("proposal-1", 1)),
      "proposal-1",
      dependencies
    );

    expect(response.status).toBe(404);
    expect(state.writes).toBe(0);
  });

  test("persists a canonical snapshot with optimistic revision metadata", async () => {
    const { dependencies, state } = harness({ status: "GENERATED" });
    const response = await handleProposalSnapshotPut(
      request(structuredProposalSnapshotFixture("proposal-1", 1)),
      "proposal-1",
      dependencies
    );
    const body = (await response.json()) as {
      metadata: { hash: string; revision: number; lifecycle: string };
    };

    expect(response.status).toBe(200);
    expect(response.headers.get("x-arabclue-proposal-engine")).toBe(
      "structured-v1"
    );
    expect(body.metadata.hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(body.metadata.revision).toBe(1);
    expect(body.metadata.lifecycle).toBe("DRAFT");
    expect(state.writes).toBe(1);
    expect(state.audits).toBe(1);
    expect(state.proposal.status).toBe("DRAFT");
  });

  test("rejects stale writers and never attempts replacement", async () => {
    const { dependencies, state } = harness({ revision: 2 });
    const response = await handleProposalSnapshotPut(
      request(structuredProposalSnapshotFixture("proposal-1", 1), 0),
      "proposal-1",
      dependencies
    );

    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe(
      "SNAPSHOT_REVISION_CONFLICT"
    );
    expect(state.writes).toBe(0);
  });

  test("fails atomically when proposal status changes before replacement", async () => {
    const { dependencies, state } = harness();
    const response = await handleProposalSnapshotPut(
      request(structuredProposalSnapshotFixture("proposal-1", 1)),
      "proposal-1",
      {
        ...dependencies,
        replaceSnapshot: async () => {
          state.proposal = { ...state.proposal, status: "APPROVED" };
          return null;
        },
      }
    );

    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe(
      "SNAPSHOT_REVISION_CONFLICT"
    );
    expect(state.writes).toBe(0);
    expect(state.audits).toBe(0);
  });

  test("rejects content that is not explicitly bilingual", async () => {
    const { dependencies, state } = harness();
    const snapshot = structuredProposalSnapshotFixture(
      "proposal-1",
      1
    ) as unknown as { projectTitle: { en: string; ar?: string } };
    delete snapshot.projectTitle.ar;
    const response = await handleProposalSnapshotPut(
      request(snapshot),
      "proposal-1",
      dependencies
    );

    expect(response.status).toBe(400);
    expect(state.writes).toBe(0);
  });

  test("reads back only a metadata-consistent tenant snapshot", async () => {
    const { dependencies, state } = harness();
    const snapshot = structuredProposalSnapshotFixture("proposal-1", 1);
    const canonical = canonicalizeProposalSnapshot(snapshot, {
      proposalId: "proposal-1",
      expectedRevision: 0,
    });
    if (!canonical.ok) throw new Error("Expected fixture to validate");
    state.proposal = {
      ...state.proposal,
      structuredSnapshot: snapshot,
      structuredSnapshotHash: canonical.value.hash,
      structuredSnapshotRevision: 1,
      structuredSnapshotPreset: canonical.value.presetKey,
      structuredSnapshotUpdatedAt: new Date("2026-07-24T12:00:00.000Z"),
      structuredSnapshotUpdatedById: "writer-1",
    };

    const response = await handleProposalSnapshotGet(
      "proposal-1",
      dependencies
    );
    const body = (await response.json()) as {
      snapshot: { snapshotId: string };
      metadata: { hash: string };
    };
    expect(response.status).toBe(200);
    expect(body.snapshot.snapshotId).toBe("proposal-1");
    expect(body.metadata.hash).toBe(canonical.value.hash);
  });

  test("rejects a fake approved-knowledge source outside the tenant resolver", async () => {
    const { dependencies, state } = harness();
    const snapshot = structuredProposalSnapshotFixture("proposal-1", 1);
    const sourceId = snapshot.sources[0].id;
    const untrusted = {
      ...snapshot,
      sources: snapshot.sources.map((source) =>
        source.id === sourceId
          ? { ...source, kind: "APPROVED_KNOWLEDGE" as const }
          : source
      ),
    };
    const response = await handleProposalSnapshotPut(
      request(untrusted),
      "proposal-1",
      {
        ...dependencies,
        resolveApprovedEvidence: async () => [],
      }
    );

    expect(response.status).toBe(422);
    expect((await response.json()).code).toBe(
      "STRUCTURED_EVIDENCE_NOT_APPROVED"
    );
    expect(state.writes).toBe(0);
  });
});
