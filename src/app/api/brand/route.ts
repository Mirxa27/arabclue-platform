import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  isWorkspaceManager,
  requireSession,
  requireWriter,
} from "@/lib/auth";
import { embedText } from "@/lib/llm";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { getTenantContext } from "@/lib/workspace-context";
import {
  DOCUMENT_BRAND_FONT_FAMILIES,
  extractLogoStoragePath,
} from "@/lib/brand-logo";
import {
  approveKnowledgeContent,
  knowledgeEvidencePointerSchema,
  markKnowledgeContentUnreviewed,
  pastProjectKnowledgeContent,
  resolveKnowledgeApprovalEvidence,
  revokeKnowledgeContent,
} from "@/lib/knowledge-approval";
import { z } from "zod";

export const dynamic = "force-dynamic";

const brandColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9A-Fa-f]{6}$/, "Expected a six-digit hexadecimal color")
  .transform((value) => value.toUpperCase());
const singleLineBrandTextSchema = z
  .string()
  .trim()
  .max(300)
  .refine(
    (value) => !/[\u0000-\u001F\u007F]/.test(value),
    "Control characters are not allowed"
  );
const logoUrlSchema = z
  .string()
  .trim()
  .max(2_048)
  .refine(
    (value) => !/[\u0000-\u001F\u007F]/.test(value),
    "Control characters are not allowed"
  );

/** Exact PATCH allow-list. Unknown keys and CSS-capable free-form values fail. */
export const brandPatchSchema = z
  .object({
    logoUrl: z
      .union([z.literal(""), logoUrlSchema, z.null()])
      .optional()
      .transform((value) => (value === "" ? null : value)),
    primaryColor: brandColorSchema.optional(),
    secondaryColor: brandColorSchema.optional(),
    accentColor: brandColorSchema.optional(),
    fontFamily: z.enum(DOCUMENT_BRAND_FONT_FAMILIES).optional(),
    tagline: singleLineBrandTextSchema.optional(),
    taglineAr: singleLineBrandTextSchema.optional(),
    vision2030Alignment: z
      .enum(["vibrant-society", "thriving-economy", "ambitious-nation"])
      .nullable()
      .optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one brand field is required",
  });

const pastProjectTextSchema = z
  .string()
  .trim()
  .min(1)
  .max(20_000)
  .refine(
    (value) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value),
    "Control characters are not allowed"
  );
const optionalPastProjectTextSchema = pastProjectTextSchema.nullable().optional();
export const pastProjectCreateSchema = z
  .object({
    title: pastProjectTextSchema.max(500),
    titleAr: optionalPastProjectTextSchema,
    clientName: optionalPastProjectTextSchema,
    clientNameAr: optionalPastProjectTextSchema,
    sector: optionalPastProjectTextSchema,
    contractValue: z.number().finite().nonnegative().nullable().optional(),
    startDate: z.string().datetime().nullable().optional(),
    endDate: z.string().datetime().nullable().optional(),
    outcome: z.enum(["SUCCESSFUL", "ONGOING", "COMPLETED"]).nullable().optional(),
    summary: pastProjectTextSchema,
    summaryAr: optionalPastProjectTextSchema,
    tags: optionalPastProjectTextSchema,
  })
  .strict();

const pastProjectEditSchema = z
  .object({
    id: z.string().trim().min(1).max(200),
    title: pastProjectTextSchema.max(500).optional(),
    summary: pastProjectTextSchema.optional(),
  })
  .strict()
  .refine((value) => value.title !== undefined || value.summary !== undefined, {
    message: "At least one project field is required",
  });
const pastProjectApprovalSchema = z
  .object({
    id: z.string().trim().min(1).max(200),
    approved: z.literal(true),
    provenance: knowledgeEvidencePointerSchema,
  })
  .strict();
const pastProjectRevocationSchema = z
  .object({
    id: z.string().trim().min(1).max(200),
    approved: z.literal(false),
    reason: z.string().trim().min(1).max(1_000),
  })
  .strict();
