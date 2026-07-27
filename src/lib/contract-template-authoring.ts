/**
 * Contract Template Authoring and Versioning (Req 6).
 *
 * Workspace-defined contract templates with bilingual content,
 * typed variables, clause bindings, and immutable version history.
 *
 * The canonical content model, its bounds, its canonical serialization, and
 * every pure validation rule live in `contract-template-schema.ts`. This module
 * owns persistence only: it converts one validation failure into the shared
 * bilingual failure contract and writes the forced legal-safety values that
 * criterion 6.7 requires.
 */

import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { ApiError } from "./api-controller";
import {
  parseWorkspaceTemplateContent,
  parseWorkspaceTemplateSubmission,
  templateKeyInUseFailure,
  workspaceTemplateUpdateSchema,
  type AcceptedWorkspaceTemplateContent,
  type AcceptedWorkspaceTemplateSubmission,
  type WorkspaceTemplateClauseBinding,
  type WorkspaceTemplateSection,
  type WorkspaceTemplateValidationFailure,
  type WorkspaceTemplateVariable,
} from "./contract-template-schema";

export {
  TEMPLATE_CONTENT_SCHEMA_VERSION,
  TEMPLATE_FIELD_BOUNDS,
  TEMPLATE_KEY_MAX_LENGTH,
  TEMPLATE_KEY_MIN_LENGTH,
  TEMPLATE_KEY_REGEX,
  WORKSPACE_TEMPLATE_SAFETY,
  WORKSPACE_TEMPLATE_VARIABLE_TYPES,
  isReservedTemplateKey,
  parseWorkspaceTemplateContent,
  parseWorkspaceTemplateSubmission,
  workspaceTemplateCanonicalHash,
  workspaceTemplateSubmissionSchema,
  workspaceTemplateUpdateSchema,
} from "./contract-template-schema";
export type {
  AcceptedWorkspaceTemplateContent,
  AcceptedWorkspaceTemplateSubmission,
  WorkspaceTemplateClauseBinding,
  WorkspaceTemplateContent,
  WorkspaceTemplateNode,
  WorkspaceTemplateSection,
  WorkspaceTemplateSubmissionInput,
  WorkspaceTemplateUpdateInput,
  WorkspaceTemplateVariable,
  WorkspaceTemplateVariableType,
} from "./contract-template-schema";

// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────

export const MAX_TEMPLATE_LIST_LIMIT = 50;
export const MAX_TEMPLATE_VERSION_LIST_LIMIT = 50;

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface WorkspaceTemplateSummary {
  readonly id: string;
  readonly key: string;
  readonly titleAr: string;
  readonly titleEn: string;
  readonly version: string;
  readonly canonicalHash: string;
  readonly lifecycle: string;
  readonly legalReviewStatus: string;
  readonly counselReviewRequired: boolean;
  readonly isExecutable: boolean;
  readonly isSystem: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface WorkspaceTemplateVersionSummary {
  readonly id: string;
  readonly version: string;
  readonly canonicalHash: string;
  readonly lifecycle: string;
  readonly legalReviewStatus: string;
  readonly counselReviewRequired: boolean;
  readonly isExecutable: boolean;
  readonly changeNote: string | null;
  readonly createdAt: string;
}

export interface WorkspaceTemplateVersionContent {
  readonly id: string;
  readonly version: string;
  readonly canonicalHash: string;
  readonly lifecycle: string;
  readonly legalReviewStatus: string;
  readonly counselReviewRequired: boolean;
  readonly isExecutable: boolean;
  readonly sections: readonly WorkspaceTemplateSection[];
  readonly variables: readonly WorkspaceTemplateVariable[];
  readonly clauseBindings: readonly WorkspaceTemplateClauseBinding[];
  readonly changeNote: string | null;
  readonly createdAt: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Route query schemas
// ────────────────────────────────────────────────────────────────────────────

export const workspaceTemplateListQuerySchema = z
  .object({
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_TEMPLATE_LIST_LIMIT)
      .default(25),
    cursor: z.string().trim().min(1).max(100).optional(),
    lifecycle: z.enum(["DRAFT", "PUBLISHED", "RETIRED"]).optional(),
  })
  .strict();

export const workspaceTemplateVersionListQuerySchema = z
  .object({
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_TEMPLATE_VERSION_LIST_LIMIT)
      .default(25),
    cursor: z.string().trim().min(1).max(100).optional(),
  })
  .strict();

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function json(value: unknown): string {
  return JSON.stringify(value);
}

