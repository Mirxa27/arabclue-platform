import { describe, expect, test } from "bun:test";
import {
  handleProposalSnapshotGet,
  handleProposalSnapshotPost,
  handleProposalSnapshotPut,
  type ProposalSnapshotRouteDependencies,
} from "../../app/api/proposals/[id]/snapshot/route";
import { canonicalizeProposalSnapshot } from "../proposal-snapshot-persistence";
import { structuredProposalSnapshotFixture } from "./fixtures/structured-proposal-snapshot";
import type { ProposalSnapshotServerIdentity } from "../proposal-snapshot-identity";

const SERVER_IDENTITY: ProposalSnapshotServerIdentity = {
  projectTitle: {
    en: "Digital services addendum",
    ar: "ملحق الخدمات الرقمية",
  },
  bidderName: {
    en: "Fixture Bidder",
    ar: "مقدم العرض التجريبي",
  },
  tenderReference: "TENDER-2026-001",
  brand: {
    primaryColor: "#173F5F",
    secondaryColor: "#20639B",
    accentColor: "#D68C20",
    backgroundColor: "#FFFFFF",
    textColor: "#132238",
  },
};

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
      projectId: "project-1",
      type: "COMBINED",
      status: overrides.status ?? "DRAFT",
      version: 1,
      contentMd:
        "## Executive summary\nExact persisted proposal content.",
      locale: "en",
      updatedAt: new Date("2026-07-24T12:00:00.000Z"),
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
        input.expectedStatus !== state.proposal.status ||
        input.expectedProposalVersion !== state.proposal.version ||
        input.expectedProposalUpdatedAt.getTime() !==
          state.proposal.updatedAt.getTime() ||
        input.expectedLocale !== state.proposal.locale ||
        input.expectedContentMd !== state.proposal.contentMd
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
    resolveServerIdentity: async () => SERVER_IDENTITY,
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

  test("hydrates persisted editor content into a structured snapshot before submit", async () => {
    const { dependencies, state } = harness({ status: "GENERATED" });
    const response = await handleProposalSnapshotPost(
      new Request(
        "http://localhost/api/proposals/proposal-1/snapshot",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            counterpartMd:
              "## الملخص التنفيذي\nمحتوى العرض العربي الصريح.",
          }),
        }
      ),
      "proposal-1",
      dependencies
    );
    const body = (await response.json()) as {
      metadata: {
        source: string;
        evidenceStatus: string;
        presetKey: string;
      };
      snapshot: {
        languageMode: string;
        sources: Array<{ kind: string }>;
      };
    };

    expect(response.status).toBe(201);
    expect(body.metadata).toMatchObject({
      source: "CURRENT_PROPOSAL_CONTENT",
      evidenceStatus: "USER_ENTERED_UNVERIFIED",
      presetKey: "bilingual-parallel",
    });
    expect(body.snapshot.languageMode).toBe("BILINGUAL");
    expect(body.snapshot.sources).toHaveLength(2);
    expect(state.proposal.status).toBe("DRAFT");
    expect(state.writes).toBe(1);
  });

  test("rejects a same-language counterpart before canonicalization or persistence", async () => {
    const { dependencies, state } = harness({ status: "GENERATED" });
    const response = await handleProposalSnapshotPost(
      new Request("http://localhost/api/proposals/proposal-1/snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          counterpartMd:
            "## Executive summary\nA second English-only proposal draft.",
        }),
      }),
      "proposal-1",
      dependencies
    );
    const body = (await response.json()) as {
      code: string;
      diagnostics: Array<{ code: string; path: string }>;
    };

    expect(response.status).toBe(422);
    expect(body.code).toBe("BILINGUAL_LANGUAGE_DIRECTION_INVALID");
    expect(body.diagnostics).toContainEqual({
      code: "ARABIC_STRONG_SCRIPT_MISSING",
      path: "contentMd.ar",
      message: expect.any(String),
    });
    expect(state.writes).toBe(0);
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

  test("rejects stale hydration when Markdown changes without changing snapshot revision", async () => {
    const { dependencies, state } = harness();
    const replaceSnapshot = dependencies.replaceSnapshot;
    const response = await handleProposalSnapshotPost(
      new Request("http://localhost/api/proposals/proposal-1/snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          counterpartMd: "## الملخص التنفيذي\nالمحتوى العربي.",
        }),
      }),
      "proposal-1",
      {
        ...dependencies,
        replaceSnapshot: async (input) => {
          state.proposal = {
            ...state.proposal,
            contentMd:
              "## Executive summary\nConcurrent newer content.",
            version: state.proposal.version + 1,
            updatedAt: new Date("2026-07-24T12:01:00.000Z"),
          };
          return replaceSnapshot(input);
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

  test("rejects forged project, bidder, tender, and brand identity", async () => {
    const { dependencies, state } = harness();
    const forged = structuredProposalSnapshotFixture("proposal-1", 1);
    const response = await handleProposalSnapshotPut(
      request({
        ...forged,
        projectTitle: { en: "Other tender", ar: "منافسة أخرى" },
        bidderName: { en: "Other bidder", ar: "مقدم آخر" },
        tenderReference: "FAKE-REFERENCE",
        brand: { primaryColor: "#000000" },
      }),
      "proposal-1",
      dependencies
    );

    expect(response.status).toBe(422);
    expect((await response.json()).code).toBe(
      "STRUCTURED_IDENTITY_MISMATCH"
    );
    expect(state.writes).toBe(0);
  });
});

