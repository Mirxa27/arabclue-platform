import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isWorkspaceManager } from "@/lib/auth";
import {
  ApiError,
  parseJsonBody,
  parseWithSchema,
  RequestValidationError,
  ResourceNotFoundError,
  withTenant,
} from "@/lib/api-controller";
import { embedText } from "@/lib/llm";
import { checkAiRateLimit } from "@/lib/ai-rate-limit";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
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
  return withTenant(
    "session",
    async ({ workspace, brandProfile }) => {
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
    },
    "[brand GET]"
  );
}

// PATCH /api/brand — update brand profile
export async function PATCH(req: NextRequest) {
  return withTenant(
    "writer",
    async ({ session, workspace, brandProfile }) => {
      if (!brandProfile) {
        throw new ApiError("No brand profile", 400, "NO_BRAND_PROFILE");
      }
      const rawBody = await req.json().catch(() => null);
      const data = validateBrandPatchForWorkspace(rawBody, workspace.id);
      if (!data) {
        // Two unrelated reasons answer null. Re-running the schema raises its
        // own field paths when the schema is what rejected; getting past that
        // line means the body was well-formed and the logo pointed outside this
        // workspace. "Invalid brand update" named neither.
        parseWithSchema(rawBody, brandPatchSchema);
        throw new RequestValidationError(["logoUrl"]);
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
    },
    "[brand PATCH]"
  );
}

// POST /api/brand — add past project with embedding for RAG
export async function POST(req: NextRequest) {
  return withTenant(
    "writer",
    async ({ session, workspace, brandProfile }) => {
      if (!brandProfile) {
        throw new ApiError("No brand profile", 400, "NO_BRAND_PROFILE");
      }
      // Every past project written here is embedded, and PUT re-embeds on edit,
      // so the two handlers share one budget.
      const limited = await checkAiRateLimit({
        route: "brand.embed",
        identifier: workspace.id,
        limit: 20,
        windowMs: 60_000,
      });
      if (limited) return limited;

      const body = await parseJsonBody(req, pastProjectCreateSchema);

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
          embeddingJson: embedding ? JSON.stringify(embedding) : null,
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
    },
    "[brand POST]"
  );
}

/** PUT /api/brand — edit, evidence-approve, or revoke a past project. */
export async function PUT(req: NextRequest) {
  return withTenant(
    "writer",
    async ({ session, workspace, membershipRole }) => {
      const limited = await checkAiRateLimit({
        route: "brand.embed",
        identifier: workspace.id,
        limit: 20,
        windowMs: 60_000,
      });
      if (limited) return limited;

      const body = await parseJsonBody(req, pastProjectUpdateSchema);
      const { id } = body;
      const existing = await db.pastProject.findFirst({
        where: { id, workspaceId: workspace.id },
      });
      if (!existing) {
        throw new ResourceNotFoundError();
      }

      const content = pastProjectKnowledgeContent({
        ...existing,
        title: "title" in body ? body.title ?? existing.title : existing.title,
        summary:
          "summary" in body ? body.summary ?? existing.summary : existing.summary,
      });
      const data: {
        title?: string;
        summary?: string;
        embeddingJson?: string | null;
        approved?: boolean;
        reviewStatus?: "UNREVIEWED" | "APPROVED" | "REVOKED";
        evidenceRef?: string | null;
        evidenceDocumentId?: string | null;
        evidenceVersion?: number | null;
        evidenceChecksum?: string | null;
        provenanceJson?: string | null;
        reviewedById?: string | null;
        approvedAt?: Date | null;
        revokedAt?: Date | null;
        revokedById?: string | null;
        revocationReason?: string | null;
        contentHash?: string;
      } = {};
      if ("approved" in body && body.approved === true) {
        // Not WORKSPACE_ROLE_FORBIDDEN: this caller may write here, and the one
        // thing they cannot do is sign off evidence for a live bid.
        if (!isWorkspaceManager(membershipRole, session.user.role)) {
          throw new ApiError(
            "Approving knowledge evidence requires a workspace manager",
            403,
            "APPROVAL_FORBIDDEN"
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
          Object.assign(
            data,
            approveKnowledgeContent({
              evidence,
              reviewerId: session.user.id,
              content,
            })
          );
        } catch {
          throw new ApiError(
            "Approval evidence could not be resolved",
            400,
            "KNOWLEDGE_EVIDENCE_INVALID"
          );
        }
      } else if ("approved" in body && body.approved === false) {
        if (!isWorkspaceManager(membershipRole, session.user.role)) {
          throw new ApiError(
            "Revoking knowledge evidence requires a workspace manager",
            403,
            "APPROVAL_FORBIDDEN"
          );
        }
        try {
          Object.assign(
            data,
            revokeKnowledgeContent({
              request: body,
              content,
              previous: existing,
              revokerId: session.user.id,
            })
          );
        } catch {
          throw new ApiError(
            "Revocation requires approved evidence and a reason",
            400,
            "KNOWLEDGE_REVOCATION_INVALID"
          );
        }
      } else {
        if (body.title !== undefined) data.title = body.title;
        if (body.summary !== undefined) data.summary = body.summary;
        Object.assign(data, markKnowledgeContentUnreviewed(content));
        const reembedded = await embedText(
          [
            "title" in body ? body.title : existing.title,
            "summary" in body ? body.summary : existing.summary,
            existing.sector,
            existing.tags,
          ]
            .filter(Boolean)
            .join("\n")
        );
        // Null clears the stale vector rather than pinning it to the old text.
        data.embeddingJson = reembedded ? JSON.stringify(reembedded) : null;
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
          ...("reason" in body
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
    },
    "[brand PUT]"
  );
}
