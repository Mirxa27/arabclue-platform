import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession, requireWriter } from "@/lib/auth";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { getTenantContext } from "@/lib/workspace-context";
import { isProposalEditLocked } from "@/lib/proposal-status";
import {
  analyticsRequestOrigin,
  recordProposalAnalyticsEvent,
} from "@/lib/analytics-collector";
import {
  MAX_PROPOSAL_SNAPSHOT_BODY_BYTES,
  canonicalizeProposalSnapshot,
  claimedStructuredKnowledgeIds,
  proposalSnapshotWriteSchema,
  validateStructuredSnapshotEvidence,
  validatePersistedProposalSnapshot,
  type CanonicalProposalSnapshot,
  type StructuredApprovedEvidenceBinding,
} from "@/lib/proposal-snapshot-persistence";
import { loadApprovedStructuredEvidenceBindings } from "@/lib/proposal-snapshot-evidence";
import {
  loadProposalSnapshotServerIdentity,
  validateProposalSnapshotServerIdentity,
  type ProposalSnapshotServerIdentity,
} from "@/lib/proposal-snapshot-identity";
import {
  hydrateProposalSnapshotFromMarkdown,
  validateProposalDraftLanguageDirections,
} from "@/lib/proposal-snapshot-hydration";
import { z } from "zod";

export const dynamic = "force-dynamic";

const proposalSnapshotHydrationRequestSchema = z
  .object({
    counterpartMd: z.string().min(1).max(250_000),
  })
  .strict();

interface SnapshotProposalRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly type: string;
  readonly status: string;
  readonly version: number;
  readonly contentMd: string | null;
  readonly locale: string;
  readonly updatedAt: Date;
  readonly structuredSnapshot: unknown;
  readonly structuredSnapshotHash: string | null;
  readonly structuredSnapshotRevision: number;
  readonly structuredSnapshotPreset: string | null;
  readonly structuredSnapshotUpdatedAt: Date | null;
  readonly structuredSnapshotUpdatedById: string | null;
}

export interface ProposalSnapshotRouteDependencies {
  readonly getWriter: () => Promise<{ readonly userId: string } | null>;
  readonly getReader: () => Promise<{ readonly userId: string } | null>;
  readonly getWorkspace: (
    userId: string
  ) => Promise<{ readonly id: string }>;
  readonly findProposal: (
    id: string
  ) => Promise<SnapshotProposalRecord | null>;
  readonly replaceSnapshot: (input: {
    readonly proposalId: string;
    readonly workspaceId: string;
    readonly expectedRevision: number;
    readonly expectedStatus: string;
    readonly expectedProposalVersion: number;
    readonly expectedProposalUpdatedAt: Date;
    readonly expectedLocale: string;
    readonly expectedContentMd: string | null;
    readonly updatedById: string;
    readonly snapshot: CanonicalProposalSnapshot;
  }) => Promise<SnapshotProposalRecord | null>;
  readonly resolveApprovedEvidence: (
    workspaceId: string,
    claimedIds: readonly string[]
  ) => Promise<readonly StructuredApprovedEvidenceBinding[]>;
  readonly resolveServerIdentity: (
    workspaceId: string,
    projectId: string
  ) => Promise<ProposalSnapshotServerIdentity | null>;
  readonly recordWrite: (input: {
    readonly userId: string;
    readonly proposalId: string;
    readonly hash: string;
    readonly revision: number;
    readonly presetKey: string;
  }) => Promise<void>;
}

