import { db } from "@/lib/db";
import { withTenant, jsonOk, jsonError, ApiError } from "@/lib/api-controller";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

type RecordType = "CERTIFICATE" | "PAST_PROJECT" | "METHODOLOGY" | "LIBRARY";

interface PendingRecord {
  id: string;
  recordType: RecordType;
  title: string;
  titleAr: string | null;
  submitterId: string | null;
  submitterName: string | null;
  submittedAt: Date;
  expiresAt: Date | null;
  evidenceDocumentId: string | null;
  evidenceVersion: number | null;
}

const PAGE_SIZE_MAX = 50;
const PAGE_SIZE_DEFAULT = 25;

/**
 * GET /api/knowledge/pending-approval
 * Lists knowledge items awaiting approval for workspace reviewers/owners.
 * Paginated with deterministic cursor (recordType:id encoded base64).
 */
export async function GET(request: NextRequest) {
  return withTenant("session", async ({ workspace }) => {
    const url = new URL(request.url);
    const cursor = url.searchParams.get("cursor");
    const limitParam = url.searchParams.get("limit");
    const limit = Math.min(
      Math.max(1, parseInt(limitParam ?? "", 10) || PAGE_SIZE_DEFAULT),
      PAGE_SIZE_MAX
    );

    // Decode cursor: "RECORD_TYPE:id" base64 encoded
    let cursorRecordType: RecordType | null = null;
    let cursorId: string | null = null;
    if (cursor) {
      try {
        const decoded = Buffer.from(cursor, "base64").toString("utf8");
        const [type, id] = decoded.split(":");
        if (type && id) {
          cursorRecordType = type as RecordType;
          cursorId = id;
        }
      } catch {
        // Invalid cursor, start from beginning
      }
    }

    const workspaceId = workspace.id;
    const unreviewedWhere = { reviewStatus: "UNREVIEWED" as const };

    // Fetch from each model with consistent ordering by createdAt DESC, then id ASC
    // This ensures deterministic pagination across all record types
    const [certificates, pastProjects, methodologies, library] = await Promise.all([
      db.certificate.findMany({
        where: { workspaceId, ...unreviewedWhere },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        include: { workspace: { select: { id: true } } },
      }),
      db.pastProject.findMany({
        where: { workspaceId, ...unreviewedWhere },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        include: { workspace: { select: { id: true } } },
      }),
      db.methodologyAsset.findMany({
        where: { workspaceId, ...unreviewedWhere },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        include: { workspace: { select: { id: true } } },
      }),
      db.contentLibraryItem.findMany({
        where: { workspaceId, ...unreviewedWhere },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        include: { workspace: { select: { id: true } } },
      }),
    ]);

    // Transform into unified records
    const allRecords: PendingRecord[] = [
      ...certificates.map((c) => ({
        id: c.id,
        recordType: "CERTIFICATE" as RecordType,
        title: c.name,
        titleAr: null,
        submitterId: null,
        submitterName: null,
        submittedAt: c.createdAt,
        expiresAt: c.expiresAt,
        evidenceDocumentId: c.evidenceDocumentId,
        evidenceVersion: c.evidenceVersion,
      })),
      ...pastProjects.map((p) => ({
        id: p.id,
        recordType: "PAST_PROJECT" as RecordType,
        title: p.title,
        titleAr: p.titleAr,
        submitterId: null,
        submitterName: null,
        submittedAt: p.createdAt,
        expiresAt: null,
        evidenceDocumentId: p.evidenceDocumentId,
        evidenceVersion: p.evidenceVersion,
      })),
      ...methodologies.map((m) => ({
        id: m.id,
        recordType: "METHODOLOGY" as RecordType,
        title: m.title,
        titleAr: m.titleAr,
        submitterId: null,
        submitterName: null,
        submittedAt: m.createdAt,
        expiresAt: null,
        evidenceDocumentId: m.evidenceDocumentId,
        evidenceVersion: m.evidenceVersion,
      })),
      ...library.map((l) => ({
        id: l.id,
        recordType: "LIBRARY" as RecordType,
        title: l.title,
        titleAr: l.titleAr,
        submitterId: null,
        submitterName: null,
        submittedAt: l.createdAt,
        expiresAt: null,
        evidenceDocumentId: l.evidenceDocumentId,
        evidenceVersion: l.evidenceVersion,
      })),
    ];

    // Sort all records by submittedAt DESC, then by recordType, then by id for determinism
    allRecords.sort((a, b) => {
      const timeCompare = b.submittedAt.getTime() - a.submittedAt.getTime();
      if (timeCompare !== 0) return timeCompare;
      const typeCompare = a.recordType.localeCompare(b.recordType);
      if (typeCompare !== 0) return typeCompare;
      return a.id.localeCompare(b.id);
    });

    // Apply cursor-based pagination
    let startIndex = 0;
    if (cursorRecordType && cursorId) {
      const cursorIndex = allRecords.findIndex(
        (r) => r.recordType === cursorRecordType && r.id === cursorId
      );
      if (cursorIndex >= 0) {
        startIndex = cursorIndex + 1;
      }
    }

    const pageRecords = allRecords.slice(startIndex, startIndex + limit);
    const hasMore = startIndex + limit < allRecords.length;

    // Generate next cursor
    let nextCursor: string | null = null;
    if (hasMore && pageRecords.length > 0) {
      const lastRecord = pageRecords[pageRecords.length - 1];
      nextCursor = Buffer.from(`${lastRecord.recordType}:${lastRecord.id}`).toString("base64");
    }

    return jsonOk({
      records: pageRecords,
      nextCursor,
      hasMore,
      total: allRecords.length,
      counts: {
        certificates: certificates.length,
        pastProjects: pastProjects.length,
        methodologies: methodologies.length,
        library: library.length,
      },
    });
  }, "knowledge-pending-approval-get");
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
