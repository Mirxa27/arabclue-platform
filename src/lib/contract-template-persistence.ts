import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { AUDIT_ACTIONS } from "./audit";
import { createContractVersion } from "./contract-versioning";
import { parseBilingualDocument } from "./bilingual-layout";
import {
  compileContractTemplateDocument,
  renderContractTemplateDocumentHTML,
  type ContractTemplateDocumentCompilation,
} from "./document-templates/contract-template-renderer";
import {
  CONTRACT_TEMPLATE_KEYS,
  computeCanonicalHash,
  computeContractTemplateHash,
  getContractClause,
  getContractTemplate,
  type BindingDiagnostic,
  type ContractClauseDefinition,
  type ContractTemplateDefinition,
} from "./document-templates/contract-templates";

export const CONTRACT_DRAFT_GENERATION_SCHEMA_VERSION = 1;
export const MAX_CONTRACT_DRAFT_BODY_BYTES = 512 * 1_024;
export const MAX_CONTRACT_DRAFT_STORED_BYTES = 4 * 1_024 * 1_024;
export const MAX_CONTRACT_DRAFT_LIST_LIMIT = 50;

export const CONTRACT_DRAFT_PLAN_LIMITS = Object.freeze({
  STARTER: Object.freeze({
    maxActiveDrafts: 50,
    maxStorageBytes: 64 * 1_024 * 1_024,
  }),
  PRO: Object.freeze({
    maxActiveDrafts: 250,
    maxStorageBytes: 256 * 1_024 * 1_024,
  }),
  ENTERPRISE: Object.freeze({
    maxActiveDrafts: 1_000,
    maxStorageBytes: 1_024 * 1_024 * 1_024,
  }),
  PAY_AS_YOU_GO: Object.freeze({
    maxActiveDrafts: 100,
    maxStorageBytes: 128 * 1_024 * 1_024,
  }),
});

export interface ContractDraftWorkspaceLimits {
  readonly maxActiveDrafts: number;
  readonly maxStorageBytes: number;
}

const canonicalHashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/u);
const identifierSchema = z.string().trim().min(1).max(200);

export const contractDraftWriteSchema = z
  .object({
    templateKey: z.enum(CONTRACT_TEMPLATE_KEYS),
    expectedVersionId: identifierSchema,
    expectedCanonicalHash: canonicalHashSchema,
    clientRequestId: z
      .string()
      .uuid()
      .transform((value) => value.toLowerCase()),
    mode: z.enum(["PREVIEW", "FINAL"]).default("PREVIEW"),
    bindings: z.record(z.string().trim().min(1).max(160), z.unknown()).default({}),
    projectId: identifierSchema.nullish(),
  })
  .strict();

export const contractDraftListQuerySchema = z
  .object({
    projectId: identifierSchema.optional(),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_CONTRACT_DRAFT_LIST_LIMIT)
      .default(25),
    cursor: identifierSchema.optional(),
  })
  .strict();

export type ContractDraftWriteInput = z.infer<typeof contractDraftWriteSchema>;

interface ContractDraftDataEnvelope {
  readonly schemaVersion: 1;
  readonly template: {
    readonly key: string;
    readonly versionId: string;
    readonly canonicalHash: string;
    readonly catalogFingerprint: string;
  };
  readonly mode: "PREVIEW" | "FINAL";
  readonly bindings: Readonly<Record<string, unknown>>;
  readonly diagnostics: readonly BindingDiagnostic[];
}

interface BoundClausesEnvelope {
  readonly schemaVersion: 1;
  readonly sections: NonNullable<
    Exclude<
      ContractTemplateDocumentCompilation,
      { status: "BLOCKED" }
    >["binding"]["document"]
  >["sections"];
}

export interface PreparedContractDraft {
  readonly generationSchemaVersion: 1;
  readonly clientRequestId: string;
  readonly projectId: string | null;
  readonly template: ContractTemplateDefinition;
  readonly mode: "PREVIEW" | "FINAL";
  readonly title: string;
  readonly titleAr: string;
  readonly data: ContractDraftDataEnvelope;
  readonly boundClauses: BoundClausesEnvelope;
  readonly documentSpec: NonNullable<
    Exclude<
      ContractTemplateDocumentCompilation,
      { status: "BLOCKED" }
    >["document"]
  >;
  readonly contentHtml: string;
  readonly serialized: {
    readonly dataJson: string;
    readonly clausesJson: string;
    readonly documentSpecJson: string;
  };
  readonly storageBytes: number;
  readonly canonicalHash: string;
  readonly diagnostics: readonly BindingDiagnostic[];
}

export interface ContractDraftSafetyRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly templateId: string;
  readonly templateVersionId: string | null;
  readonly projectId: string | null;
  readonly title: string;
  readonly titleAr: string;
  readonly dataJson: string;
  readonly clausesJson: string;
  readonly contentHtml: string;
  readonly documentSpecJson: string | null;
  readonly canonicalHash: string | null;
  readonly legalReviewStatus: string;
  readonly counselReviewRequired: boolean;
  readonly isExecutable: boolean;
  readonly contentPdfPath: string | null;
  readonly status: string;
  readonly createdBy: string;
  readonly clientRequestId: string | null;
  readonly generationSchemaVersion: number;
  readonly generationMode: string | null;
  readonly diagnosticCount: number;
  readonly storageBytes: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly template: {
    readonly id: string;
    readonly workspaceId: string;
    readonly catalogKey: string | null;
    readonly canonicalHash: string | null;
    readonly lifecycle: string;
    readonly legalReviewStatus: string;
    readonly counselReviewRequired: boolean;
    readonly isApproved: boolean;
  };
  readonly templateVersion: {
    readonly id: string;
    readonly templateId: string;
    readonly version: string;
    readonly canonicalHash: string | null;
    readonly lifecycle: string;
    readonly legalReviewStatus: string;
    readonly counselReviewRequired: boolean;
  } | null;
}

interface ContractDraftSummarySafetyRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly templateId: string;
  readonly templateVersionId: string | null;
  readonly projectId: string | null;
  readonly title: string;
  readonly titleAr: string;
  readonly canonicalHash: string | null;
  readonly legalReviewStatus: string;
  readonly counselReviewRequired: boolean;
  readonly isExecutable: boolean;
  readonly contentPdfPath: string | null;
  readonly status: string;
  readonly clientRequestId: string | null;
  readonly generationSchemaVersion: number;
  readonly generationMode: string | null;
  readonly diagnosticCount: number;
  readonly storageBytes: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly template: ContractDraftSafetyRecord["template"];
  readonly templateVersion: ContractDraftSafetyRecord["templateVersion"];
}

export interface ContractDraftSummary {
  readonly id: string;
  readonly projectId: string | null;
  readonly templateKey: string;
  readonly templateVersionId: string;
  readonly templateCanonicalHash: string;
  readonly canonicalHash: string;
  readonly mode: "PREVIEW" | "FINAL";
  readonly title: string;
  readonly titleAr: string;
  readonly diagnosticCount: number;
  readonly legalReviewStatus: "UNREVIEWED";
  readonly counselReviewRequired: true;
  readonly isExecutable: false;
  readonly status: "draft";
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ContractDraftReadResult {
  readonly summary: ContractDraftSummary;
  readonly bindings: Readonly<Record<string, unknown>>;
  readonly diagnostics: readonly BindingDiagnostic[];
  readonly boundClauses: BoundClausesEnvelope;
  readonly documentSpec: PreparedContractDraft["documentSpec"];
  readonly contentHtml: string;
}

export class ContractDraftPersistenceError extends Error {
  constructor(
    message: string,
    readonly code:
      | "CONTRACT_TEMPLATE_NOT_FOUND"
      | "CONTRACT_TEMPLATE_STALE"
      | "CONTRACT_TEMPLATE_CATALOG_DRIFT"
      | "CONTRACT_TEMPLATE_BLOCKED"
      | "CONTRACT_TEMPLATE_PERSISTENCE_DRIFT"
      | "CONTRACT_DRAFT_PROJECT_NOT_FOUND"
      | "CONTRACT_DRAFT_WORKSPACE_NOT_FOUND"
      | "CONTRACT_DRAFT_IDEMPOTENCY_CONFLICT"
      | "CONTRACT_DRAFT_INTEGRITY_FAILED"
      | "CONTRACT_DRAFT_CONCURRENCY_CONFLICT"
      | "CONTRACT_DRAFT_OUTPUT_TOO_LARGE"
      | "CONTRACT_DRAFT_QUOTA_EXCEEDED"
      | "CONTRACT_DRAFT_CURSOR_NOT_FOUND"
      | "CONTRACT_DRAFT_NOT_FOUND",
    readonly status: 404 | 409 | 413 | 422 | 429 | 503,
    readonly diagnostics: readonly BindingDiagnostic[] = []
  ) {
    super(message);
    this.name = "ContractDraftPersistenceError";
  }
}

const contractDraftDataSchema = z
  .object({
    schemaVersion: z.literal(1),
    template: z
      .object({
        key: z.enum(CONTRACT_TEMPLATE_KEYS),
        versionId: identifierSchema,
        canonicalHash: canonicalHashSchema,
        catalogFingerprint: canonicalHashSchema,
      })
      .strict(),
    mode: z.enum(["PREVIEW", "FINAL"]),
    bindings: z.record(z.string(), z.unknown()),
    diagnostics: z.array(
      z
        .object({
          code: z.string(),
          severity: z.enum(["ERROR", "INFO"]),
          path: z.string(),
          variableKey: z.string().nullable(),
          message: z.string(),
        })
        .strict()
    ),
  })
  .strict();

const boundClausesSchema = z
  .object({
    schemaVersion: z.literal(1),
    sections: z.array(z.unknown()),
  })
  .strict();

function json(value: unknown): string {
  return JSON.stringify(value);
}

export function contractDraftSerializedBytes(input: {
  readonly dataJson: string;
  readonly clausesJson: string;
  readonly documentSpecJson: string;
  readonly contentHtml: string;
}): number {
  const encoder = new TextEncoder();
  return (
    encoder.encode(input.dataJson).byteLength +
    encoder.encode(input.clausesJson).byteLength +
    encoder.encode(input.documentSpecJson).byteLength +
    encoder.encode(input.contentHtml).byteLength
  );
}

export function assertContractDraftSerializedOutputBudget(
  input: Parameters<typeof contractDraftSerializedBytes>[0],
  maxBytes = MAX_CONTRACT_DRAFT_STORED_BYTES
): number {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new RangeError("Contract draft output budget must be positive.");
  }
  const storageBytes = contractDraftSerializedBytes(input);
  if (storageBytes > maxBytes) {
    throw new ContractDraftPersistenceError(
      `Compiled contract draft exceeds the ${maxBytes}-byte storage budget.`,
      "CONTRACT_DRAFT_OUTPUT_TOO_LARGE",
      413
    );
  }
  return storageBytes;
}

function contractDraftLimitsForPlan(
  plan: string
): ContractDraftWorkspaceLimits {
  const normalized = plan.trim().toUpperCase();
  return (
    CONTRACT_DRAFT_PLAN_LIMITS[
      normalized as keyof typeof CONTRACT_DRAFT_PLAN_LIMITS
    ] ?? CONTRACT_DRAFT_PLAN_LIMITS.STARTER
  );
}