export const pastProjectUpdateSchema = z.union([
  pastProjectApprovalSchema,
  pastProjectRevocationSchema,
  pastProjectEditSchema,
]);

export function validateBrandPatchForWorkspace(
  raw: unknown,
  workspaceId: string
): z.output<typeof brandPatchSchema> | null {
  const parsed = brandPatchSchema.safeParse(raw);
  if (!parsed.success) return null;
  if (
    parsed.data.logoUrl &&
    !extractLogoStoragePath(parsed.data.logoUrl, workspaceId)
  ) {
    return null;
  }
  return parsed.data;
}

// GET /api/brand — fetch brand profile + past projects
export async function GET() {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { workspace, brandProfile } = await getTenantContext(session.user.id);
  const company = {
    name: workspace.name,
    nameAr: workspace.nameAr,
    crNumber: workspace.crNumber,
    vatNumber: workspace.vatNumber,
  };
  const pastProjects = await db.pastProject.findMany({
    where: { workspaceId: workspace.id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({
    workspaceId: workspace.id,
    brandProfile,
    company,
    pastProjects,
  });
}

// PATCH /api/brand — update brand profile
export async function PATCH(req: NextRequest) {
  const session = await requireWriter();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { workspace, brandProfile } = await getTenantContext(session.user.id);
  if (!brandProfile) {
    return NextResponse.json({ error: "No brand profile" }, { status: 400 });
  }
  const rawBody = await req.json().catch(() => null);
  const data = validateBrandPatchForWorkspace(rawBody, workspace.id);
  if (!data) {
    return NextResponse.json(
      { error: "Invalid brand update" },
      { status: 400 }
    );
  }

  const updated = await db.brandProfile.update({
    where: { id: brandProfile.id },
    data,
  });
  await audit({
    userId: session.user.id,
    action: "BRAND_UPDATE",
    resource: "BrandProfile",
    resourceId: updated.id,
  });
  return NextResponse.json({ brandProfile: updated });
}

// POST /api/brand — add past project with embedding for RAG
export async function POST(req: NextRequest) {
  const session = await requireWriter();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { workspace, brandProfile } = await getTenantContext(session.user.id);
  if (!brandProfile) {
    return NextResponse.json({ error: "No brand profile" }, { status: 400 });
  }
  const parsed = pastProjectCreateSchema.safeParse(
    await req.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid past project" },
      { status: 400 }
    );
  }
  const body = parsed.data;

  const embeddingText = [
    body.title,
    body.titleAr,
    body.clientName,
    body.sector,
    body.summary,
    body.summaryAr,
    body.tags,
  ]
    .filter(Boolean)
    .join("\n");
  const embedding = await embedText(embeddingText);

  const project = await db.pastProject.create({
    data: {
      workspaceId: workspace.id,
      brandProfileId: brandProfile.id,
      title: body.title,
      titleAr: body.titleAr,
      clientName: body.clientName,
      clientNameAr: body.clientNameAr,
      sector: body.sector,
      contractValue: body.contractValue ?? null,
      currency: "SAR",
      startDate: body.startDate ? new Date(body.startDate) : null,
      endDate: body.endDate ? new Date(body.endDate) : null,
      outcome: body.outcome ?? "SUCCESSFUL",
      summary: body.summary,
      summaryAr: body.summaryAr,
      tags: body.tags,
      embeddingJson: JSON.stringify(embedding),
      ...markKnowledgeContentUnreviewed(
        pastProjectKnowledgeContent({
          ...body,
          currency: "SAR",
        })
      ),
    },
  });
  await audit({
    userId: session.user.id,
    action: AUDIT_ACTIONS.DOC_UPLOAD,
    resource: "PastProject",
    resourceId: project.id,
    details: { title: project.title },
  });
  return NextResponse.json({ project });
}

/** PUT /api/brand — edit, evidence-approve, or revoke a past project. */
export async function PUT(req: NextRequest) {
  const session = await requireWriter();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { workspace, membershipRole } = await getTenantContext(session.user.id);
  const body: unknown = await req.json().catch(() => null);
  const parsed = pastProjectUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid past project update" },
      { status: 400 }
    );
  }
  const { id } = parsed.data;
  const existing = await db.pastProject.findFirst({
    where: { id, workspaceId: workspace.id },
  });
  if (!existing) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const content = pastProjectKnowledgeContent({
    ...existing,
    title: "title" in parsed.data ? parsed.data.title ?? existing.title : existing.title,
    summary:
      "summary" in parsed.data
        ? parsed.data.summary ?? existing.summary
        : existing.summary,
  });
  const data: {
    title?: string;
    summary?: string;
    embeddingJson?: string;
    approved?: boolean;
    reviewStatus?: "UNREVIEWED" | "APPROVED" | "REVOKED";
    evidenceRef?: string | null;
    provenanceJson?: string | null;
    reviewedById?: string | null;
    approvedAt?: Date | null;
    revokedAt?: Date | null;
    revokedById?: string | null;
    revocationReason?: string | null;
    contentHash?: string;
  } = {};
  if ("approved" in parsed.data && parsed.data.approved === true) {
    if (!isWorkspaceManager(membershipRole, session.user.role)) {
      return NextResponse.json(
        { error: "Only a workspace manager may approve knowledge evidence" },
        { status: 403 }
      );
    }
    try {
      const evidence = await resolveKnowledgeApprovalEvidence({
        workspaceId: workspace.id,
        request: {
          approved: true,
          provenance: parsed.data.provenance,
        },
      });
      Object.assign(
        data,
        approveKnowledgeContent({
          evidence,
          reviewerId: session.user.id,
          content,
        })
      );
    } catch {
      return NextResponse.json(
        {
          error:
            "Approval requires a checksummed evidence document from this workspace",
        },
        { status: 400 }
      );
    }
  } else if ("approved" in parsed.data && parsed.data.approved === false) {
    if (!isWorkspaceManager(membershipRole, session.user.role)) {
      return NextResponse.json(
        { error: "Only a workspace manager may revoke knowledge evidence" },
        { status: 403 }
      );
    }
    try {
      Object.assign(
        data,
        revokeKnowledgeContent({
          request: parsed.data,
          content,
          previous: existing,
          revokerId: session.user.id,
        })
      );
    } catch {
      return NextResponse.json(
        { error: "Revocation requires currently approved evidence and a reason" },
        { status: 400 }
      );
    }
  } else {
    if (parsed.data.title !== undefined) data.title = parsed.data.title;
    if (parsed.data.summary !== undefined) data.summary = parsed.data.summary;
    Object.assign(data, markKnowledgeContentUnreviewed(content));
    data.embeddingJson = JSON.stringify(
      await embedText(
        [
          "title" in parsed.data ? parsed.data.title : existing.title,
          "summary" in parsed.data ? parsed.data.summary : existing.summary,
          existing.sector,
          existing.tags,
        ]
          .filter(Boolean)
          .join("\n")
      )
    );
  }

  const project = await db.pastProject.update({
    where: { id },
    data,
  });
  await audit({
    userId: session.user.id,
    action:
      data.reviewStatus === "APPROVED"
        ? "KNOWLEDGE_APPROVE"
        : data.reviewStatus === "REVOKED"
          ? "KNOWLEDGE_REVOKE"
          : "KNOWLEDGE_INVALIDATE",
    resource: "PastProject",
    resourceId: project.id,
    details: {
      approved: project.approved,
      reviewStatus: project.reviewStatus,
      contentHash: project.contentHash,
      ...("reason" in parsed.data
        ? {
            reason: project.revocationReason,
            evidenceRef: project.evidenceRef,
            approvedById: project.reviewedById,
            approvedAt: project.approvedAt?.toISOString(),
            previousContentHash: existing.contentHash,
            revokedById: project.revokedById,
          }
        : {}),
    },
  });
  return NextResponse.json({ project });
}