function advanceVersion(current: string): string {
  const parts = current.split(".");
  if (parts.length === 2) {
    const major = parseInt(parts[0], 10);
    const minor = parseInt(parts[1], 10);
    if (!isNaN(major) && !isNaN(minor)) {
      return `${major}.${minor + 1}`;
    }
  }
  return `${current}.1`;
}

// ────────────────────────────────────────────────────────────────────────────
// Validation bridge
// ────────────────────────────────────────────────────────────────────────────

/**
 * Converts one pure validation failure into the shared bilingual failure
 * contract. The code, status, offending field paths, and interpolation values
 * all come from the pure validator, so no message literal is created here.
 */
function templateValidationError(
  failure: WorkspaceTemplateValidationFailure
): ApiError {
  return new ApiError(failure.code, failure.status, failure.code, {
    fieldPaths: failure.fieldPaths,
    values: failure.values,
  });
}

/** Accepted canonical create submission, or the stable validation failure. */
export function validateWorkspaceTemplateSubmission(
  input: unknown
): AcceptedWorkspaceTemplateSubmission {
  const result = parseWorkspaceTemplateSubmission(input);
  if (!result.ok) throw templateValidationError(result.failure);
  return result.value;
}

/** Accepted canonical content for an update or a stored-version re-read. */
export function validateWorkspaceTemplateContent(
  input: unknown
): AcceptedWorkspaceTemplateContent {
  const result = parseWorkspaceTemplateContent(input);
  if (!result.ok) throw templateValidationError(result.failure);
  return result.value;
}

// ────────────────────────────────────────────────────────────────────────────
// CRUD Operations
// ────────────────────────────────────────────────────────────────────────────

