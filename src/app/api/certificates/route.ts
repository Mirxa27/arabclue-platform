import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withTenant, jsonOk, ApiError } from "@/lib/api-controller";
import { certificateSchema, parseJsonBody } from "@/lib/validation";
import { computeOnboardingSteps } from "@/lib/onboarding";
import { isWorkspaceManager } from "@/lib/auth";
import {
  approveKnowledgeContent,
  certificateKnowledgeContent,
  isKnowledgeHardDeleteAllowed,
  markKnowledgeContentUnreviewed,
  resolveKnowledgeApprovalEvidence,
  revokeKnowledgeContent,
} from "@/lib/knowledge-approval";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET() {
  return withTenant("session", async ({ workspace }) => {
    const items = await db.certificate.findMany({
      where: { workspaceId: workspace.id },
      orderBy: [{ expiresAt: "asc" }, { createdAt: "desc" }],
    });
    return jsonOk({ items });
  }, "certificates");
}

export async function POST(req: NextRequest) {
  return withTenant("writer", async ({ workspace }) => {
    const parsed = await parseJsonBody(req, certificateSchema);
    if (!parsed.ok) return parsed.response;
    const d = parsed.data;
    if (d.approved === true) {
      throw new ApiError(
        "New certificates require evidence review before approval",
        409,
        "KNOWLEDGE_REVIEW_REQUIRED"
      );
    }
    const content = certificateKnowledgeContent({
      certType: d.certType,
      name: d.name,
      number: d.number ?? null,
      issuer: d.issuer ?? null,
      issuedAt: d.issuedAt ?? null,
      expiresAt: d.expiresAt ?? null,
      filePath: d.filePath ?? null,
      notes: d.notes ?? null,
    });
    const item = await db.certificate.create({
      data: {
        workspaceId: workspace.id,
        certType: d.certType,
        name: d.name,
        number: d.number ?? null,
        issuer: d.issuer ?? null,
        issuedAt: d.issuedAt ? new Date(d.issuedAt) : null,
        expiresAt: d.expiresAt ? new Date(d.expiresAt) : null,
        filePath: d.filePath ?? null,
        alertDays: d.alertDays ?? 30,
        notes: d.notes ?? null,
        ...markKnowledgeContentUnreviewed(content),
      },
    });
    await computeOnboardingSteps(workspace.id);
    return jsonOk({ item }, { status: 201 });
  }, "certificates");
}

