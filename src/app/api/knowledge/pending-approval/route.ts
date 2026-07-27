import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  withTenant,
  jsonOk,
  jsonError,
  jsonApiFailure,
  parseSearchParams,
  ApiError,
} from "@/lib/api-controller";
import { createPrismaKnowledgeQueueService } from "@/lib/knowledge-queue-prisma";

export const dynamic = "force-dynamic";

const listQuerySchema = z
  .object({
    limit: z.string().regex(/^\d{1,6}$/u).optional(),
    cursor: z.string().min(1).max(4096).optional(),
  })
  .strict();

/**
 * GET /api/knowledge/pending-approval
 * Returns one tenant-scoped, normalized, keyset-paginated approval queue.
 */
export async function GET(request: NextRequest) {
  return withTenant(
    "session",
    async ({ workspace }) => {
      const query = parseSearchParams(request, listQuerySchema);
      const result =
        await createPrismaKnowledgeQueueService().listPendingQueue({
          workspace: { id: workspace.id },
          pageSize: query.limit,
          cursor: query.cursor,
        });

      if (!result.ok) {
        return jsonApiFailure(result.code, { status: result.status });
      }

      return jsonOk({
        records: result.rows,
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
        total: result.total,
        counts: result.counts,
        pageSize: result.pageSize,
      });
    },
    "knowledge-pending-approval-get"
  );
}

/**
 * POST /api/knowledge/pending-approval
 * Approve or reject a knowledge record.
 * Body: { recordType, recordId, decision: 'APPROVE' | 'REJECT', reason?: string, evidenceDocumentId?: string }
 */
export async function POST(request: NextRequest) {
  return withTenant("session", async ({ workspace, userId, membershipRole }) => {
    // Check approval authority - must be OWNER or ADMIN
    if (!["OWNER", "ADMIN"].includes(membershipRole)) {
      return jsonError(
        membershipRole === "ar"
          ? "ليس لديك صلاحية اعتماد السجلات"
          : "You do not have approval authority",
        403,
        "APPROVAL_FORBIDDEN"
      );
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      throw new ApiError("Invalid request body", 400);
    }

    const {
      recordType,
      recordId,
      decision,
      reason,
      evidenceDocumentId,
    } = body as {
      recordType?: string;
      recordId?: string;
      decision?: string;
      reason?: string;
      evidenceDocumentId?: string;
    };

    if (!recordType || !recordId || !decision) {
      throw new ApiError("recordType, recordId, and decision are required", 400);
    }

    if (!["APPROVE", "REJECT"].includes(decision)) {
      throw new ApiError("decision must be APPROVE or REJECT", 400);
    }

    const validTypes = ["CERTIFICATE", "PAST_PROJECT", "METHODOLOGY", "LIBRARY"];
    if (!validTypes.includes(recordType)) {
      throw new ApiError("Invalid recordType", 400);
    }

    const workspaceId = workspace.id;
    const now = new Date();

    // Handle approval
    if (decision === "APPROVE") {
      // Evidence document is required for approval
      if (!evidenceDocumentId) {
        throw new ApiError("evidenceDocumentId is required for approval", 400);
      }

      // Get the evidence document
      const evidenceDoc = await db.uploadedDocument.findFirst({
        where: { id: evidenceDocumentId, workspaceId },
      });

      if (!evidenceDoc) {
        throw new ApiError("Evidence document not found", 404);
      }

      // Get the current version with checksum
      const currentVersion = await db.documentVersion.findFirst({
        where: {
          documentId: evidenceDocumentId,
          version: evidenceDoc.currentVersion,
        },
      });

      if (!currentVersion?.checksum) {
        return jsonError(
          "Evidence document version is missing checksum - upload a new version",
          409,
          "EVIDENCE_VERSION_MISSING"
        );
      }

      const updateData = {
        reviewStatus: "APPROVED" as const,
        approved: true,
        reviewedById: userId,
        approvedAt: now,
        evidenceDocumentId: evidenceDocumentId,
        evidenceVersion: currentVersion.version,
        evidenceChecksum: currentVersion.checksum,
        revokedAt: null,
        revokedById: null,
        revocationReason: null,
      };

      // Update the appropriate model
      switch (recordType) {
        case "CERTIFICATE":
          await db.certificate.update({
            where: { id: recordId, workspaceId },
            data: updateData,
          });
          break;
        case "PAST_PROJECT":
          await db.pastProject.update({
            where: { id: recordId, workspaceId },
            data: updateData,
          });
          break;
        case "METHODOLOGY":
          await db.methodologyAsset.update({
            where: { id: recordId, workspaceId },
            data: updateData,
          });
          break;
        case "LIBRARY":
          await db.contentLibraryItem.update({
            where: { id: recordId, workspaceId },
            data: updateData,
          });
          break;
      }

      return jsonOk({ success: true, decision: "APPROVED" });
    }

    // Handle rejection
    if (decision === "REJECT") {
      if (!reason?.trim()) {
        throw new ApiError("reason is required for rejection", 400);
      }

      const updateData = {
        reviewStatus: "REVOKED" as const,
        approved: false,
        revokedAt: now,
        revokedById: userId,
        revocationReason: reason.trim(),
      };

      // Update the appropriate model
      switch (recordType) {
        case "CERTIFICATE":
          await db.certificate.update({
            where: { id: recordId, workspaceId },
            data: updateData,
          });
          break;
        case "PAST_PROJECT":
          await db.pastProject.update({
            where: { id: recordId, workspaceId },
            data: updateData,
          });
          break;
        case "METHODOLOGY":
          await db.methodologyAsset.update({
            where: { id: recordId, workspaceId },
            data: updateData,
          });
          break;
        case "LIBRARY":
          await db.contentLibraryItem.update({
            where: { id: recordId, workspaceId },
            data: updateData,
          });
          break;
      }

      return jsonOk({ success: true, decision: "REJECTED" });
    }

    return jsonError("Invalid decision", 400);
  }, "knowledge-pending-approval-post");
}
