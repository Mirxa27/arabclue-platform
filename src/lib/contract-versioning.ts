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
 * Compute a canonical hash from bindings and document spec.
 * This serves as the integrity fingerprint for a contract version.
 */
function computeVersionCanonicalHash(input: {
  readonly bindings: unknown;
  readonly documentSpec: unknown;
}): string {
  return computeCanonicalHash({
    schemaVersion: 1,
    bindings: input.bindings,
    documentSpec: input.documentSpec,
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
  const canonicalHash = computeVersionCanonicalHash({
    bindings: input.bindings,
    documentSpec: input.documentSpec,
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
      bindingsJson: JSON.stringify(input.bindings),
      documentSpecJson: input.documentSpec
        ? JSON.stringify(input.documentSpec)
        : null,
      contentHtml: input.contentHtml,
      canonicalHash,
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

  // Resolve cursor position if provided
  let cursorPosition: { readonly revision: number } | null = null;
  if (input.cursor) {
    const cursorVersion = await database.generatedContractVersion.findFirst({
      where: { contractId: input.contractId, id: input.cursor },
      select: { revision: true },
    });
    if (!cursorVersion) {
      throw new ContractVersioningError(
        "Contract revision cursor not found.",
        "CONTRACT_REVISION_CURSOR_NOT_FOUND",
        404
      );
    }
    cursorPosition = cursorVersion;
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

  return {
    versions,
    nextCursor:
      records.length > take ? (pageRecords.at(-1)?.id ?? null) : null,
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

  // Verify canonical hash integrity
  const computedHash = computeVersionCanonicalHash({ bindings, documentSpec });
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
 */
function computeArticleDiff(
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
  if (input.revA === input.revB) {
    throw new ContractVersioningError(
      "Cannot compare a revision with itself.",
      "CONTRACT_REVISION_COMPARISON_INVALID",
      422
    );
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
