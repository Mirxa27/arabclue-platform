import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withTenant, jsonOk, ApiError } from "@/lib/api-controller";
import { methodologySchema, parseJsonBody } from "@/lib/validation";
import { computeOnboardingSteps } from "@/lib/onboarding";
import { isWorkspaceManager } from "@/lib/auth";
import {
  approveKnowledgeContent,
  markKnowledgeContentUnreviewed,
  methodologyKnowledgeContent,
  resolveKnowledgeApprovalEvidence,
  revokeKnowledgeContent,
} from "@/lib/knowledge-approval";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET() {
  return withTenant("session", async ({ workspace }) => {
    const items = await db.methodologyAsset.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: "desc" },
    });
    return jsonOk({ items });
  }, "methodologies");
}

export async function POST(req: NextRequest) {
  return withTenant("writer", async ({ workspace }) => {
    const parsed = await parseJsonBody(req, methodologySchema);
    if (!parsed.ok) return parsed.response;
    const d = parsed.data;
    if (d.approved === true) {
      throw new ApiError(
        "New methodologies require evidence review before approval",
        409,
        "KNOWLEDGE_REVIEW_REQUIRED"
      );
    }
    const content = methodologyKnowledgeContent({
      category: d.category,
      title: d.title,
      titleAr: d.titleAr ?? null,
      bodyMd: d.bodyMd,
    });
    const item = await db.methodologyAsset.create({
      data: {
        workspaceId: workspace.id,
        category: d.category,
        title: d.title,
        titleAr: d.titleAr ?? null,
        bodyMd: d.bodyMd,
        ...markKnowledgeContentUnreviewed(content),
      },
    });
    await computeOnboardingSteps(workspace.id);
    return jsonOk({ item }, { status: 201 });
  }, "methodologies");
}

export async function PATCH(req: NextRequest) {
  return withTenant("writer", async ({ workspace, membershipRole, session, userId }) => {
    const body = await req.json().catch(() => ({}));
    const id = typeof body.id === "string" ? body.id : null;
    if (!id) throw new ApiError("id required", 400);
    const existing = await db.methodologyAsset.findFirst({
      where: { id, workspaceId: workspace.id },
    });
    if (!existing) throw new ApiError("not found", 404);
    const parsed = methodologySchema.partial().safeParse(body);
    if (!parsed.success) throw new ApiError("Validation failed", 400);
    const d = parsed.data;
    const content = methodologyKnowledgeContent({
      category: d.category ?? existing.category,
      title: d.title ?? existing.title,
      titleAr: d.titleAr !== undefined ? d.titleAr : existing.titleAr,
      bodyMd: d.bodyMd ?? existing.bodyMd,
    });
    const substantiveEdit = ["category", "title", "titleAr", "bodyMd"].some(
      (key) => Object.prototype.hasOwnProperty.call(body, key)
    );
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
    const item = await db.methodologyAsset.update({
      where: { id },
      data: {
        ...(d.category !== undefined ? { category: d.category } : {}),
        ...(d.title !== undefined ? { title: d.title } : {}),
        ...(d.titleAr !== undefined ? { titleAr: d.titleAr } : {}),
        ...(d.bodyMd !== undefined ? { bodyMd: d.bodyMd } : {}),
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
        resource: "MethodologyAsset",
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
  }, "methodologies");
}

export async function DELETE(req: NextRequest) {
  return withTenant("writer", async ({ workspace }) => {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) throw new ApiError("id required", 400);
    const existing = await db.methodologyAsset.findFirst({
      where: { id, workspaceId: workspace.id },
    });
    if (!existing) throw new ApiError("not found", 404);
    await db.methodologyAsset.delete({ where: { id } });
    await computeOnboardingSteps(workspace.id);
    return jsonOk({ ok: true });
  }, "methodologies");
}
