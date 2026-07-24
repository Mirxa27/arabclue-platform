import { z } from "zod";
import { Prisma } from "@prisma/client";
import { computeCanonicalHash } from "./document-templates/contract-templates";
import { parseContractArtifacts } from "./contract-artifacts";
import { parseContractArticles } from "./contract-format";
import {
  extractObligations,
  type ObligationMilestone,
} from "./contract-obligations";
import type {
  ContractObligationSnapshot,
  ContractExportOpts,
} from "./contract-export";

export const CONTRACT_RENDER_SNAPSHOT_SCHEMA_VERSION = 1 as const;
export const MAX_CONTRACT_RENDER_SNAPSHOT_BYTES = 2_000_000;

const nullableBoundedText = (max: number) =>
  z.string().max(max).nullable();

const milestoneSchema = z
  .object({
    name: nullableBoundedText(2_000),
    title: nullableBoundedText(2_000),
    weeks: z.number().finite().nonnegative().nullable(),
  })
  .strict();

const obligationSchema = z
  .object({
    id: z.string().trim().min(1).max(120),
    text: z.string().trim().min(1).max(20_000),
    source: z.string().trim().min(1).max(2_000),
    status: z.enum(["open", "done"]),
  })
  .strict();

export const contractRenderSnapshotSchema = z
  .object({
    schemaVersion: z.literal(CONTRACT_RENDER_SNAPSHOT_SCHEMA_VERSION),
    snapshotRevision: z.number().int().positive(),
    capturedAt: z.string().datetime(),
    proposal: z
      .object({
        id: z.string().trim().min(1).max(200),
        workspaceId: z.string().trim().min(1).max(200),
        projectId: z.string().trim().min(1).max(200),
        type: z.literal("CONTRACT"),
        title: z.string().trim().min(1).max(2_000),
        titleAr: nullableBoundedText(2_000),
        contentMd: z.string().trim().min(1).max(1_500_000),
        locale: z.enum(["ar", "en"]),
        version: z.number().int().positive(),
      })
      .strict(),
    project: z
      .object({
        id: z.string().trim().min(1).max(200),
        title: z.string().trim().min(1).max(2_000),
        etimadRef: nullableBoundedText(500),
        updatedAt: z.string().datetime(),
      })
      .strict(),
    workspace: z
      .object({
        id: z.string().trim().min(1).max(200),
        name: z.string().trim().min(1).max(2_000),
        nameAr: nullableBoundedText(2_000),
        crNumber: nullableBoundedText(500),
        vatNumber: nullableBoundedText(500),
      })
      .strict(),
    brand: z
      .object({
        profileId: z.string().trim().min(1).max(200),
        logoUrl: nullableBoundedText(20_000),
        primaryColor: z.string().max(100),
        secondaryColor: z.string().max(100),
        accentColor: z.string().max(100),
        fontFamily: z.string().max(500),
        tagline: nullableBoundedText(2_000),
        taglineAr: nullableBoundedText(2_000),
      })
      .strict()
      .nullable(),
    artifacts: z.json().nullable(),
    milestones: z.array(milestoneSchema).max(2_000),
    obligations: z.array(obligationSchema).max(5_000),
  })
  .strict()
  .superRefine((snapshot, context) => {
    if (snapshot.proposal.projectId !== snapshot.project.id) {
      context.addIssue({
        code: "custom",
        path: ["proposal", "projectId"],
        message: "Proposal and project snapshot identities must match.",
      });
    }
    if (snapshot.proposal.workspaceId !== snapshot.workspace.id) {
      context.addIssue({
        code: "custom",
        path: ["proposal", "workspaceId"],
        message: "Proposal and workspace snapshot identities must match.",
      });
    }
    const obligationIds = new Set<string>();
    snapshot.obligations.forEach((obligation, index) => {
      if (obligationIds.has(obligation.id)) {
        context.addIssue({
          code: "custom",
          path: ["obligations", index, "id"],
          message: "Contract obligation identities must be unique.",
        });
      }
      obligationIds.add(obligation.id);
    });
  });

export type ContractRenderSnapshot = z.infer<
  typeof contractRenderSnapshotSchema
>;

export interface ContractRenderSnapshotSource {
  readonly proposal: {
    readonly id: string;
    readonly workspaceId: string;
    readonly projectId: string;
    readonly type: string;
    readonly title: string;
    readonly titleAr: string | null;
    readonly contentMd: string | null;
    readonly locale: string;
    readonly version: number;
    readonly artifactsJson: string | null;
  };
  readonly project: {
    readonly id: string;
    readonly title: string;
    readonly etimadRef: string | null;
    readonly updatedAt: Date;
  };
  readonly workspace: {
    readonly id: string;
    readonly name: string;
    readonly nameAr: string | null;
    readonly crNumber: string | null;
    readonly vatNumber: string | null;
  };
  readonly brand: {
    readonly id: string;
    readonly logoUrl: string | null;
    readonly primaryColor: string;
    readonly secondaryColor: string;
    readonly accentColor: string;
    readonly fontFamily: string;
    readonly tagline: string | null;
    readonly taglineAr: string | null;
  } | null;
  readonly obligationStates: readonly {
    readonly obligationId: string;
    readonly status: string;
  }[];
}