const defaultDependencies: ProposalSnapshotRouteDependencies = {
  getWriter: async () => {
    const session = await requireWriter();
    return session ? { userId: session.user.id } : null;
  },
  getReader: async () => {
    const session = await requireSession();
    return session ? { userId: session.user.id } : null;
  },
  getWorkspace: async (userId) => {
    const { workspace } = await getTenantContext(userId);
    return { id: workspace.id };
  },
  findProposal: (id) =>
    db.generatedProposal.findUnique({
      where: { id },
      select: {
        id: true,
        workspaceId: true,
        projectId: true,
        type: true,
        status: true,
        version: true,
        contentMd: true,
        locale: true,
        updatedAt: true,
        structuredSnapshot: true,
        structuredSnapshotHash: true,
        structuredSnapshotRevision: true,
        structuredSnapshotPreset: true,
        structuredSnapshotUpdatedAt: true,
        structuredSnapshotUpdatedById: true,
      },
    }),
  replaceSnapshot: async (input) =>
    db.$transaction(async (tx) => {
      const result = await tx.generatedProposal.updateMany({
        where: {
          id: input.proposalId,
          workspaceId: input.workspaceId,
          structuredSnapshotRevision: input.expectedRevision,
          status: input.expectedStatus,
          version: input.expectedProposalVersion,
          updatedAt: input.expectedProposalUpdatedAt,
          locale: input.expectedLocale,
          contentMd: input.expectedContentMd,
        },
        data: {
          structuredSnapshot: JSON.parse(
            input.snapshot.canonicalJson
          ) as Prisma.InputJsonValue,
          structuredSnapshotHash: input.snapshot.hash,
          structuredSnapshotRevision: input.snapshot.revision,
          structuredSnapshotPreset: input.snapshot.presetKey,
          structuredSnapshotUpdatedAt: new Date(),
          structuredSnapshotUpdatedById: input.updatedById,
          status: "DRAFT",
          submittedAt: null,
          approvedAt: null,
          artifactsJson: null,
        },
      });
      if (result.count !== 1) return null;
      await tx.proposalReview.deleteMany({
        where: { proposalId: input.proposalId },
      });
      return tx.generatedProposal.findUnique({
        where: { id: input.proposalId },
        select: {
          id: true,
          workspaceId: true,
          projectId: true,
          type: true,
          status: true,
          version: true,
          contentMd: true,
          locale: true,
          updatedAt: true,
          structuredSnapshot: true,
          structuredSnapshotHash: true,
          structuredSnapshotRevision: true,
          structuredSnapshotPreset: true,
          structuredSnapshotUpdatedAt: true,
          structuredSnapshotUpdatedById: true,
        },
      });
    }),
  resolveApprovedEvidence: loadApprovedStructuredEvidenceBindings,
  resolveServerIdentity: loadProposalSnapshotServerIdentity,
  recordWrite: async (input) => {
    await audit({
      userId: input.userId,
      action: AUDIT_ACTIONS.PROPOSAL_EDIT,
      resource: "GeneratedProposal",
      resourceId: input.proposalId,
      details: {
        structuredSnapshot: true,
        snapshotHash: input.hash,
        snapshotRevision: input.revision,
        presetKey: input.presetKey,
      },
    });

    const proposal = await db.generatedProposal.findUnique({
      where: { id: input.proposalId },
      select: { workspaceId: true, projectId: true },
    });
    if (proposal) {
      await recordProposalAnalyticsEvent({
        eventType: "proposal_edited",
        proposalId: input.proposalId,
        mutationRef: `snapshot:r${input.revision}:${input.hash}`,
        origin: analyticsRequestOrigin({
          tenantWorkspaceId: proposal.workspaceId,
          actorUserId: input.userId,
        }),
        metadata: {
          revision: input.revision,
          projectId: proposal.projectId,
        },
      });
    }
  },
};