function assertWorkspaceLimits(
  limits: ContractDraftWorkspaceLimits
): void {
  if (
    !Number.isSafeInteger(limits.maxActiveDrafts) ||
    limits.maxActiveDrafts < 1 ||
    !Number.isSafeInteger(limits.maxStorageBytes) ||
    limits.maxStorageBytes < MAX_CONTRACT_DRAFT_STORED_BYTES
  ) {
    throw new RangeError("Contract draft workspace limits are invalid.");
  }
}

function templateClauseDefinitions(template: ContractTemplateDefinition) {
  const definitions: ContractClauseDefinition[] = [];
  const seen = new Set<string>();
  for (const section of template.sections) {
    for (const clauseId of section.clauseIds) {
      if (seen.has(clauseId)) continue;
      const clause = getContractClause(clauseId);
      if (!clause) {
        throw new ContractDraftPersistenceError(
          `Catalog clause "${clauseId}" is missing.`,
          "CONTRACT_TEMPLATE_CATALOG_DRIFT",
          503
        );
      }
      const canonicalEntries = Object.entries(clause).filter(
        ([key]) => key !== "canonicalHash"
      );
      if (
        computeCanonicalHash(Object.fromEntries(canonicalEntries)) !==
        clause.canonicalHash
      ) {
        throw new ContractDraftPersistenceError(
          `Catalog clause "${clauseId}" failed its canonical hash check.`,
          "CONTRACT_TEMPLATE_CATALOG_DRIFT",
          503
        );
      }
      seen.add(clauseId);
      definitions.push(clause);
    }
  }
  return definitions;
}

function generatedCanonicalPayload(input: {
  readonly projectId: string | null;
  readonly title: string;
  readonly titleAr: string;
  readonly data: unknown;
  readonly boundClauses: unknown;
  readonly documentSpec: unknown;
  readonly contentHtml: string;
}) {
  return {
    schemaVersion: CONTRACT_DRAFT_GENERATION_SCHEMA_VERSION,
    metadata: {
      projectId: input.projectId,
      title: input.title,
      titleAr: input.titleAr,
    },
    data: input.data,
    boundClauses: input.boundClauses,
    documentSpec: input.documentSpec,
    contentHtml: input.contentHtml,
  };
}

const catalogFingerprintCache = new Map<string, string>();

function contractCatalogFingerprint(
  template: ContractTemplateDefinition
): string {
  const cacheKey = `${template.key}:${template.versionId}:${template.canonicalHash}`;
  const cached = catalogFingerprintCache.get(cacheKey);
  if (cached) return cached;
  const fingerprint = computeCanonicalHash({
    schemaVersion: 1,
    template: {
      key: template.key,
      versionId: template.versionId,
      canonicalHash: template.canonicalHash,
    },
    clauses: templateClauseDefinitions(template).map((clause) => ({
      id: clause.id,
      versionId: clause.versionId,
      canonicalHash: clause.canonicalHash,
    })),
  });
  catalogFingerprintCache.set(cacheKey, fingerprint);
  return fingerprint;
}

/**
 * Compile and canonicalize a draft entirely from the frozen server catalog.
 * FINAL only means every declared variable is complete; it never changes the
 * legal-review or executable state.
 */
export function prepareContractDraft(
  input: ContractDraftWriteInput
): PreparedContractDraft {
  const template = getContractTemplate(input.templateKey);
  if (!template) {
    throw new ContractDraftPersistenceError(
      "Unknown contract template.",
      "CONTRACT_TEMPLATE_NOT_FOUND",
      404
    );
  }
  if (computeContractTemplateHash(template) !== template.canonicalHash) {
    throw new ContractDraftPersistenceError(
      "The server contract-template catalog failed its canonical hash check.",
      "CONTRACT_TEMPLATE_CATALOG_DRIFT",
      503
    );
  }
  const catalogFingerprint = contractCatalogFingerprint(template);
  if (
    input.expectedVersionId !== template.versionId ||
    input.expectedCanonicalHash !== template.canonicalHash
  ) {
    throw new ContractDraftPersistenceError(
      "The selected contract template changed. Reload the catalog before saving.",
      "CONTRACT_TEMPLATE_STALE",
      409
    );
  }

  const compilation = compileContractTemplateDocument(
    template.key,
    input.bindings,
    { mode: input.mode }
  );
  if (
    compilation.status === "BLOCKED" ||
    compilation.document === null ||
    compilation.binding.document === null
  ) {
    throw new ContractDraftPersistenceError(
      "Contract-template compilation is blocked.",
      "CONTRACT_TEMPLATE_BLOCKED",
      422,
      compilation.diagnostics
    );
  }
  if (
    compilation.binding.document.template.versionId !== template.versionId ||
    compilation.binding.document.template.canonicalHash !==
      template.canonicalHash
  ) {
    throw new ContractDraftPersistenceError(
      "Compiled contract identity drifted from the server catalog.",
      "CONTRACT_TEMPLATE_CATALOG_DRIFT",
      503
    );
  }

  const data: ContractDraftDataEnvelope = {
    schemaVersion: 1,
    template: {
      key: template.key,
      versionId: template.versionId,
      canonicalHash: template.canonicalHash,
      catalogFingerprint,
    },
    mode: input.mode,
    bindings: input.bindings,
    diagnostics: compilation.diagnostics,
  };
  const boundClauses: BoundClausesEnvelope = {
    schemaVersion: 1,
    sections: compilation.binding.document.sections,
  };
  const title = `DRAFT — ${template.name.en}`;
  const titleAr = `مسودة — ${template.name.ar}`;
  const contentHtml = renderContractTemplateDocumentHTML(compilation);
  const serialized = {
    dataJson: json(data),
    clausesJson: json(boundClauses),
    documentSpecJson: json(compilation.document),
  };
  const storageBytes = assertContractDraftSerializedOutputBudget({
    ...serialized,
    contentHtml,
  });
  const canonicalHash = computeCanonicalHash(
    generatedCanonicalPayload({
      projectId: input.projectId ?? null,
      title,
      titleAr,
      data,
      boundClauses,
      documentSpec: compilation.document,
      contentHtml,
    })
  );

  return {
    generationSchemaVersion: CONTRACT_DRAFT_GENERATION_SCHEMA_VERSION,
    clientRequestId: input.clientRequestId,
    projectId: input.projectId ?? null,
    template,
    mode: input.mode,
    title,
    titleAr,
    data,
    boundClauses,
    documentSpec: compilation.document,
    contentHtml,
    serialized,
    storageBytes,
    canonicalHash,
    diagnostics: compilation.diagnostics,
  };
}