/**
 * Every failure this route returns used to be a single English string, built
 * inline by a local `errorResponse` helper instead of going through the shared
 * bilingual mapper. On an Arabic-locale editor that surfaced English text in an
 * Arabic UI — the one thing an Arabic-first product cannot do.
 *
 * The stable `code` is the client contract and does not move; only the message
 * shape does. The second test is the one that constrains the fix: this route's
 * rejections carry payload the editor reconciles against (the revision that
 * actually won, canonicaliser diagnostics, Zod issues), and routing through the
 * mapper must not cost that.
 */
describe("snapshot failures answer in both languages", () => {
  const ARABIC = /\p{Script=Arabic}/u;
  const LATIN = /\p{Script=Latin}/u;

  test("a rejected writer is told why in Arabic and in English", async () => {
    const { dependencies } = harness({ writer: false });
    const response = await handleProposalSnapshotPut(
      request(structuredProposalSnapshotFixture("proposal-1", 1)),
      "proposal-1",
      dependencies
    );
    const body = (await response.json()) as {
      code: string;
      error: { ar: string; en: string };
    };

    expect(response.status).toBe(403);
    expect(body.code).toBe("FORBIDDEN");
    expect(body.error.ar).toMatch(ARABIC);
    expect(body.error.en).toMatch(LATIN);
  });

  test("a revision conflict keeps its payload alongside both messages", async () => {
    const { dependencies, state } = harness({ revision: 2 });
    const response = await handleProposalSnapshotPut(
      request(structuredProposalSnapshotFixture("proposal-1", 1), 0),
      "proposal-1",
      dependencies
    );
    const body = (await response.json()) as {
      code: string;
      error: { ar: string; en: string };
      currentRevision: number;
    };

    expect(response.status).toBe(409);
    expect(body.code).toBe("SNAPSHOT_REVISION_CONFLICT");
    expect(body.error.ar).toMatch(ARABIC);
    expect(body.error.en).toMatch(LATIN);
    // The editor needs the winning revision to reconcile; a bilingual message
    // that dropped it would trade one defect for a worse one.
    expect(body.currentRevision).toBe(2);
    expect(state.writes).toBe(0);
  });

  test("a language rejection keeps its diagnostics", async () => {
    const { dependencies, state } = harness({ status: "GENERATED" });
    const response = await handleProposalSnapshotPost(
      new Request("http://localhost/api/proposals/proposal-1/snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          counterpartMd:
            "## Executive summary\nA second English-only proposal draft.",
        }),
      }),
      "proposal-1",
      dependencies
    );
    const body = (await response.json()) as {
      code: string;
      error: { ar: string; en: string };
      diagnostics: Array<{ code: string; path: string }>;
    };

    expect(response.status).toBe(422);
    expect(body.code).toBe("BILINGUAL_LANGUAGE_DIRECTION_INVALID");
    expect(body.error.ar).toMatch(ARABIC);
    expect(body.error.en).toMatch(LATIN);
    // The per-field diagnostics are what tells the writer *which* draft is
    // wrong. A bilingual headline that dropped them would be a worse editor.
    expect(body.diagnostics).toContainEqual({
      code: "ARABIC_STRONG_SCRIPT_MISSING",
      path: "contentMd.ar",
      message: expect.any(String),
    });
    expect(state.writes).toBe(0);
  });
});