export async function createWorkspaceTemplate(
  input: {
    readonly workspaceId: string;
    readonly userId: string;
    readonly submission: unknown;
  },
  database: PrismaClient = db
): Promise<WorkspaceTemplateSummary> {
  const submission = validateWorkspaceTemplateSubmission(input.submission);
  const { content, canonicalHash, safety } = submission;

  const result = await database.$transaction(
    async (tx) => {
      // Check for existing template with same key
      const existing = await tx.contractTemplate.findFirst({
        where: {
          workspaceId: input.workspaceId,
          catalogKey: submission.key,
        },
        select: { id: true },
      });

      if (existing) {
        // Criterion 6.13 — the code, status, and offending field path come from
        // the pure contract so this branch restates nothing.
        throw templateValidationError(templateKeyInUseFailure(submission.key));
      }

      // Create template
      const template = await tx.contractTemplate.create({
        data: {
          workspaceId: input.workspaceId,
          type: "WORKSPACE_CUSTOM",
          catalogKey: submission.key,
          nameEn: submission.titleEn,
          nameAr: submission.titleAr,
          descriptionEn: null,
          descriptionAr: null,
          version: "1.0",
          schemaVersion: content.schemaVersion,
          canonicalHash,
          lifecycle: "DRAFT",
          legalReviewStatus: safety.legalReviewStatus,
          counselReviewRequired: safety.counselReviewRequired,
          isExecutable: safety.isExecutable,
          sourceStatus: "WORKSPACE_AUTHORED",
          provenanceJson: json({
            schemaVersion: content.schemaVersion,
            source: "workspace-authoring",
            workspaceId: input.workspaceId,
            createdBy: input.userId,
          }),
          status: "draft",
          sectionsJson: json(content.sections),
          variablesJson: json(content.variables),
          clausesJson: json(content.clauseBindings),
          isSystem: false,
          isApproved: false,
          createdBy: input.userId,
        },
      });

      // Create initial version
      await tx.contractTemplateVersion.create({
        data: {
          templateId: template.id,
          version: "1.0",
          schemaVersion: content.schemaVersion,
          canonicalHash,
          lifecycle: "DRAFT",
          legalReviewStatus: safety.legalReviewStatus,
          counselReviewRequired: safety.counselReviewRequired,
          isExecutable: safety.isExecutable,
          sourceStatus: "WORKSPACE_AUTHORED",
          provenanceJson: json({
            schemaVersion: content.schemaVersion,
            source: "workspace-authoring",
            workspaceId: input.workspaceId,
            createdBy: input.userId,
            initialVersion: true,
          }),
          sectionsJson: json(content.sections),
          variablesJson: json(content.variables),
          clausesJson: json(content.clauseBindings),
          changeNote: "Initial version",
          createdBy: input.userId,
        },
      });

      return template;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );

  return {
    id: result.id,
    key: result.catalogKey ?? result.type,
    titleAr: result.nameAr,
    titleEn: result.nameEn,
    version: result.version,
    canonicalHash: result.canonicalHash ?? "",
    lifecycle: result.lifecycle,
    legalReviewStatus: result.legalReviewStatus,
    counselReviewRequired: result.counselReviewRequired,
    isExecutable: result.isExecutable,
    isSystem: result.isSystem,
    createdAt: result.createdAt.toISOString(),
    updatedAt: result.updatedAt.toISOString(),
  };
}

export async function updateWorkspaceTemplate(
  input: {
    readonly workspaceId: string;
    readonly userId: string;
    readonly templateId: string;
    readonly update: z.infer<typeof workspaceTemplateUpdateSchema>;
  },
  database: PrismaClient = db
): Promise<WorkspaceTemplateSummary> {
  const result = await database.$transaction(
    async (tx) => {
      const template = await tx.contractTemplate.findFirst({
        where: {
          id: input.templateId,
          workspaceId: input.workspaceId,
          isSystem: false,
        },
      });

      if (!template) {
        throw new ApiError("Template not found", 404, "TEMPLATE_NOT_FOUND");
      }

      if (template.lifecycle === "RETIRED") {
        throw new ApiError(
          "Cannot update a retired template",
          400,
          "TEMPLATE_RETIRED"
        );
      }

      // Merge the submitted fields over the stored content, then validate the
      // merged result so a partial update cannot bypass a content rule.
      const merged = validateWorkspaceTemplateContent({
        sections:
          input.update.sections ??
          (JSON.parse(template.sectionsJson) as WorkspaceTemplateSection[]),
        variables:
          input.update.variables ??
          (JSON.parse(template.variablesJson) as WorkspaceTemplateVariable[]),
        clauseBindings:
          input.update.clauseBindings ??
          (JSON.parse(
            template.clausesJson
          ) as WorkspaceTemplateClauseBinding[]),
      });
      const { content, canonicalHash, safety } = merged;
      const newTitleAr = input.update.titleAr ?? template.nameAr;
      const newTitleEn = input.update.titleEn ?? template.nameEn;

      // Compute new version
      const newVersion = advanceVersion(template.version);

      // Create new version row (retain earlier versions)
      await tx.contractTemplateVersion.create({
        data: {
          templateId: template.id,
          version: newVersion,
          schemaVersion: content.schemaVersion,
          canonicalHash,
          lifecycle: "DRAFT",
          legalReviewStatus: safety.legalReviewStatus,
          counselReviewRequired: safety.counselReviewRequired,
          isExecutable: safety.isExecutable,
          sourceStatus: "WORKSPACE_AUTHORED",
          provenanceJson: json({
            schemaVersion: content.schemaVersion,
            source: "workspace-authoring",
            workspaceId: input.workspaceId,
            updatedBy: input.userId,
            previousVersion: template.version,
          }),
          sectionsJson: json(content.sections),
          variablesJson: json(content.variables),
          clausesJson: json(content.clauseBindings),
          changeNote: input.update.changeNote ?? null,
          createdBy: input.userId,
        },
      });

      // Update template to point to new version
      const updated = await tx.contractTemplate.update({
        where: { id: template.id },
        data: {
          nameAr: newTitleAr,
          nameEn: newTitleEn,
          version: newVersion,
          canonicalHash,
          legalReviewStatus: safety.legalReviewStatus,
          counselReviewRequired: safety.counselReviewRequired,
          isExecutable: safety.isExecutable,
          sectionsJson: json(content.sections),
          variablesJson: json(content.variables),
          clausesJson: json(content.clauseBindings),
        },
      });

      return updated;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );

  return {
    id: result.id,
    key: result.catalogKey ?? result.type,
    titleAr: result.nameAr,
    titleEn: result.nameEn,
    version: result.version,
    canonicalHash: result.canonicalHash ?? "",
    lifecycle: result.lifecycle,
    legalReviewStatus: result.legalReviewStatus,
    counselReviewRequired: result.counselReviewRequired,
    isExecutable: result.isExecutable,
    isSystem: result.isSystem,
    createdAt: result.createdAt.toISOString(),
    updatedAt: result.updatedAt.toISOString(),
  };
}

export async function deleteWorkspaceTemplate(
  input: {
    readonly workspaceId: string;
    readonly templateId: string;
  },
  database: PrismaClient = db
): Promise<{ readonly id: string; readonly lifecycle: "RETIRED" }> {
  const result = await database.$transaction(
    async (tx) => {
      const template = await tx.contractTemplate.findFirst({
        where: {
          id: input.templateId,
          workspaceId: input.workspaceId,
          isSystem: false,
        },
      });

      if (!template) {
        throw new ApiError("Template not found", 404, "TEMPLATE_NOT_FOUND");
      }

      if (template.lifecycle === "RETIRED") {
        return { id: template.id, lifecycle: "RETIRED" as const };
      }

      // Mark lifecycle as RETIRED (retain GeneratedContract references)
      await tx.contractTemplate.update({
        where: { id: template.id },
        data: {
          lifecycle: "RETIRED",
          status: "retired",
        },
      });

      return { id: template.id, lifecycle: "RETIRED" as const };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );

  return result;
}

export async function getWorkspaceTemplate(
  input: {
    readonly workspaceId: string;
    readonly templateId: string;
  },
  database: PrismaClient = db
): Promise<WorkspaceTemplateSummary | null> {
  const template = await database.contractTemplate.findFirst({
    where: {
      id: input.templateId,
      workspaceId: input.workspaceId,
      isSystem: false,
    },
  });

  if (!template) return null;

  return {
    id: template.id,
    key: template.catalogKey ?? template.type,
    titleAr: template.nameAr,
    titleEn: template.nameEn,
    version: template.version,
    canonicalHash: template.canonicalHash ?? "",
    lifecycle: template.lifecycle,
    legalReviewStatus: template.legalReviewStatus,
    counselReviewRequired: template.counselReviewRequired,
    isExecutable: template.isExecutable,
    isSystem: template.isSystem,
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString(),
  };
}

export async function listWorkspaceTemplates(
  input: {
    readonly workspaceId: string;
    readonly limit: number;
    readonly cursor?: string;
    readonly lifecycle?: "DRAFT" | "PUBLISHED" | "RETIRED";
  },
  database: PrismaClient = db
): Promise<{
  readonly templates: readonly WorkspaceTemplateSummary[];
  readonly nextCursor: string | null;
}> {
  const baseWhere: Prisma.ContractTemplateWhereInput = {
    workspaceId: input.workspaceId,
    isSystem: false,
    ...(input.lifecycle ? { lifecycle: input.lifecycle } : {}),
  };

  let cursorPosition: { readonly id: string; readonly createdAt: Date } | null = null;
  if (input.cursor) {
    cursorPosition = await database.contractTemplate.findFirst({
      where: { ...baseWhere, id: input.cursor },
      select: { id: true, createdAt: true },
    });
    if (!cursorPosition) {
      throw new ApiError("Cursor not found", 404, "TEMPLATE_CURSOR_NOT_FOUND");
    }
  }

  const records = await database.contractTemplate.findMany({
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
  });

  const pageRecords = records.slice(0, input.limit);
  const templates: WorkspaceTemplateSummary[] = pageRecords.map((t) => ({
    id: t.id,
    key: t.catalogKey ?? t.type,
    titleAr: t.nameAr,
    titleEn: t.nameEn,
    version: t.version,
    canonicalHash: t.canonicalHash ?? "",
    lifecycle: t.lifecycle,
    legalReviewStatus: t.legalReviewStatus,
    counselReviewRequired: t.counselReviewRequired,
    isExecutable: t.isExecutable,
    isSystem: t.isSystem,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  }));

  return {
    templates,
    nextCursor: records.length > input.limit ? (pageRecords.at(-1)?.id ?? null) : null,
  };
}

export async function listTemplateVersions(
  input: {
    readonly workspaceId: string;
    readonly templateId: string;
    readonly limit: number;
    readonly cursor?: string;
  },
  database: PrismaClient = db
): Promise<{
  readonly versions: readonly WorkspaceTemplateVersionSummary[];
  readonly nextCursor: string | null;
}> {
  // Verify template belongs to workspace and is not system
  const template = await database.contractTemplate.findFirst({
    where: {
      id: input.templateId,
      workspaceId: input.workspaceId,
      isSystem: false,
    },
    select: { id: true },
  });

  if (!template) {
    throw new ApiError("Template not found", 404, "TEMPLATE_NOT_FOUND");
  }

  const baseWhere: Prisma.ContractTemplateVersionWhereInput = {
    templateId: input.templateId,
  };

  let cursorPosition: { readonly id: string; readonly createdAt: Date } | null = null;
  if (input.cursor) {
    cursorPosition = await database.contractTemplateVersion.findFirst({
      where: { ...baseWhere, id: input.cursor },
      select: { id: true, createdAt: true },
    });
    if (!cursorPosition) {
      throw new ApiError("Cursor not found", 404, "VERSION_CURSOR_NOT_FOUND");
    }
  }

  const records = await database.contractTemplateVersion.findMany({
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
    select: {
      id: true,
      version: true,
      canonicalHash: true,
      lifecycle: true,
      legalReviewStatus: true,
      counselReviewRequired: true,
      isExecutable: true,
      changeNote: true,
      createdAt: true,
    },
  });

  const pageRecords = records.slice(0, input.limit);
  const versions: WorkspaceTemplateVersionSummary[] = pageRecords.map((v) => ({
    id: v.id,
    version: v.version,
    canonicalHash: v.canonicalHash ?? "",
    lifecycle: v.lifecycle,
    legalReviewStatus: v.legalReviewStatus,
    counselReviewRequired: v.counselReviewRequired,
    isExecutable: v.isExecutable,
    changeNote: v.changeNote,
    createdAt: v.createdAt.toISOString(),
  }));

  return {
    versions,
    nextCursor: records.length > input.limit ? (pageRecords.at(-1)?.id ?? null) : null,
  };
}

export async function getTemplateVersion(
  input: {
    readonly workspaceId: string;
    readonly templateId: string;
    readonly versionId: string;
  },
  database: PrismaClient = db
): Promise<WorkspaceTemplateVersionContent | null> {
  // Verify template belongs to workspace and is not system
  const template = await database.contractTemplate.findFirst({
    where: {
      id: input.templateId,
      workspaceId: input.workspaceId,
      isSystem: false,
    },
    select: { id: true },
  });

  if (!template) {
    return null;
  }

  const version = await database.contractTemplateVersion.findFirst({
    where: {
      templateId: input.templateId,
      id: input.versionId,
    },
  });

  if (!version) {
    return null;
  }

  const sections = JSON.parse(version.sectionsJson) as WorkspaceTemplateSection[];
  const variables = JSON.parse(version.variablesJson) as WorkspaceTemplateVariable[];
  const clauseBindings = JSON.parse(
    version.clausesJson
  ) as WorkspaceTemplateClauseBinding[];

  return {
    id: version.id,
    version: version.version,
    canonicalHash: version.canonicalHash ?? "",
    lifecycle: version.lifecycle,
    legalReviewStatus: version.legalReviewStatus,
    counselReviewRequired: version.counselReviewRequired,
    isExecutable: version.isExecutable,
    sections,
    variables,
    clauseBindings,
    changeNote: version.changeNote,
    createdAt: version.createdAt.toISOString(),
  };
}
