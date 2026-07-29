/**
 * Contract Instance Version History (Req 7)
 *
 * Tracks revisions of generated contracts with:
 * - Canonical hash verification for integrity
 * - Keyset pagination for version listing
 * - Article-level diffing for bilingual content
 */

import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { AUDIT_ACTIONS, audit } from "./audit";
import { computeCanonicalHash } from "./document-templates/contract-templates";
import {
  decodeContractRevisionCursor,
  encodeContractRevisionCursor,
} from "./version-history-cursor";

export const MAX_CONTRACT_VERSION_LIST_LIMIT = 50;

// ─── Error Classes ───────────────────────────────────────────────────────────

export class ContractVersioningError extends Error {
  constructor(
    message: string,
    readonly code:
      | "CONTRACT_REVISION_NOT_FOUND"
      | "CONTRACT_REVISION_INTEGRITY_FAILURE"
      | "CONTRACT_NOT_FOUND"
      | "CONTRACT_REVISION_CURSOR_NOT_FOUND"
      | "CONTRACT_REVISION_COMPARISON_INVALID"
      | "CONTRACT_WORKSPACE_MISMATCH",
    readonly status: 404 | 409 | 422
  ) {
    super(message);
    this.name = "ContractVersioningError";
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CreateContractVersionInput {
  readonly contractId: string;
  readonly bindings: Readonly<Record<string, unknown>>;
  readonly documentSpec: unknown;
  readonly contentHtml: string;
  readonly createdBy: string;
  readonly templateVersionId?: string | null;
  readonly selectedClauseIds?: readonly string[];
  readonly variableValues?: Readonly<Record<string, unknown>> | null;
  readonly legalReviewStatus?: string;
  readonly counselReviewRequired?: boolean;
  readonly isExecutable?: boolean;
}

export interface ContractVersionSummary {
  readonly id: string;
  readonly contractId: string;
  readonly revision: number;
  readonly canonicalHash: string;
  readonly createdBy: string;
  readonly createdAt: string;
}

export interface ContractVersionDetail extends ContractVersionSummary {
  readonly bindings: Readonly<Record<string, unknown>>;
  readonly documentSpec: unknown;
  readonly contentHtml: string;
}

export interface ArticleDiff {
  readonly articleKey: string;
  readonly change: "added" | "removed" | "modified" | "unchanged";
  readonly oldText: string | null;
  readonly newText: string | null;
}

export interface ContractRevisionComparison {
  readonly contractId: string;
  readonly revisionA: number;
  readonly revisionB: number;
  readonly arabic: readonly ArticleDiff[];
  readonly english: readonly ArticleDiff[];
}

// ─── Schemas ─────────────────────────────────────────────────────────────────

const canonicalHashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/u);
const identifierSchema = z.string().trim().min(1).max(200);

export const contractVersionListQuerySchema = z
  .object({
    cursor: identifierSchema.optional(),
    take: z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_CONTRACT_VERSION_LIST_LIMIT)
      .default(25),
  })
  .strict();

export const contractRevisionCompareQuerySchema = z
  .object({
    a: z.coerce.number().int().min(1),
    b: z.coerce.number().int().min(1),
  })
  .strict()
  .refine((data) => data.a !== data.b, {
    message: "Revisions must be different",
    path: ["b"],
  });

// ─── Canonical Hash Computation ──────────────────────────────────────────────

/**
 * Canonical integrity fingerprint for a contract revision.
 *
 * Schema v1 (legacy): bindings + documentSpec only.
 * Schema v2: also hashes sorted selected clause IDs, template version id,
 * and variable values (design §4.4 / Req 7.1).
 */
export function computeVersionCanonicalHash(input: {
  readonly bindings: unknown;
  readonly documentSpec: unknown;
  readonly selectedClauseIds?: readonly string[] | null;
  readonly templateVersionId?: string | null;
  readonly variableValues?: unknown;
}): string {
  const hasExtended =
    input.selectedClauseIds != null ||
    input.templateVersionId != null ||
    input.variableValues != null;

  if (!hasExtended) {
    return computeCanonicalHash({
      schemaVersion: 1,
      bindings: input.bindings,
      documentSpec: input.documentSpec,
    });
  }

  return computeCanonicalHash({
    schemaVersion: 2,
    bindings: input.bindings,
    documentSpec: input.documentSpec,
    selectedClauseIds: [...(input.selectedClauseIds ?? [])].sort(),
    templateVersionId: input.templateVersionId ?? null,
    variableValues: input.variableValues ?? null,
  });
}