export async function PATCH(req: NextRequest) {
  return withTenant("writer", async ({ workspace, membershipRole, session, userId }) => {
    const body = await req.json().catch(() => ({}));
    const id = typeof body.id === "string" ? body.id : null;
    if (!id) throw new ApiError("id required", 400);
    const existing = await db.certificate.findFirst({
      where: { id, workspaceId: workspace.id },
    });
    if (!existing) throw new ApiError("not found", 404);
    const parsed = certificateSchema.partial().safeParse(body);
    if (!parsed.success) throw new ApiError("Validation failed", 400);
    const d = parsed.data;
    const content = certificateKnowledgeContent({
      certType: d.certType ?? existing.certType,
      name: d.name ?? existing.name,
      number: d.number !== undefined ? d.number : existing.number,
      issuer: d.issuer !== undefined ? d.issuer : existing.issuer,
      issuedAt: d.issuedAt !== undefined ? d.issuedAt : existing.issuedAt,
      expiresAt:
        d.expiresAt !== undefined ? d.expiresAt : existing.expiresAt,
      filePath: d.filePath !== undefined ? d.filePath : existing.filePath,
      notes: d.notes !== undefined ? d.notes : existing.notes,
    });
    const substantiveEdit = [
      "certType",
      "name",
      "number",
      "issuer",
      "issuedAt",
      "expiresAt",
      "filePath",
      "notes",
    ].some((key) => Object.prototype.hasOwnProperty.call(body, key));
    if (substantiveEdit && typeof body.approved === "boolean") {
      throw new ApiError(
        "Edit knowledge content separately before changing its review state",
        400,
        "KNOWLEDGE_REVIEW_EDIT_CONFLICT"
      );
    }
    let reviewData = substantiveEdit
      ? markKnowledgeContentUnreviewed(content)
      : undefined;
    if (body.approved === true) {
      if (!isWorkspaceManager(membershipRole, session.user.role)) {
        throw new ApiError(
          "Only a workspace manager may approve knowledge evidence",
          403,
          "KNOWLEDGE_REVIEW_FORBIDDEN"
        );
      }
      try {
        const evidence = await resolveKnowledgeApprovalEvidence({
          workspaceId: workspace.id,
          request: {
            approved: true,
            provenance: body.provenance,
          },
        });
        reviewData = approveKnowledgeContent({
          evidence,
          reviewerId: userId,
          content,
        });
      } catch {
        throw new ApiError(
          "Approval requires a checksummed evidence document from this workspace",
          400,
          "KNOWLEDGE_EVIDENCE_REQUIRED"
        );
      }
    } else if (body.approved === false) {
      if (!isWorkspaceManager(membershipRole, session.user.role)) {
        throw new ApiError(
          "Only a workspace manager may revoke knowledge evidence",
          403,
          "KNOWLEDGE_REVIEW_FORBIDDEN"
        );
      }
      try {
        reviewData = revokeKnowledgeContent({
          request: { approved: false, reason: body.reason },
          content,
          previous: existing,
          revokerId: userId,
        });
      } catch {
        throw new ApiError(
          "Revocation requires currently approved evidence and a reason",
          400,
          "KNOWLEDGE_REVOCATION_REASON_REQUIRED"
        );
      }
    }
    const item = await db.certificate.update({
      where: { id },
      data: {
        ...(d.certType !== undefined ? { certType: d.certType } : {}),
        ...(d.name !== undefined ? { name: d.name } : {}),
        ...(d.number !== undefined ? { number: d.number } : {}),
        ...(d.issuer !== undefined ? { issuer: d.issuer } : {}),
        ...(d.issuedAt !== undefined
          ? { issuedAt: d.issuedAt ? new Date(d.issuedAt) : null }
          : {}),
        ...(d.expiresAt !== undefined
          ? { expiresAt: d.expiresAt ? new Date(d.expiresAt) : null }
          : {}),
        ...(d.alertDays !== undefined ? { alertDays: d.alertDays } : {}),
        // filePath participates in the knowledge content hash and in the
        // substantive-edit check above, so omitting it here left the stored
        // hash describing a path the row did not have — and cost the
        // certificate its approval for an edit that was never persisted.
        ...(d.filePath !== undefined ? { filePath: d.filePath } : {}),
        ...(d.notes !== undefined ? { notes: d.notes } : {}),
        ...(reviewData ?? {}),
      },
    });
    if (reviewData) {
      await audit({
        userId,
        action: reviewData.approved
          ? "KNOWLEDGE_APPROVE"
          : reviewData.reviewStatus === "REVOKED"
            ? "KNOWLEDGE_REVOKE"
            : "KNOWLEDGE_INVALIDATE",
        resource: "Certificate",
        resourceId: id,
        details: {
          reviewStatus: reviewData.reviewStatus,
          contentHash: reviewData.contentHash,
          ...(reviewData.reviewStatus === "REVOKED"
            ? {
                reason: reviewData.revocationReason,
                evidenceRef: reviewData.evidenceRef,
                approvedById: reviewData.reviewedById,
                approvedAt: reviewData.approvedAt?.toISOString(),
                previousContentHash: existing.contentHash,
                revokedById: reviewData.revokedById,
              }
            : {}),
        },
      });
    }
    await computeOnboardingSteps(workspace.id);
    return jsonOk({ item });
  }, "certificates");
}

export async function DELETE(req: NextRequest) {
  return withTenant("writer", async ({ workspace, userId }) => {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) throw new ApiError("id required", 400);
    const existing = await db.certificate.findFirst({
      where: { id, workspaceId: workspace.id },
    });
    if (!existing) throw new ApiError("not found", 404);
    if (!isKnowledgeHardDeleteAllowed(existing)) {
      throw new ApiError(
        "Reviewed knowledge is an immutable audit record; revoke approved evidence instead",
        409,
        "KNOWLEDGE_DELETE_FORBIDDEN"
      );
    }
    const deleted = await db.certificate.deleteMany({
      where: {
        id,
        workspaceId: workspace.id,
        approved: false,
        reviewStatus: "UNREVIEWED",
        evidenceRef: null,
        evidenceDocumentId: null,
        evidenceVersion: null,
        evidenceChecksum: null,
        provenanceJson: null,
        reviewedById: null,
        approvedAt: null,
        revokedAt: null,
        revokedById: null,
      },
    });
    if (deleted.count !== 1) {
      throw new ApiError(
        "Knowledge review state changed; reload before deleting",
        409,
        "KNOWLEDGE_DELETE_CONFLICT"
      );
    }
    await audit({
      userId,
      action: "KNOWLEDGE_DELETE",
      resource: "Certificate",
      resourceId: id,
      details: { reviewStatus: "UNREVIEWED" },
    });
    await computeOnboardingSteps(workspace.id);
    return jsonOk({ ok: true });
  }, "certificates");
}