export interface CanonicalContractRenderSnapshot {
  readonly snapshot: ContractRenderSnapshot;
  readonly hash: string;
  readonly revision: number;
}

export class ContractRenderSnapshotError extends Error {
  readonly code: string;
  readonly diagnostics: readonly {
    readonly path: string;
    readonly message: string;
  }[];

  constructor(
    code: string,
    message: string,
    diagnostics: readonly {
      readonly path: string;
      readonly message: string;
    }[] = []
  ) {
    super(message);
    this.name = "ContractRenderSnapshotError";
    this.code = code;
    this.diagnostics = diagnostics;
  }
}

function parseArtifacts(raw: string | null): z.infer<ReturnType<typeof z.json>> | null {
  if (raw === null) return null;
  try {
    return z.json().parse(JSON.parse(raw));
  } catch {
    throw new ContractRenderSnapshotError(
      "CONTRACT_ARTIFACTS_INVALID",
      "Contract artifacts must be valid JSON before review submission."
    );
  }
}

function normalizeMilestones(
  milestones: readonly ObligationMilestone[] | null | undefined
): ContractRenderSnapshot["milestones"] {
  return (milestones ?? []).map((milestone) => ({
    name: milestone.name ?? null,
    title: milestone.title ?? null,
    weeks: milestone.weeks ?? null,
  }));
}

function assertSnapshotBudget(snapshot: ContractRenderSnapshot): void {
  const bytes = new TextEncoder().encode(JSON.stringify(snapshot)).byteLength;
  if (bytes > MAX_CONTRACT_RENDER_SNAPSHOT_BYTES) {
    throw new ContractRenderSnapshotError(
      "CONTRACT_RENDER_SNAPSHOT_TOO_LARGE",
      `Contract render snapshot exceeds the ${MAX_CONTRACT_RENDER_SNAPSHOT_BYTES}-byte budget.`
    );
  }
}

/**
 * Capture every mutable record used by authoritative contract rendering.
 * Inputs must be read in the same serializable transaction that stores the
 * snapshot and creates its approval chain.
 */
export function createContractRenderSnapshot(
  source: ContractRenderSnapshotSource,
  options: {
    readonly revision: number;
    readonly capturedAt: Date;
  }
): CanonicalContractRenderSnapshot {
  if (source.proposal.type !== "CONTRACT") {
    throw new ContractRenderSnapshotError(
      "CONTRACT_RENDER_SNAPSHOT_TYPE_MISMATCH",
      "Only contract proposals can create a contract render snapshot."
    );
  }
  const artifacts = parseArtifacts(source.proposal.artifactsJson);
  const parsedArtifacts = parseContractArtifacts(
    source.proposal.artifactsJson
  );
  const milestones = normalizeMilestones(parsedArtifacts.milestones);
  const articles =
    parsedArtifacts.articles?.length
      ? parsedArtifacts.articles
      : parseContractArticles(source.proposal.contentMd ?? "");
  const derived = extractObligations(
    articles,
    milestones
  );
  const stateById = new Map<string, "open" | "done">();
  for (const state of source.obligationStates) {
    if (state.status !== "open" && state.status !== "done") {
      throw new ContractRenderSnapshotError(
        "CONTRACT_OBLIGATION_STATE_INVALID",
        `Unsupported obligation state for "${state.obligationId}".`
      );
    }
    stateById.set(state.obligationId, state.status);
  }

  const candidate = {
    schemaVersion: CONTRACT_RENDER_SNAPSHOT_SCHEMA_VERSION,
    snapshotRevision: options.revision,
    capturedAt: options.capturedAt.toISOString(),
    proposal: {
      id: source.proposal.id,
      workspaceId: source.proposal.workspaceId,
      projectId: source.proposal.projectId,
      type: "CONTRACT" as const,
      title: source.proposal.title,
      titleAr: source.proposal.titleAr,
      contentMd: source.proposal.contentMd ?? "",
      locale: source.proposal.locale,
      version: source.proposal.version,
    },
    project: {
      id: source.project.id,
      title: source.project.title,
      etimadRef: source.project.etimadRef,
      updatedAt: source.project.updatedAt.toISOString(),
    },
    workspace: {
      id: source.workspace.id,
      name: source.workspace.name,
      nameAr: source.workspace.nameAr,
      crNumber: source.workspace.crNumber,
      vatNumber: source.workspace.vatNumber,
    },
    brand:
      source.brand === null
        ? null
        : {
            profileId: source.brand.id,
            logoUrl: source.brand.logoUrl,
            primaryColor: source.brand.primaryColor,
            secondaryColor: source.brand.secondaryColor,
            accentColor: source.brand.accentColor,
            fontFamily: source.brand.fontFamily,
            tagline: source.brand.tagline,
            taglineAr: source.brand.taglineAr,
          },
    artifacts,
    milestones,
    obligations: derived.map((obligation) => ({
      ...obligation,
      status: stateById.get(obligation.id) ?? obligation.status,
    })),
  };
  const parsed = contractRenderSnapshotSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new ContractRenderSnapshotError(
      "CONTRACT_RENDER_SNAPSHOT_INVALID",
      "Contract render inputs failed canonical validation.",
      parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      }))
    );
  }
  assertSnapshotBudget(parsed.data);
  return {
    snapshot: parsed.data,
    hash: computeCanonicalHash(parsed.data),
    revision: parsed.data.snapshotRevision,
  };
}