// ─── Core Functions ──────────────────────────────────────────────────────────

/**
 * Internal implementation for creating a contract version.
 * Can be used directly when already inside a transaction.
 */
async function createContractVersionInternal(
  input: CreateContractVersionInput,
  tx: Pick<PrismaClient, "generatedContractVersion">
): Promise<ContractVersionSummary> {
  const selectedClauseIds = input.selectedClauseIds ?? [];
  const variableValues = input.variableValues ?? input.bindings;
  const canonicalHash = computeVersionCanonicalHash({
    bindings: input.bindings,
    documentSpec: input.documentSpec,
    selectedClauseIds,
    templateVersionId: input.templateVersionId ?? null,
    variableValues,
  });

  // Get max existing revision
  const maxRevision = await tx.generatedContractVersion.aggregate({
    where: { contractId: input.contractId },
    _max: { revision: true },
  });

  const nextRevision = (maxRevision._max.revision ?? 0) + 1;

  const version = await tx.generatedContractVersion.create({
    data: {
      contractId: input.contractId,
      revision: nextRevision,
      templateVersionId: input.templateVersionId ?? null,
      bindingsJson: JSON.stringify(input.bindings),
      variableValuesJson: JSON.stringify(variableValues),
      selectedClauseIdsJson: JSON.stringify(selectedClauseIds),
      documentSpecJson: input.documentSpec
        ? JSON.stringify(input.documentSpec)
        : null,
      contentHtml: input.contentHtml,
      canonicalHash,
      legalReviewStatus: input.legalReviewStatus ?? "UNREVIEWED",
      counselReviewRequired: input.counselReviewRequired ?? true,
      isExecutable: input.isExecutable ?? false,
      createdBy: input.createdBy,
    },
    select: {
      id: true,
      contractId: true,
      revision: true,
      canonicalHash: true,
      createdBy: true,
      createdAt: true,
    },
  });

  return {
    id: version.id,
    contractId: version.contractId,
    revision: version.revision,
    canonicalHash: version.canonicalHash ?? canonicalHash,
    createdBy: version.createdBy,
    createdAt: version.createdAt.toISOString(),
  };
}

/**
 * Append the next immutable revision only when the canonical hash changes.
 * Same-hash submissions retain prior revisions and return the current tip.
 */