function templatePersistenceFields(template: ContractTemplateDefinition) {
  const clauses = templateClauseDefinitions(template);
  const catalogFingerprint = contractCatalogFingerprint(template);
  return {
    type: template.key,
    catalogKey: template.key,
    nameEn: template.name.en,
    nameAr: template.name.ar,
    descriptionEn: template.summary.en,
    descriptionAr: template.summary.ar,
    version: template.versionId,
    schemaVersion: template.schemaVersion,
    canonicalHash: template.canonicalHash,
    lifecycle: "DRAFT",
    legalReviewStatus: "UNREVIEWED",
    counselReviewRequired: true,
    sourceStatus: "PENDING_OFFICIAL_SOURCE_REVIEW",
    provenanceJson: json({
      schemaVersion: 1,
      catalog: "arabclue-contract-template-catalog",
      templateKey: template.key,
      templateVersionId: template.versionId,
      templateCanonicalHash: template.canonicalHash,
      catalogFingerprint,
      jurisdiction: template.jurisdiction,
      languagePolicy: template.languagePolicy,
      sourceStatus: "PENDING_OFFICIAL_SOURCE_REVIEW",
      legalReview: template.legalReview,
      disclaimer: template.disclaimer,
    }),
    status: "draft",
    sectionsJson: json(template.sections),
    variablesJson: json(template.variables),
    clausesJson: json(clauses),
    isSystem: true,
    isApproved: false,
  } as const;
}

function assertTemplatePersistenceIdentity(
  record: {
    readonly workspaceId: string;
    readonly type: string;
    readonly catalogKey: string | null;
    readonly nameEn: string;
    readonly nameAr: string;
    readonly descriptionEn: string | null;
    readonly descriptionAr: string | null;
    readonly version: string;
    readonly schemaVersion: number;
    readonly canonicalHash: string | null;
    readonly lifecycle: string;
    readonly legalReviewStatus: string;
    readonly counselReviewRequired: boolean;
    readonly sourceStatus: string;
    readonly provenanceJson: string | null;
    readonly status: string;
    readonly sectionsJson: string;
    readonly variablesJson: string;
    readonly clausesJson: string;
    readonly isSystem: boolean;
    readonly isApproved: boolean;
    readonly approvedBy: string | null;
    readonly approvedAt: Date | null;
  },
  workspaceId: string,
  template: ContractTemplateDefinition
): void {
  const expected = templatePersistenceFields(template);
  const comparisons: readonly [unknown, unknown][] = [
    [record.workspaceId, workspaceId],
    [record.type, expected.type],
    [record.catalogKey, expected.catalogKey],
    [record.nameEn, expected.nameEn],
    [record.nameAr, expected.nameAr],
    [record.descriptionEn, expected.descriptionEn],
    [record.descriptionAr, expected.descriptionAr],
    [record.version, expected.version],
    [record.schemaVersion, expected.schemaVersion],
    [record.canonicalHash, expected.canonicalHash],
    [record.lifecycle, expected.lifecycle],
    [record.legalReviewStatus, expected.legalReviewStatus],
    [record.counselReviewRequired, expected.counselReviewRequired],
    [record.sourceStatus, expected.sourceStatus],
    [record.provenanceJson, expected.provenanceJson],
    [record.status, expected.status],
    [record.sectionsJson, expected.sectionsJson],
    [record.variablesJson, expected.variablesJson],
    [record.clausesJson, expected.clausesJson],
    [record.isSystem, expected.isSystem],
    [record.isApproved, expected.isApproved],
    [record.approvedBy, null],
    [record.approvedAt, null],
  ];
  if (comparisons.some(([actual, wanted]) => actual !== wanted)) {
    throw new ContractDraftPersistenceError(
      "Persisted contract-template metadata differs from the frozen catalog.",
      "CONTRACT_TEMPLATE_PERSISTENCE_DRIFT",
      409
    );
  }
}

function assertVersionPersistenceIdentity(
  record: {
    readonly templateId: string;
    readonly version: string;
    readonly schemaVersion: number;
    readonly canonicalHash: string | null;
    readonly lifecycle: string;
    readonly legalReviewStatus: string;
    readonly counselReviewRequired: boolean;
    readonly sourceStatus: string;
    readonly provenanceJson: string | null;
    readonly sectionsJson: string;
    readonly variablesJson: string;
    readonly clausesJson: string;
  },
  templateId: string,
  template: ContractTemplateDefinition
): void {
  const expected = templatePersistenceFields(template);
  const comparisons: readonly [unknown, unknown][] = [
    [record.templateId, templateId],
    [record.version, expected.version],
    [record.schemaVersion, expected.schemaVersion],
    [record.canonicalHash, expected.canonicalHash],
    [record.lifecycle, expected.lifecycle],
    [record.legalReviewStatus, expected.legalReviewStatus],
    [record.counselReviewRequired, expected.counselReviewRequired],
    [record.sourceStatus, expected.sourceStatus],
    [record.provenanceJson, expected.provenanceJson],
    [record.sectionsJson, expected.sectionsJson],
    [record.variablesJson, expected.variablesJson],
    [record.clausesJson, expected.clausesJson],
  ];
  if (comparisons.some(([actual, wanted]) => actual !== wanted)) {
    throw new ContractDraftPersistenceError(
      "Persisted contract-template version differs from the frozen catalog.",
      "CONTRACT_TEMPLATE_PERSISTENCE_DRIFT",
      409
    );
  }
}

