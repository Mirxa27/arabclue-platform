/**
 * Strict resource-scoped keyset cursors for proposal/document version lists.
 * Sort key is descending revision number; scope binds tenant + parent resource
 * so a cursor cannot be replayed across workspaces or sibling histories.
 */

import { z } from "zod";
import {
  createKeysetCursorCodec,
  KeysetCursorError,
} from "./keyset-cursor";

const resourceScopeSchema = z
  .object({
    workspaceId: z.string().min(1).max(200),
    resourceId: z.string().min(1).max(200),
  })
  .strict();

const revisionSortSchema = z
  .object({
    version: z.number().int().positive().max(1_000_000_000),
  })
  .strict();

export const PROPOSAL_VERSION_CURSOR_CODEC = createKeysetCursorCodec({
  resource: "proposal-versions",
  scopeSchema: resourceScopeSchema,
  sortSchema: revisionSortSchema,
});

export const DOCUMENT_VERSION_CURSOR_CODEC = createKeysetCursorCodec({
  resource: "document-versions",
  scopeSchema: resourceScopeSchema,
  sortSchema: revisionSortSchema,
});

export function encodeProposalVersionCursor(
  workspaceId: string,
  proposalId: string,
  version: number
): string {
  return PROPOSAL_VERSION_CURSOR_CODEC.encode({
    scope: { workspaceId, resourceId: proposalId },
    sort: { version },
  });
}

export function decodeProposalVersionCursor(
  cursor: string,
  workspaceId: string,
  proposalId: string
): number | null {
  try {
    const decoded = PROPOSAL_VERSION_CURSOR_CODEC.decode(cursor, {
      workspaceId,
      resourceId: proposalId,
    });
    return decoded.sort.version;
  } catch (error) {
    if (error instanceof KeysetCursorError) return null;
    return null;
  }
}

export function encodeDocumentVersionCursor(
  workspaceId: string,
  documentId: string,
  version: number
): string {
  return DOCUMENT_VERSION_CURSOR_CODEC.encode({
    scope: { workspaceId, resourceId: documentId },
    sort: { version },
  });
}

export function decodeDocumentVersionCursor(
  cursor: string,
  workspaceId: string,
  documentId: string
): number | null {
  try {
    const decoded = DOCUMENT_VERSION_CURSOR_CODEC.decode(cursor, {
      workspaceId,
      resourceId: documentId,
    });
    return decoded.sort.version;
  } catch (error) {
    if (error instanceof KeysetCursorError) return null;
    return null;
  }
}

const contractRevisionSortSchema = z
  .object({
    revision: z.number().int().positive().max(1_000_000_000),
    id: z.string().min(1).max(200),
  })
  .strict();

export const CONTRACT_REVISION_CURSOR_CODEC = createKeysetCursorCodec({
  resource: "contract-revisions",
  scopeSchema: resourceScopeSchema,
  sortSchema: contractRevisionSortSchema,
});

export function encodeContractRevisionCursor(
  workspaceId: string,
  contractId: string,
  position: Readonly<{ revision: number; id: string }>
): string {
  return CONTRACT_REVISION_CURSOR_CODEC.encode({
    scope: { workspaceId, resourceId: contractId },
    sort: { revision: position.revision, id: position.id },
  });
}

export function decodeContractRevisionCursor(
  cursor: string,
  workspaceId: string,
  contractId: string
): Readonly<{ revision: number; id: string }> | null {
  try {
    const decoded = CONTRACT_REVISION_CURSOR_CODEC.decode(cursor, {
      workspaceId,
      resourceId: contractId,
    });
    return { revision: decoded.sort.revision, id: decoded.sort.id };
  } catch (error) {
    if (error instanceof KeysetCursorError) return null;
    return null;
  }
}

const templateVersionSortSchema = z
  .object({
    createdAt: z.string().min(20).max(40),
    id: z.string().min(1).max(200),
  })
  .strict();

export const WORKSPACE_TEMPLATE_CURSOR_CODEC = createKeysetCursorCodec({
  resource: "workspace-templates",
  scopeSchema: z
    .object({
      workspaceId: z.string().min(1).max(200),
    })
    .strict(),
  sortSchema: templateVersionSortSchema,
});

export const WORKSPACE_TEMPLATE_VERSION_CURSOR_CODEC = createKeysetCursorCodec({
  resource: "workspace-template-versions",
  scopeSchema: resourceScopeSchema,
  sortSchema: templateVersionSortSchema,
});

export function encodeWorkspaceTemplateCursor(
  workspaceId: string,
  position: Readonly<{ createdAt: Date; id: string }>
): string {
  return WORKSPACE_TEMPLATE_CURSOR_CODEC.encode({
    scope: { workspaceId },
    sort: { createdAt: position.createdAt.toISOString(), id: position.id },
  });
}

export function decodeWorkspaceTemplateCursor(
  cursor: string,
  workspaceId: string
): Readonly<{ createdAt: Date; id: string }> | null {
  try {
    const decoded = WORKSPACE_TEMPLATE_CURSOR_CODEC.decode(cursor, {
      workspaceId,
    });
    const createdAt = new Date(decoded.sort.createdAt);
    if (!Number.isFinite(createdAt.getTime())) return null;
    if (createdAt.toISOString() !== decoded.sort.createdAt) return null;
    return { createdAt, id: decoded.sort.id };
  } catch {
    return null;
  }
}

export function encodeWorkspaceTemplateVersionCursor(
  workspaceId: string,
  templateId: string,
  position: Readonly<{ createdAt: Date; id: string }>
): string {
  return WORKSPACE_TEMPLATE_VERSION_CURSOR_CODEC.encode({
    scope: { workspaceId, resourceId: templateId },
    sort: { createdAt: position.createdAt.toISOString(), id: position.id },
  });
}

export function decodeWorkspaceTemplateVersionCursor(
  cursor: string,
  workspaceId: string,
  templateId: string
): Readonly<{ createdAt: Date; id: string }> | null {
  try {
    const decoded = WORKSPACE_TEMPLATE_VERSION_CURSOR_CODEC.decode(cursor, {
      workspaceId,
      resourceId: templateId,
    });
    const createdAt = new Date(decoded.sort.createdAt);
    if (!Number.isFinite(createdAt.getTime())) return null;
    if (createdAt.toISOString() !== decoded.sort.createdAt) return null;
    return { createdAt, id: decoded.sort.id };
  } catch {
    return null;
  }
}