function errorResponse(
  error: string,
  code: string,
  status: number,
  details?: Record<string, unknown>
): NextResponse {
  return NextResponse.json(
    { error, code, ...(details ?? {}) },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

async function readJsonBody(req: Request): Promise<
  | Readonly<{ ok: true; value: unknown }>
  | Readonly<{ ok: false; response: NextResponse }>
> {
  const declaredLength = Number(req.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_PROPOSAL_SNAPSHOT_BODY_BYTES
  ) {
    return {
      ok: false,
      response: errorResponse(
        "Structured proposal snapshot exceeds the request budget.",
        "SNAPSHOT_BODY_TOO_LARGE",
        413
      ),
    };
  }

  let text: string;
  try {
    text = await req.text();
  } catch {
    return {
      ok: false,
      response: errorResponse(
        "Unable to read structured proposal snapshot.",
        "INVALID_SNAPSHOT_JSON",
        400
      ),
    };
  }
  if (new TextEncoder().encode(text).byteLength > MAX_PROPOSAL_SNAPSHOT_BODY_BYTES) {
    return {
      ok: false,
      response: errorResponse(
        "Structured proposal snapshot exceeds the request budget.",
        "SNAPSHOT_BODY_TOO_LARGE",
        413
      ),
    };
  }
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return {
      ok: false,
      response: errorResponse(
        "Invalid JSON body.",
        "INVALID_SNAPSHOT_JSON",
        400
      ),
    };
  }
}

export async function handleProposalSnapshotPut(
  req: Request,
  proposalId: string,
  dependencies: ProposalSnapshotRouteDependencies = defaultDependencies
): Promise<NextResponse> {
  const caller = await dependencies.getWriter();
  if (!caller) {
    return errorResponse("Forbidden", "FORBIDDEN", 403);
  }
  const workspace = await dependencies.getWorkspace(caller.userId);
  const existing = await dependencies.findProposal(proposalId);
  if (!existing || existing.workspaceId !== workspace.id) {
    return errorResponse("not found", "PROPOSAL_NOT_FOUND", 404);
  }
  if (existing.type === "CONTRACT") {
    return errorResponse(
      "Contract records do not accept Phase 4 proposal snapshots.",
      "STRUCTURED_SNAPSHOT_TYPE_MISMATCH",
      409
    );
  }
  if (isProposalEditLocked(existing.status)) {
    return errorResponse(
      "Proposal is locked for editing in current status.",
      "STATUS_LOCKED",
      409
    );
  }

  const raw = await readJsonBody(req);
  if (!raw.ok) return raw.response;
  const body = proposalSnapshotWriteSchema.safeParse(raw.value);
  if (!body.success) {
    return errorResponse(
      "Structured proposal snapshot request is invalid.",
      "INVALID_SNAPSHOT_REQUEST",
      400,
      {
        issues: body.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      }
    );
  }
  if (body.data.expectedRevision !== existing.structuredSnapshotRevision) {
    return errorResponse(
      "Structured proposal snapshot changed. Reload before replacing it.",
      "SNAPSHOT_REVISION_CONFLICT",
      409,
      { currentRevision: existing.structuredSnapshotRevision }
    );
  }

  const validation = canonicalizeProposalSnapshot(body.data.snapshot, {
    proposalId,
    expectedRevision: body.data.expectedRevision,
    presetKey: body.data.presetKey,
  });
  if (!validation.ok) {
    return errorResponse(
      "Structured proposal snapshot failed canonical validation.",
      validation.code,
      422,
      { diagnostics: validation.diagnostics }
    );
  }
  const claimedEvidenceIds = claimedStructuredKnowledgeIds(
    validation.value.snapshot
  );
  const serverIdentity = await dependencies.resolveServerIdentity(
    workspace.id,
    existing.projectId
  );
  if (!serverIdentity) {
    return errorResponse(
      "Proposal project or workspace identity was not found.",
      "SNAPSHOT_SERVER_IDENTITY_NOT_FOUND",
      409
    );
  }
  const identityDiagnostics = validateProposalSnapshotServerIdentity(
    validation.value.snapshot,
    serverIdentity
  );
  if (identityDiagnostics.length > 0) {
    return errorResponse(
      "Structured proposal identity does not match current tenant records.",
      "STRUCTURED_IDENTITY_MISMATCH",
      422,
      { diagnostics: identityDiagnostics }
    );
  }
  const approvedEvidenceIds = await dependencies.resolveApprovedEvidence(
    workspace.id,
    claimedEvidenceIds
  );
  const evidenceDiagnostics = validateStructuredSnapshotEvidence(
    validation.value.snapshot,
    approvedEvidenceIds
  );
  if (evidenceDiagnostics.length > 0) {
    return errorResponse(
      "Structured proposal snapshot contains unapproved or unverified evidence.",
      "STRUCTURED_EVIDENCE_NOT_APPROVED",
      422,
      { diagnostics: evidenceDiagnostics }
    );
  }

  const updated = await dependencies.replaceSnapshot({
    proposalId,
    workspaceId: workspace.id,
    expectedRevision: body.data.expectedRevision,
    expectedStatus: existing.status,
    expectedProposalVersion: existing.version,
    expectedProposalUpdatedAt: existing.updatedAt,
    expectedLocale: existing.locale,
    expectedContentMd: existing.contentMd,
    updatedById: caller.userId,
    snapshot: validation.value,
  });
  if (!updated) {
    return errorResponse(
      "Structured proposal snapshot changed. Reload before replacing it.",
      "SNAPSHOT_REVISION_CONFLICT",
      409
    );
  }

  await dependencies.recordWrite({
    userId: caller.userId,
    proposalId,
    hash: validation.value.hash,
    revision: validation.value.revision,
    presetKey: validation.value.presetKey,
  });
  return NextResponse.json(
    {
      proposalId,
      snapshot: validation.value.snapshot,
      metadata: {
        schemaVersion: 1,
        lifecycle: "DRAFT",
        hash: validation.value.hash,
        revision: validation.value.revision,
        presetKey: validation.value.presetKey,
        channels: ["HTML", "PDF", "PPTX"],
        updatedAt: updated.structuredSnapshotUpdatedAt,
        updatedById: updated.structuredSnapshotUpdatedById,
      },
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "X-Arabclue-Proposal-Engine": "structured-v1",
        "X-Proposal-Snapshot-Hash": validation.value.hash,
        "X-Proposal-Snapshot-Revision": String(validation.value.revision),
      },
    }
  );
}