function parsePersistedDraft(record: ContractDraftSafetyRecord):
  | {
      readonly ok: true;
      readonly data: z.infer<typeof contractDraftDataSchema>;
      readonly boundClauses: BoundClausesEnvelope;
      readonly documentSpec: PreparedContractDraft["documentSpec"];
      readonly template: ContractTemplateDefinition;
    }
  | { readonly ok: false } {
  const summaryTemplate = parsePersistedSummary(record);
  if (
    summaryTemplate === null ||
    record.documentSpecJson === null ||
    record.canonicalHash === null
  ) {
    return { ok: false };
  }
  const templateVersion = record.templateVersion;
  if (templateVersion === null) return { ok: false };

  try {
    const data = contractDraftDataSchema.parse(JSON.parse(record.dataJson));
    const boundClauses = boundClausesSchema.parse(
      JSON.parse(record.clausesJson)
    ) as BoundClausesEnvelope;
    const documentSpec = parseBilingualDocument(
      JSON.parse(record.documentSpecJson)
    );
    if (
      data.mode !== record.generationMode ||
      data.diagnostics.length !== record.diagnosticCount ||
      data.template.key !== record.template.catalogKey ||
      data.template.versionId !== templateVersion.version ||
      data.template.canonicalHash !== record.template.canonicalHash ||
      data.template.canonicalHash !== templateVersion.canonicalHash ||
      data.template.catalogFingerprint !==
        contractCatalogFingerprint(summaryTemplate) ||
      contractDraftSerializedBytes({
        dataJson: record.dataJson,
        clausesJson: record.clausesJson,
        documentSpecJson: record.documentSpecJson,
        contentHtml: record.contentHtml,
      }) !== record.storageBytes ||
      !record.contentHtml.includes("UNREVIEWED") ||
      !record.contentHtml.includes("غير مراجع")
    ) {
      return { ok: false };
    }
    const canonicalHash = computeCanonicalHash(
      generatedCanonicalPayload({
        projectId: record.projectId,
        title: record.title,
        titleAr: record.titleAr,
        data,
        boundClauses,
        documentSpec,
        contentHtml: record.contentHtml,
      })
    );
    if (canonicalHash !== record.canonicalHash) return { ok: false };
    return {
      ok: true,
      data,
      boundClauses,
      documentSpec,
      template: summaryTemplate,
    };
  } catch {
    return { ok: false };
  }
}

function parsePersistedSummary(
  record: ContractDraftSummarySafetyRecord
): ContractTemplateDefinition | null {
  if (
    record.generationSchemaVersion !==
      CONTRACT_DRAFT_GENERATION_SCHEMA_VERSION ||
    record.clientRequestId === null ||
    record.templateVersionId === null ||
    (record.generationMode !== "PREVIEW" &&
      record.generationMode !== "FINAL") ||
    !Number.isSafeInteger(record.diagnosticCount) ||
    record.diagnosticCount < 0 ||
    !Number.isSafeInteger(record.storageBytes) ||
    record.storageBytes < 1 ||
    record.storageBytes > MAX_CONTRACT_DRAFT_STORED_BYTES ||
    record.canonicalHash === null ||
    !/^sha256:[a-f0-9]{64}$/u.test(record.canonicalHash) ||
    record.status !== "draft" ||
    record.legalReviewStatus !== "UNREVIEWED" ||
    record.counselReviewRequired !== true ||
    record.isExecutable !== false ||
    record.contentPdfPath !== null ||
    record.template.workspaceId !== record.workspaceId ||
    record.template.catalogKey === null ||
    record.template.canonicalHash === null ||
    record.template.lifecycle !== "DRAFT" ||
    record.template.legalReviewStatus !== "UNREVIEWED" ||
    record.template.counselReviewRequired !== true ||
    record.template.isApproved !== false ||
    record.templateVersion === null ||
    record.templateVersion.id !== record.templateVersionId ||
    record.templateVersion.templateId !== record.templateId ||
    record.templateVersion.lifecycle !== "DRAFT" ||
    record.templateVersion.legalReviewStatus !== "UNREVIEWED" ||
    record.templateVersion.counselReviewRequired !== true ||
    record.templateVersion.canonicalHash === null
  ) {
    return null;
  }
  const currentTemplate = getContractTemplate(record.template.catalogKey);
  if (
    !currentTemplate ||
    computeContractTemplateHash(currentTemplate) !==
      currentTemplate.canonicalHash ||
    currentTemplate.versionId !== record.templateVersion.version ||
    currentTemplate.canonicalHash !== record.template.canonicalHash ||
    currentTemplate.canonicalHash !== record.templateVersion.canonicalHash ||
    record.title !== `DRAFT — ${currentTemplate.name.en}` ||
    record.titleAr !== `مسودة — ${currentTemplate.name.ar}`
  ) {
    return null;
  }
  return currentTemplate;
}

export function validatePersistedContractDraft(
  record: ContractDraftSafetyRecord
): boolean {
  return parsePersistedDraft(record).ok;
}