export type ContractRenderSnapshotValidationResult =
  | Readonly<{ ok: true; value: CanonicalContractRenderSnapshot }>
  | Readonly<{
      ok: false;
      code:
        | "CONTRACT_RENDER_SNAPSHOT_REQUIRED"
        | "CONTRACT_RENDER_SNAPSHOT_INVALID"
        | "CONTRACT_RENDER_SNAPSHOT_IDENTITY_MISMATCH"
        | "CONTRACT_RENDER_SNAPSHOT_REVISION_MISMATCH"
        | "CONTRACT_RENDER_SNAPSHOT_HASH_MISMATCH"
        | "CONTRACT_RENDER_SNAPSHOT_TOO_LARGE";
      diagnostics: readonly {
        readonly path: string;
        readonly message: string;
      }[];
    }>;

export function validatePersistedContractRenderSnapshot(
  value: unknown,
  binding: {
    readonly proposalId: string;
    readonly hash: string | null;
    readonly revision: number;
  }
): ContractRenderSnapshotValidationResult {
  if (value === null || value === undefined || binding.hash === null) {
    return {
      ok: false,
      code: "CONTRACT_RENDER_SNAPSHOT_REQUIRED",
      diagnostics: [
        {
          path: "contractRenderSnapshot",
          message:
            "An immutable contract render snapshot is required for authoritative export.",
        },
      ],
    };
  }
  const parsed = contractRenderSnapshotSchema.safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      code: "CONTRACT_RENDER_SNAPSHOT_INVALID",
      diagnostics: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    };
  }
  const bytes = new TextEncoder().encode(JSON.stringify(parsed.data)).byteLength;
  if (bytes > MAX_CONTRACT_RENDER_SNAPSHOT_BYTES) {
    return {
      ok: false,
      code: "CONTRACT_RENDER_SNAPSHOT_TOO_LARGE",
      diagnostics: [
        {
          path: "contractRenderSnapshot",
          message: "Stored contract render snapshot exceeds its byte budget.",
        },
      ],
    };
  }
  if (parsed.data.proposal.id !== binding.proposalId) {
    return {
      ok: false,
      code: "CONTRACT_RENDER_SNAPSHOT_IDENTITY_MISMATCH",
      diagnostics: [
        {
          path: "proposal.id",
          message: "Stored contract snapshot belongs to another proposal.",
        },
      ],
    };
  }
  if (
    parsed.data.snapshotRevision !== binding.revision ||
    binding.revision < 1
  ) {
    return {
      ok: false,
      code: "CONTRACT_RENDER_SNAPSHOT_REVISION_MISMATCH",
      diagnostics: [
        {
          path: "snapshotRevision",
          message: "Stored contract snapshot revision metadata is inconsistent.",
        },
      ],
    };
  }
  const actualHash = computeCanonicalHash(parsed.data);
  if (actualHash !== binding.hash) {
    return {
      ok: false,
      code: "CONTRACT_RENDER_SNAPSHOT_HASH_MISMATCH",
      diagnostics: [
        {
          path: "contractRenderSnapshotHash",
          message: "Stored contract snapshot does not match its canonical hash.",
        },
      ],
    };
  }
  return {
    ok: true,
    value: {
      snapshot: parsed.data,
      hash: actualHash,
      revision: parsed.data.snapshotRevision,
    },
  };
}

export function contractExportOptionsFromSnapshot(
  snapshot: ContractRenderSnapshot
): Omit<ContractExportOpts, "forPrint"> {
  return {
    title: snapshot.proposal.title,
    titleAr: snapshot.proposal.titleAr,
    contentMd: snapshot.proposal.contentMd,
    projectTitle: snapshot.project.title,
    etimadRef: snapshot.project.etimadRef,
    brand:
      snapshot.brand === null
        ? null
        : {
            workspaceId: snapshot.workspace.id,
            logoUrl: snapshot.brand.logoUrl,
            primaryColor: snapshot.brand.primaryColor,
            secondaryColor: snapshot.brand.secondaryColor,
            accentColor: snapshot.brand.accentColor,
            fontFamily: snapshot.brand.fontFamily,
            tagline: snapshot.brand.tagline,
            taglineAr: snapshot.brand.taglineAr,
          },
    company: {
      name: snapshot.workspace.name,
      nameAr: snapshot.workspace.nameAr,
      crNumber: snapshot.workspace.crNumber,
      vatNumber: snapshot.workspace.vatNumber,
    },
  };
}

export const CONTRACT_RENDER_SNAPSHOT_INVALIDATION = Object.freeze({
  contractRenderSnapshot: Prisma.DbNull,
  contractRenderSnapshotHash: null,
  contractRenderSnapshotRevision: { increment: 1 as const },
});