export async function appendContractRevisionIfChanged(
  input: CreateContractVersionInput,
  database: PrismaClient | Pick<PrismaClient, "generatedContractVersion"> = db
): Promise<{
  readonly appended: boolean;
  readonly version: ContractVersionSummary;
}> {
  const run = async (
    tx: Pick<PrismaClient, "generatedContractVersion">
  ) => {
    const latest = await tx.generatedContractVersion.findFirst({
      where: { contractId: input.contractId },
      orderBy: [{ revision: "desc" }, { id: "desc" }],
      select: {
        id: true,
        contractId: true,
        revision: true,
        canonicalHash: true,
        createdBy: true,
        createdAt: true,
        selectedClauseIdsJson: true,
        templateVersionId: true,
        variableValuesJson: true,
        bindingsJson: true,
        documentSpecJson: true,
      },
    });

    const selectedClauseIds = input.selectedClauseIds ?? [];
    const variableValues = input.variableValues ?? input.bindings;
    const nextHash = computeVersionCanonicalHash({
      bindings: input.bindings,
      documentSpec: input.documentSpec,
      selectedClauseIds,
      templateVersionId: input.templateVersionId ?? null,
      variableValues,
    });

    if (latest && latest.canonicalHash === nextHash) {
      return {
        appended: false as const,
        version: {
          id: latest.id,
          contractId: latest.contractId,
          revision: latest.revision,
          canonicalHash: latest.canonicalHash ?? nextHash,
          createdBy: latest.createdBy,
          createdAt: latest.createdAt.toISOString(),
        },
      };
    }

    const version = await createContractVersionInternal(input, tx);
    return { appended: true as const, version };
  };

  if ("$transaction" in database && typeof database.$transaction === "function") {
    return (database as PrismaClient).$transaction(run, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  }
  return run(database);
}

/**
 * Create a new contract version with auto-incremented revision number.
 * Computes and stores a canonical hash for integrity verification.
 *
 * If database has $transaction method, runs in a serializable transaction.
 * If database is already a transaction client (no $transaction), runs directly.
 */
export async function createContractVersion(
  input: CreateContractVersionInput,
  database: PrismaClient | Pick<PrismaClient, "generatedContractVersion"> = db
): Promise<ContractVersionSummary> {
  // Check if this is a full PrismaClient with $transaction
  if ("$transaction" in database && typeof database.$transaction === "function") {
    return (database as PrismaClient).$transaction(
      async (tx) => createContractVersionInternal(input, tx),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  }
  
  // Already inside a transaction or using a transaction client
  return createContractVersionInternal(input, database);
}

/**
 * List contract versions with keyset pagination in descending revision order.
 */
export async function listContractVersions(
  input: {
    readonly contractId: string;
    readonly workspaceId: string;
    readonly cursor?: string;
    readonly take?: number;
  },
  database: PrismaClient = db
): Promise<{
  readonly versions: readonly ContractVersionSummary[];
  readonly nextCursor: string | null;
}> {
  const take = Math.min(
    input.take ?? 25,
    MAX_CONTRACT_VERSION_LIST_LIMIT
  );

  // Verify contract belongs to workspace
  const contract = await database.generatedContract.findFirst({
    where: { id: input.contractId, workspaceId: input.workspaceId },
    select: { id: true },
  });

  if (!contract) {
    throw new ContractVersioningError(
      "Contract not found in workspace.",
      "CONTRACT_NOT_FOUND",
      404
    );
  }

  // Resolve strict scoped keyset cursor when provided
  let cursorPosition: { readonly revision: number } | null = null;
  if (input.cursor) {
    const decoded = decodeContractRevisionCursor(
      input.cursor,
      input.workspaceId,
      input.contractId
    );
    if (!decoded) {
      throw new ContractVersioningError(
        "Contract revision cursor not found.",
        "CONTRACT_REVISION_CURSOR_NOT_FOUND",
        404
      );
    }
    cursorPosition = { revision: decoded.revision };
  }

  const records = await database.generatedContractVersion.findMany({
    where: {
      contractId: input.contractId,
      ...(cursorPosition
        ? { revision: { lt: cursorPosition.revision } }
        : {}),
    },
    orderBy: { revision: "desc" },
    take: take + 1,
    select: {
      id: true,
      contractId: true,
      revision: true,
      canonicalHash: true,
      createdBy: true,
      createdAt: true,
    },
  });

  const pageRecords = records.slice(0, take);
  const versions: ContractVersionSummary[] = pageRecords.map((record) => ({
    id: record.id,
    contractId: record.contractId,
    revision: record.revision,
    canonicalHash: record.canonicalHash ?? "",
    createdBy: record.createdBy,
    createdAt: record.createdAt.toISOString(),
  }));

  const last = pageRecords.at(-1);
  return {
    versions,
    nextCursor:
      records.length > take && last
        ? encodeContractRevisionCursor(input.workspaceId, input.contractId, {
            revision: last.revision,
            id: last.id,
          })
        : null,
  };
}

/**
 * Get a specific contract version by revision number.
 * Verifies the stored canonical hash before returning.
 */
export async function getContractVersion(
  input: {
    readonly contractId: string;
    readonly workspaceId: string;
    readonly revision: number;
  },
  database: PrismaClient = db
): Promise<ContractVersionDetail> {
  // Verify contract belongs to workspace
  const contract = await database.generatedContract.findFirst({
    where: { id: input.contractId, workspaceId: input.workspaceId },
    select: { id: true },
  });

  if (!contract) {
    throw new ContractVersioningError(
      "Contract not found in workspace.",
      "CONTRACT_NOT_FOUND",
      404
    );
  }

  const version = await database.generatedContractVersion.findUnique({
    where: {
      contractId_revision: {
        contractId: input.contractId,
        revision: input.revision,
      },
    },
  });

  if (!version) {
    throw new ContractVersioningError(
      `Contract revision ${input.revision} not found.`,
      "CONTRACT_REVISION_NOT_FOUND",
      404
    );
  }

  // Parse stored data
  let bindings: Record<string, unknown> = {};
  let documentSpec: unknown = null;

  try {
    bindings = JSON.parse(version.bindingsJson);
  } catch {
    throw new ContractVersioningError(
      "Contract revision data is corrupted.",
      "CONTRACT_REVISION_INTEGRITY_FAILURE",
      409
    );
  }

  if (version.documentSpecJson) {
    try {
      documentSpec = JSON.parse(version.documentSpecJson);
    } catch {
      throw new ContractVersioningError(
        "Contract revision document spec is corrupted.",
        "CONTRACT_REVISION_INTEGRITY_FAILURE",
        409
      );
    }
  }

  let selectedClauseIds: string[] | null = null;
  let variableValues: unknown = null;
  if (version.selectedClauseIdsJson) {
    try {
      const parsed = JSON.parse(version.selectedClauseIdsJson) as unknown;
      selectedClauseIds = Array.isArray(parsed)
        ? parsed.filter((id): id is string => typeof id === "string")
        : [];
    } catch {
      throw new ContractVersioningError(
        "Contract revision clause snapshot is corrupted.",
        "CONTRACT_REVISION_INTEGRITY_FAILURE",
        409
      );
    }
  }
  if (version.variableValuesJson) {
    try {
      variableValues = JSON.parse(version.variableValuesJson);
    } catch {
      throw new ContractVersioningError(
        "Contract revision variable snapshot is corrupted.",
        "CONTRACT_REVISION_INTEGRITY_FAILURE",
        409
      );
    }
  }

  // Verify canonical hash integrity (v1 legacy or v2 extended).
  const computedHash = computeVersionCanonicalHash({
    bindings,
    documentSpec,
    ...(selectedClauseIds != null ||
    version.templateVersionId != null ||
    variableValues != null
      ? {
          selectedClauseIds: selectedClauseIds ?? [],
          templateVersionId: version.templateVersionId,
          variableValues: variableValues ?? bindings,
        }
      : {}),
  });
  if (version.canonicalHash && computedHash !== version.canonicalHash) {
    throw new ContractVersioningError(
      "Contract revision integrity check failed — stored hash does not match computed hash.",
      "CONTRACT_REVISION_INTEGRITY_FAILURE",
      409
    );
  }

  return {
    id: version.id,
    contractId: version.contractId,
    revision: version.revision,
    canonicalHash: version.canonicalHash ?? computedHash,
    createdBy: version.createdBy,
    createdAt: version.createdAt.toISOString(),
    bindings,
    documentSpec,
    contentHtml: version.contentHtml,
  };
}

// ─── Diffing Logic ───────────────────────────────────────────────────────────

interface BilingualSection {
  readonly key: string;
  readonly arabic: string;
  readonly english: string;
}

/**
 * Extract article/section content from a document spec for diffing.
 * Handles the bilingual document structure used by the contract system.
 */
function extractSectionsForDiff(documentSpec: unknown): readonly BilingualSection[] {
  if (!documentSpec || typeof documentSpec !== "object") {
    return [];
  }

  const spec = documentSpec as Record<string, unknown>;
  const sections: BilingualSection[] = [];

  // Handle sections array structure
  const sectionsArray = spec.sections;
  if (Array.isArray(sectionsArray)) {
    for (const section of sectionsArray) {
      if (section && typeof section === "object") {
        const sec = section as Record<string, unknown>;
        const key = String(sec.key ?? sec.id ?? `section-${sections.length}`);
        
        // Extract bilingual content
        let arabic = "";
        let english = "";
        
        if (sec.content && typeof sec.content === "object") {
          const content = sec.content as Record<string, unknown>;
          arabic = String(content.ar ?? content.arabic ?? "");
          english = String(content.en ?? content.english ?? "");
        } else if (typeof sec.contentAr === "string" && typeof sec.contentEn === "string") {
          arabic = sec.contentAr;
          english = sec.contentEn;
        } else if (typeof sec.ar === "string" && typeof sec.en === "string") {
          arabic = sec.ar;
          english = sec.en;
        }
        
        // Handle clauses within sections
        const clauses = sec.clauses;
        if (Array.isArray(clauses)) {
          for (const clause of clauses) {
            if (clause && typeof clause === "object") {
              const cl = clause as Record<string, unknown>;
              const clauseKey = String(cl.key ?? cl.id ?? `${key}-clause-${sections.length}`);
              
              let clauseAr = "";
              let clauseEn = "";
              
              if (cl.bound && typeof cl.bound === "object") {
                const bound = cl.bound as Record<string, unknown>;
                clauseAr = String(bound.ar ?? bound.arabic ?? "");
                clauseEn = String(bound.en ?? bound.english ?? "");
              } else if (typeof cl.contentAr === "string" && typeof cl.contentEn === "string") {
                clauseAr = cl.contentAr;
                clauseEn = cl.contentEn;
              }
              
              if (clauseAr || clauseEn) {
                sections.push({ key: clauseKey, arabic: clauseAr, english: clauseEn });
              }
            }
          }
        }
        
        if (arabic || english) {
          sections.push({ key, arabic, english });
        }
      }
    }
  }

  return sections;
}

/**
 * Compute article-level diff between two versions.
 * Exported for Property 10 (self-comparison) and unit tests.
 */
export function computeArticleDiff(
  oldSections: readonly BilingualSection[],
  newSections: readonly BilingualSection[],
  language: "arabic" | "english"
): ArticleDiff[] {
  const oldMap = new Map(oldSections.map((s) => [s.key, s[language]]));
  const newMap = new Map(newSections.map((s) => [s.key, s[language]]));
  const allKeys = new Set([...oldMap.keys(), ...newMap.keys()]);
  const diffs: ArticleDiff[] = [];

  for (const key of allKeys) {
    const oldText = oldMap.get(key) ?? null;
    const newText = newMap.get(key) ?? null;

    if (oldText === null && newText !== null) {
      diffs.push({ articleKey: key, change: "added", oldText, newText });
    } else if (oldText !== null && newText === null) {
      diffs.push({ articleKey: key, change: "removed", oldText, newText });
    } else if (oldText !== newText) {
      diffs.push({ articleKey: key, change: "modified", oldText, newText });
    } else {
      diffs.push({ articleKey: key, change: "unchanged", oldText, newText });
    }
  }

  return diffs;
}

/**
 * Compare two contract revisions and return article-level diffs.
 */
export async function compareContractRevisions(
  input: {
    readonly contractId: string;
    readonly workspaceId: string;
    readonly revA: number;
    readonly revB: number;
  },
  database: PrismaClient = db
): Promise<ContractRevisionComparison> {
  // Self-comparison is valid: every article is unchanged (Property 10 / 7.3).
  if (input.revA === input.revB) {
    const version = await getContractVersion(
      {
        contractId: input.contractId,
        workspaceId: input.workspaceId,
        revision: input.revA,
      },
      database
    );
    const sections = extractSectionsForDiff(version.documentSpec);
    return {
      contractId: input.contractId,
      revisionA: input.revA,
      revisionB: input.revB,
      arabic: computeArticleDiff(sections, sections, "arabic"),
      english: computeArticleDiff(sections, sections, "english"),
    };
  }

  // Fetch both versions with integrity check
  const [versionA, versionB] = await Promise.all([
    getContractVersion(
      {
        contractId: input.contractId,
        workspaceId: input.workspaceId,
        revision: input.revA,
      },
      database
    ),
    getContractVersion(
      {
        contractId: input.contractId,
        workspaceId: input.workspaceId,
        revision: input.revB,
      },
      database
    ),
  ]);

  // Extract sections for diffing
  const sectionsA = extractSectionsForDiff(versionA.documentSpec);
  const sectionsB = extractSectionsForDiff(versionB.documentSpec);

  // Compute bilingual diffs
  const arabicDiff = computeArticleDiff(sectionsA, sectionsB, "arabic");
  const englishDiff = computeArticleDiff(sectionsA, sectionsB, "english");

  return {
    contractId: input.contractId,
    revisionA: input.revA,
    revisionB: input.revB,
    arabic: arabicDiff,
    english: englishDiff,
  };
}

// ─── Audit Helper ────────────────────────────────────────────────────────────

export async function auditContractVersionCreate(
  input: {
    readonly userId: string;
    readonly contractId: string;
    readonly workspaceId: string;
    readonly revision: number;
    readonly canonicalHash: string;
    readonly ipAddress?: string;
    readonly userAgent?: string;
  }
): Promise<void> {
  await audit({
    userId: input.userId,
    action: "CONTRACT_VERSION_CREATE",
    resource: "GeneratedContractVersion",
    resourceId: `${input.contractId}:${input.revision}`,
    details: {
      workspaceId: input.workspaceId,
      contractId: input.contractId,
      revision: input.revision,
      canonicalHash: input.canonicalHash,
    },
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    severity: "INFO",
    success: true,
  });
}