function toSummary(
  record: Pick<
    ContractDraftSummarySafetyRecord,
    | "id"
    | "projectId"
    | "canonicalHash"
    | "generationMode"
    | "diagnosticCount"
    | "createdAt"
    | "updatedAt"
  >,
  template: ContractTemplateDefinition
): ContractDraftSummary {
  return {
    id: record.id,
    projectId: record.projectId,
    templateKey: template.key,
    templateVersionId: template.versionId,
    templateCanonicalHash: template.canonicalHash,
    canonicalHash: record.canonicalHash as string,
    mode: record.generationMode as "PREVIEW" | "FINAL",
    title: `DRAFT — ${template.name.en}`,
    titleAr: `مسودة — ${template.name.ar}`,
    diagnosticCount: record.diagnosticCount,
    legalReviewStatus: "UNREVIEWED",
    counselReviewRequired: true,
    isExecutable: false,
    status: "draft",
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

const contractDraftInclude = {
  template: {
    select: {
      id: true,
      workspaceId: true,
      catalogKey: true,
      canonicalHash: true,
      lifecycle: true,
      legalReviewStatus: true,
      counselReviewRequired: true,
      isApproved: true,
    },
  },
  templateVersion: {
    select: {
      id: true,
      templateId: true,
      version: true,
      canonicalHash: true,
      lifecycle: true,
      legalReviewStatus: true,
      counselReviewRequired: true,
    },
  },
} as const;

const contractDraftSummarySelect = {
  id: true,
  workspaceId: true,
  templateId: true,
  templateVersionId: true,
  projectId: true,
  title: true,
  titleAr: true,
  canonicalHash: true,
  legalReviewStatus: true,
  counselReviewRequired: true,
  isExecutable: true,
  contentPdfPath: true,
  status: true,
  clientRequestId: true,
  generationSchemaVersion: true,
  generationMode: true,
  diagnosticCount: true,
  storageBytes: true,
  createdAt: true,
  updatedAt: true,
  template: contractDraftInclude.template,
  templateVersion: contractDraftInclude.templateVersion,
} as const;

async function findIdempotentDraft(
  workspaceId: string,
  clientRequestId: string,
  database: PrismaClient
) {
  return database.generatedContract.findUnique({
    where: {
      workspaceId_clientRequestId: { workspaceId, clientRequestId },
    },
    include: contractDraftInclude,
  });
}

function resolveIdempotentDraft(
  record: ContractDraftSafetyRecord,
  prepared: PreparedContractDraft,
  userId: string
): { readonly created: false; readonly draft: ContractDraftSummary } {
  const parsed = parsePersistedDraft(record);
  if (
    !parsed.ok ||
    record.createdBy !== userId ||
    record.canonicalHash !== prepared.canonicalHash ||
    record.projectId !== prepared.projectId
  ) {
    throw new ContractDraftPersistenceError(
      "The idempotency key is already bound to a different contract draft.",
      "CONTRACT_DRAFT_IDEMPOTENCY_CONFLICT",
      409
    );
  }
  return { created: false, draft: toSummary(record, prepared.template) };
}

export async function persistPreparedContractDraft(
  input: {
    readonly workspaceId: string;
    readonly userId: string;
    readonly prepared: PreparedContractDraft;
    readonly ipAddress?: string;
    readonly userAgent?: string;
  },
  database: PrismaClient = db
): Promise<{
  readonly created: boolean;
  readonly draft: ContractDraftSummary;
}> {
  const templateFields = templatePersistenceFields(input.prepared.template);
  const runTransaction = () =>
    database.$transaction(
      async (tx) => {
        const workspace = await tx.workspace.findUnique({
          where: { id: input.workspaceId },
          select: { id: true, plan: true },
        });
        if (!workspace) {
          throw new ContractDraftPersistenceError(
            "Workspace not found.",
            "CONTRACT_DRAFT_WORKSPACE_NOT_FOUND",
            404
          );
        }
        if (
          input.prepared.projectId !== null &&
          !(await tx.tenderProject.findFirst({
            where: {
              id: input.prepared.projectId,
              workspaceId: input.workspaceId,
            },
            select: { id: true },
          }))
        ) {
          throw new ContractDraftPersistenceError(
            "Tender project not found.",
            "CONTRACT_DRAFT_PROJECT_NOT_FOUND",
            404
          );
        }

        const template = await tx.contractTemplate.upsert({
          where: {
            workspaceId_catalogKey: {
              workspaceId: input.workspaceId,
              catalogKey: input.prepared.template.key,
            },
          },
          create: {
            workspaceId: input.workspaceId,
            ...templateFields,
            createdBy: input.userId,
          },
          update: {},
        });
        assertTemplatePersistenceIdentity(
          template,
          input.workspaceId,
          input.prepared.template
        );

        const version = await tx.contractTemplateVersion.upsert({
          where: {
            templateId_version: {
              templateId: template.id,
              version: input.prepared.template.versionId,
            },
          },
          create: {
            templateId: template.id,
            version: input.prepared.template.versionId,
            schemaVersion: templateFields.schemaVersion,
            canonicalHash: templateFields.canonicalHash,
            lifecycle: "DRAFT",
            legalReviewStatus: "UNREVIEWED",
            counselReviewRequired: true,
            sourceStatus: templateFields.sourceStatus,
            provenanceJson: templateFields.provenanceJson,
            sectionsJson: templateFields.sectionsJson,
            variablesJson: templateFields.variablesJson,
            clausesJson: templateFields.clausesJson,
            changeNote:
              "Pinned from the frozen Phase 3 draft catalog; legal review remains required.",
            createdBy: input.userId,
          },
          update: {},
        });
        assertVersionPersistenceIdentity(
          version,
          template.id,
          input.prepared.template
        );

        const existing = await tx.generatedContract.findUnique({
          where: {
            workspaceId_clientRequestId: {
              workspaceId: input.workspaceId,
              clientRequestId: input.prepared.clientRequestId,
            },
          },
          include: contractDraftInclude,
        });
        if (existing) {
          return resolveIdempotentDraft(
            existing,
            input.prepared,
            input.userId
          );
        }

        const limits = contractDraftLimitsForPlan(workspace.plan);
        assertWorkspaceLimits(limits);
        const usage = await tx.generatedContract.aggregate({
          where: {
            workspaceId: input.workspaceId,
            generationSchemaVersion:
              CONTRACT_DRAFT_GENERATION_SCHEMA_VERSION,
            status: "draft",
          },
          _count: { _all: true },
          _sum: { storageBytes: true },
        });
        const activeDrafts = usage._count._all;
        const storageBytes = usage._sum.storageBytes ?? 0;
        if (
          activeDrafts >= limits.maxActiveDrafts ||
          storageBytes + input.prepared.storageBytes >
            limits.maxStorageBytes
        ) {
          throw new ContractDraftPersistenceError(
            `The ${workspace.plan} workspace contract-draft quota is exhausted.`,
            "CONTRACT_DRAFT_QUOTA_EXCEEDED",
            429
          );
        }

        const created = await tx.generatedContract.create({
          data: {
            workspaceId: input.workspaceId,
            templateId: template.id,
            templateVersionId: version.id,
            projectId: input.prepared.projectId,
            title: input.prepared.title,
            titleAr: input.prepared.titleAr,
            dataJson: input.prepared.serialized.dataJson,
            clausesJson: input.prepared.serialized.clausesJson,
            contentHtml: input.prepared.contentHtml,
            documentSpecJson:
              input.prepared.serialized.documentSpecJson,
            canonicalHash: input.prepared.canonicalHash,
            legalReviewStatus: "UNREVIEWED",
            counselReviewRequired: true,
            isExecutable: false,
            contentPdfPath: null,
            status: "draft",
            createdBy: input.userId,
            clientRequestId: input.prepared.clientRequestId,
            generationSchemaVersion:
              CONTRACT_DRAFT_GENERATION_SCHEMA_VERSION,
            generationMode: input.prepared.mode,
            diagnosticCount: input.prepared.diagnostics.length,
            storageBytes: input.prepared.storageBytes,
          },
          include: contractDraftInclude,
        });
        const parsed = parsePersistedDraft(created);
        if (!parsed.ok) {
          throw new ContractDraftPersistenceError(
            "The generated contract failed its post-write integrity check.",
            "CONTRACT_DRAFT_INTEGRITY_FAILED",
            503
          );
        }

        await tx.auditLog.create({
          data: {
            userId: input.userId,
            action: AUDIT_ACTIONS.CONTRACT_DRAFT_CREATE,
            resource: "GeneratedContract",
            resourceId: created.id,
            details: json({
              workspaceId: input.workspaceId,
              projectId: input.prepared.projectId,
              templateKey: input.prepared.template.key,
              templateVersionId: input.prepared.template.versionId,
              templateCanonicalHash: input.prepared.template.canonicalHash,
              generatedCanonicalHash: input.prepared.canonicalHash,
              mode: input.prepared.mode,
              diagnosticCount: input.prepared.diagnostics.length,
              storageBytes: input.prepared.storageBytes,
              lifecycle: "DRAFT",
              legalReviewStatus: "UNREVIEWED",
              counselReviewRequired: true,
              isExecutable: false,
            }),
            ipAddress: input.ipAddress?.slice(0, 512) ?? null,
            userAgent: input.userAgent?.slice(0, 1_024) ?? null,
            severity: "INFO",
            success: true,
          },
        });

        // Create initial contract version for version history (Req 7)
        await createContractVersion(
          {
            contractId: created.id,
            bindings: input.prepared.data.bindings,
            documentSpec: input.prepared.documentSpec,
            contentHtml: input.prepared.contentHtml,
            createdBy: input.userId,
          },
          tx as unknown as PrismaClient
        );

        return {
          created: true as const,
          draft: toSummary(created, input.prepared.template),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await runTransaction();
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034"
      ) {
        if (attempt === 0) continue;
        throw new ContractDraftPersistenceError(
          "Contract draft changed concurrently. Retry with the same request id.",
          "CONTRACT_DRAFT_CONCURRENCY_CONFLICT",
          409
        );
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const existing = await findIdempotentDraft(
          input.workspaceId,
          input.prepared.clientRequestId,
          database
        );
        if (existing) {
          return resolveIdempotentDraft(
            existing,
            input.prepared,
            input.userId
          );
        }
        if (attempt === 0) continue;
        throw new ContractDraftPersistenceError(
          "Contract draft changed concurrently. Retry with the same request id.",
          "CONTRACT_DRAFT_CONCURRENCY_CONFLICT",
          409
        );
      }
      throw error;
    }
  }
  throw new ContractDraftPersistenceError(
    "Contract draft changed concurrently. Retry with the same request id.",
    "CONTRACT_DRAFT_CONCURRENCY_CONFLICT",
    409
  );
}

/**
 * Delete an unreviewed, non-executable catalog draft so active-count and
 * storage quotas are recoverable. The tenant-scoped deletion and audit append
 * commit atomically.
 */
export async function deletePersistedContractDraft(
  input: {
    readonly workspaceId: string;
    readonly userId: string;
    readonly id: string;
    readonly ipAddress?: string;
    readonly userAgent?: string;
  },
  database: PrismaClient = db
): Promise<{
  readonly deletedId: string;
  readonly releasedStorageBytes: number;
}> {
  const runTransaction = () =>
    database.$transaction(
      async (tx) => {
        const record = await tx.generatedContract.findFirst({
          where: {
            id: input.id,
            workspaceId: input.workspaceId,
            generationSchemaVersion:
              CONTRACT_DRAFT_GENERATION_SCHEMA_VERSION,
            status: "draft",
            legalReviewStatus: "UNREVIEWED",
            counselReviewRequired: true,
            isExecutable: false,
            contentPdfPath: null,
          },
          select: { id: true, storageBytes: true },
        });
        if (!record) {
          throw new ContractDraftPersistenceError(
            "Contract draft not found.",
            "CONTRACT_DRAFT_NOT_FOUND",
            404
          );
        }

        await tx.auditLog.create({
          data: {
            userId: input.userId,
            action: AUDIT_ACTIONS.CONTRACT_DRAFT_DELETE,
            resource: "GeneratedContract",
            resourceId: record.id,
            details: json({
              workspaceId: input.workspaceId,
              generationSchemaVersion:
                CONTRACT_DRAFT_GENERATION_SCHEMA_VERSION,
              releasedStorageBytes: Math.max(0, record.storageBytes),
              lifecycle: "DRAFT",
              legalReviewStatus: "UNREVIEWED",
              isExecutable: false,
            }),
            ipAddress: input.ipAddress?.slice(0, 512) ?? null,
            userAgent: input.userAgent?.slice(0, 1_024) ?? null,
            severity: "INFO",
            success: true,
          },
        });
        const deleted = await tx.generatedContract.deleteMany({
          where: {
            id: record.id,
            workspaceId: input.workspaceId,
            generationSchemaVersion:
              CONTRACT_DRAFT_GENERATION_SCHEMA_VERSION,
            status: "draft",
            legalReviewStatus: "UNREVIEWED",
            counselReviewRequired: true,
            isExecutable: false,
            contentPdfPath: null,
          },
        });
        if (deleted.count !== 1) {
          throw new ContractDraftPersistenceError(
            "Contract draft changed concurrently.",
            "CONTRACT_DRAFT_CONCURRENCY_CONFLICT",
            409
          );
        }
        return {
          deletedId: record.id,
          releasedStorageBytes: Math.max(0, record.storageBytes),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await runTransaction();
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034"
      ) {
        if (attempt === 0) continue;
        throw new ContractDraftPersistenceError(
          "Contract draft changed concurrently.",
          "CONTRACT_DRAFT_CONCURRENCY_CONFLICT",
          409
        );
      }
      throw error;
    }
  }
  throw new ContractDraftPersistenceError(
    "Contract draft changed concurrently.",
    "CONTRACT_DRAFT_CONCURRENCY_CONFLICT",
    409
  );
}

export async function listPersistedContractDrafts(
  input: {
    readonly workspaceId: string;
    readonly projectId?: string;
    readonly limit: number;
    readonly cursor?: string;
  },
  database: PrismaClient = db
): Promise<{
  readonly drafts: readonly ContractDraftSummary[];
  readonly integrityFailures: number;
  readonly nextCursor: string | null;
}> {
  const baseWhere: Prisma.GeneratedContractWhereInput = {
    workspaceId: input.workspaceId,
    generationSchemaVersion: CONTRACT_DRAFT_GENERATION_SCHEMA_VERSION,
    status: "draft",
    legalReviewStatus: "UNREVIEWED",
    counselReviewRequired: true,
    isExecutable: false,
    ...(input.projectId ? { projectId: input.projectId } : {}),
  };
  let cursorPosition: { readonly id: string; readonly createdAt: Date } | null =
    null;
  if (input.cursor) {
    cursorPosition = await database.generatedContract.findFirst({
      where: { ...baseWhere, id: input.cursor },
      select: { id: true, createdAt: true },
    });
    if (!cursorPosition) {
      throw new ContractDraftPersistenceError(
        "Contract draft cursor not found.",
        "CONTRACT_DRAFT_CURSOR_NOT_FOUND",
        404
      );
    }
  }
  const records = await database.generatedContract.findMany({
    where: {
      ...baseWhere,
      ...(cursorPosition
        ? {
            OR: [
              { createdAt: { lt: cursorPosition.createdAt } },
              {
                createdAt: cursorPosition.createdAt,
                id: { lt: cursorPosition.id },
              },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: input.limit + 1,
    select: contractDraftSummarySelect,
  });
  const pageRecords = records.slice(0, input.limit);
  const drafts: ContractDraftSummary[] = [];
  let integrityFailures = 0;
  for (const record of pageRecords) {
    const template = parsePersistedSummary(record);
    if (!template) {
      integrityFailures += 1;
      continue;
    }
    drafts.push(toSummary(record, template));
  }
  return {
    drafts,
    integrityFailures,
    nextCursor:
      records.length > input.limit
        ? (pageRecords.at(-1)?.id ?? null)
        : null,
  };
}

export async function loadPersistedContractDraft(
  input: {
    readonly workspaceId: string;
    readonly id: string;
  },
  database: PrismaClient = db
): Promise<ContractDraftReadResult | null> {
  const record = await database.generatedContract.findFirst({
    where: { id: input.id, workspaceId: input.workspaceId },
    include: contractDraftInclude,
  });
  if (!record) return null;
  const parsed = parsePersistedDraft(record);
  if (!parsed.ok) {
    throw new ContractDraftPersistenceError(
      "Stored contract draft failed its integrity check.",
      "CONTRACT_DRAFT_INTEGRITY_FAILED",
      409
    );
  }
  return {
    summary: toSummary(record, parsed.template),
    bindings: parsed.data.bindings,
    diagnostics: parsed.data.diagnostics as readonly BindingDiagnostic[],
    boundClauses: parsed.boundClauses,
    documentSpec: parsed.documentSpec,
    contentHtml: record.contentHtml,
  };
}