export async function handleProposalSnapshotGet(
  proposalId: string,
  dependencies: ProposalSnapshotRouteDependencies = defaultDependencies
): Promise<NextResponse> {
  const caller = await dependencies.getReader();
  if (!caller) {
    return errorResponse("Unauthorized", "UNAUTHORIZED", 401);
  }
  const workspace = await dependencies.getWorkspace(caller.userId);
  const proposal = await dependencies.findProposal(proposalId);
  if (!proposal || proposal.workspaceId !== workspace.id) {
    return errorResponse("not found", "PROPOSAL_NOT_FOUND", 404);
  }
  if (proposal.structuredSnapshot === null) {
    return NextResponse.json(
      {
        proposalId,
        snapshot: null,
        metadata: {
          lifecycle: null,
          revision: proposal.structuredSnapshotRevision,
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const validation = validatePersistedProposalSnapshot(
    proposal.structuredSnapshot,
    {
      proposalId,
      hash: proposal.structuredSnapshotHash,
      revision: proposal.structuredSnapshotRevision,
      presetKey: proposal.structuredSnapshotPreset,
    }
  );
  if (!validation.ok) {
    return errorResponse(
      "Persisted structured proposal snapshot is invalid.",
      validation.code,
      409,
      { diagnostics: validation.diagnostics }
    );
  }
  const serverIdentity = await dependencies.resolveServerIdentity(
    workspace.id,
    proposal.projectId
  );
  if (!serverIdentity) {
    return errorResponse(
      "Proposal project or workspace identity was not found.",
      "SNAPSHOT_SERVER_IDENTITY_NOT_FOUND",
      409
    );
  }
  const identityDiagnostics = validateProposalSnapshotServerIdentity(
    validation.value.snapshot,
    serverIdentity
  );
  if (identityDiagnostics.length > 0) {
    return errorResponse(
      "Persisted structured proposal identity no longer matches tenant records.",
      "STRUCTURED_IDENTITY_MISMATCH",
      409,
      { diagnostics: identityDiagnostics }
    );
  }
  const approvedEvidenceIds = await dependencies.resolveApprovedEvidence(
    workspace.id,
    claimedStructuredKnowledgeIds(validation.value.snapshot)
  );
  const evidenceDiagnostics = validateStructuredSnapshotEvidence(
    validation.value.snapshot,
    approvedEvidenceIds
  );
  if (evidenceDiagnostics.length > 0) {
    return errorResponse(
      "Persisted structured proposal evidence is no longer approved.",
      "STRUCTURED_EVIDENCE_NOT_APPROVED",
      409,
      { diagnostics: evidenceDiagnostics }
    );
  }

  return NextResponse.json(
    {
      proposalId,
      snapshot: validation.value.snapshot,
      metadata: {
        schemaVersion: 1,
        lifecycle: "DRAFT",
        hash: validation.value.hash,
        revision: validation.value.revision,
        presetKey: validation.value.presetKey,
        channels: ["HTML", "PDF", "PPTX"],
        updatedAt: proposal.structuredSnapshotUpdatedAt,
        updatedById: proposal.structuredSnapshotUpdatedById,
      },
    },
    {
      headers: {
        "Cache-Control": "no-store",
        "X-Arabclue-Proposal-Engine": "structured-v1",
        "X-Proposal-Snapshot-Hash": validation.value.hash,
        "X-Proposal-Snapshot-Revision": String(validation.value.revision),
      },
    }
  );
}

/**
 * Hydrate the current persisted Markdown plus an explicit counterpart entered
 * by the writer into an unverified bilingual snapshot. This production bridge
 * never invents a translation or promotes user-authored claims to verified
 * evidence.
 */
export async function handleProposalSnapshotPost(
  req: Request,
  proposalId: string,
  dependencies: ProposalSnapshotRouteDependencies = defaultDependencies
): Promise<NextResponse> {
  const caller = await dependencies.getWriter();
  if (!caller) {
    return errorResponse("Forbidden", "FORBIDDEN", 403);
  }
  const workspace = await dependencies.getWorkspace(caller.userId);
  const existing = await dependencies.findProposal(proposalId);
  if (!existing || existing.workspaceId !== workspace.id) {
    return errorResponse("not found", "PROPOSAL_NOT_FOUND", 404);
  }
  if (existing.type === "CONTRACT") {
    return errorResponse(
      "Contract records do not accept Phase 4 proposal snapshots.",
      "STRUCTURED_SNAPSHOT_TYPE_MISMATCH",
      409
    );
  }
  if (isProposalEditLocked(existing.status)) {
    return errorResponse(
      "Proposal is locked for editing in current status.",
      "STATUS_LOCKED",
      409
    );
  }
  if (!existing.contentMd?.trim()) {
    return errorResponse(
      "Proposal content is empty.",
      "EMPTY_PROPOSAL_CONTENT",
      422
    );
  }
  const raw = await readJsonBody(req);
  if (!raw.ok) return raw.response;
  const hydrationRequest =
    proposalSnapshotHydrationRequestSchema.safeParse(raw.value);
  if (!hydrationRequest.success) {
    return errorResponse(
      "Explicit counterpart-language Markdown is required.",
      "BILINGUAL_COUNTERPART_REQUIRED",
      400,
      {
        issues: hydrationRequest.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      }
    );
  }
  const serverIdentity = await dependencies.resolveServerIdentity(
    workspace.id,
    existing.projectId
  );
  if (!serverIdentity) {
    return errorResponse(
      "Proposal project or workspace identity was not found.",
      "SNAPSHOT_SERVER_IDENTITY_NOT_FOUND",
      409
    );
  }
  const contentMd =
    existing.locale === "en"
      ? {
          en: existing.contentMd,
          ar: hydrationRequest.data.counterpartMd,
        }
      : {
          en: hydrationRequest.data.counterpartMd,
          ar: existing.contentMd,
        };
  const languageDiagnostics =
    validateProposalDraftLanguageDirections(contentMd);
  if (languageDiagnostics.length > 0) {
    return errorResponse(
      "The explicit English and Arabic drafts failed language-direction validation.",
      "BILINGUAL_LANGUAGE_DIRECTION_INVALID",
      422,
      { diagnostics: languageDiagnostics }
    );
  }
  const hydrated = hydrateProposalSnapshotFromMarkdown({
    proposalId,
    proposalVersion: existing.version,
    expectedSnapshotRevision: existing.structuredSnapshotRevision,
    contentMd,
    sourceUpdatedAt: existing.updatedAt.toISOString(),
    identity: serverIdentity,
  });
  const validation = canonicalizeProposalSnapshot(hydrated, {
    proposalId,
    expectedRevision: existing.structuredSnapshotRevision,
    presetKey: "bilingual-parallel",
  });
  if (!validation.ok) {
    return errorResponse(
      "Current proposal content could not be hydrated into the structured engine.",
      validation.code,
      422,
      { diagnostics: validation.diagnostics }
    );
  }
  const identityDiagnostics = validateProposalSnapshotServerIdentity(
    validation.value.snapshot,
    serverIdentity
  );
  if (identityDiagnostics.length > 0) {
    return errorResponse(
      "Hydrated proposal identity does not match current tenant records.",
      "STRUCTURED_IDENTITY_MISMATCH",
      422,
      { diagnostics: identityDiagnostics }
    );
  }
  const evidenceDiagnostics = validateStructuredSnapshotEvidence(
    validation.value.snapshot,
    []
  );
  if (evidenceDiagnostics.length > 0) {
    return errorResponse(
      "Hydrated proposal contains invalid evidence declarations.",
      "STRUCTURED_EVIDENCE_NOT_APPROVED",
      422,
      { diagnostics: evidenceDiagnostics }
    );
  }
  const updated = await dependencies.replaceSnapshot({
    proposalId,
    workspaceId: workspace.id,
    expectedRevision: existing.structuredSnapshotRevision,
    expectedStatus: existing.status,
    expectedProposalVersion: existing.version,
    expectedProposalUpdatedAt: existing.updatedAt,
    expectedLocale: existing.locale,
    expectedContentMd: existing.contentMd,
    updatedById: caller.userId,
    snapshot: validation.value,
  });
  if (!updated) {
    return errorResponse(
      "Proposal changed during snapshot hydration. Reload and retry.",
      "SNAPSHOT_REVISION_CONFLICT",
      409
    );
  }
  await dependencies.recordWrite({
    userId: caller.userId,
    proposalId,
    hash: validation.value.hash,
    revision: validation.value.revision,
    presetKey: validation.value.presetKey,
  });
  return NextResponse.json(
    {
      proposalId,
      snapshot: validation.value.snapshot,
      metadata: {
        schemaVersion: 1,
        lifecycle: "DRAFT",
        source: "CURRENT_PROPOSAL_CONTENT",
        evidenceStatus: "USER_ENTERED_UNVERIFIED",
        hash: validation.value.hash,
        revision: validation.value.revision,
        presetKey: validation.value.presetKey,
        channels: ["HTML", "PDF", "PPTX"],
        updatedAt: updated.structuredSnapshotUpdatedAt,
        updatedById: updated.structuredSnapshotUpdatedById,
      },
    },
    {
      status: 201,
      headers: {
        "Cache-Control": "no-store",
        "X-Arabclue-Proposal-Engine": "structured-v1",
        "X-Proposal-Snapshot-Hash": validation.value.hash,
        "X-Proposal-Snapshot-Revision": String(validation.value.revision),
      },
    }
  );
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    return await handleProposalSnapshotPut(req, id);
  } catch (error) {
    console.error("[proposal snapshot PUT]", error);
    // The thrown text can carry Prisma constraint names and column paths.
    return errorResponse(
      "Snapshot operation failed",
      "SNAPSHOT_WRITE_FAILED",
      500
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    return await handleProposalSnapshotPost(req, id);
  } catch (error) {
    console.error("[proposal snapshot POST]", error);
    // The thrown text can carry Prisma constraint names and column paths.
    return errorResponse(
      "Snapshot operation failed",
      "SNAPSHOT_HYDRATION_FAILED",
      500
    );
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    return await handleProposalSnapshotGet(id);
  } catch (error) {
    console.error("[proposal snapshot GET]", error);
    // The thrown text can carry Prisma constraint names and column paths.
    return errorResponse(
      "Snapshot operation failed",
      "SNAPSHOT_READ_FAILED",
      500
    );
  }
}
