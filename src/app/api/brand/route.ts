import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSession, requireWriter } from "@/lib/auth";
import { embedText } from "@/lib/llm";
import { audit, AUDIT_ACTIONS } from "@/lib/audit";
import { getTenantContext } from "@/lib/workspace-context";
import {
  DOCUMENT_BRAND_FONT_FAMILIES,
  extractLogoStoragePath,
} from "@/lib/brand-logo";
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
const revocationTimestampSchema = z
  .string()
  .trim()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/,
    "Expected a UTC ISO-8601 timestamp"
  )
  .refine((value) => Number.isFinite(Date.parse(value)), "Invalid timestamp");

/**
 * A writer may withdraw or edit a claim, but cannot approve or un-revoke it.
 * Content edits automatically return the record to the unapproved state.
 */
export const pastProjectUpdateSchema = z
  .object({
    id: z.string().trim().min(1).max(200),
    approved: z.literal(false).optional(),
    revokedAt: revocationTimestampSchema.optional(),
    title: pastProjectTextSchema.max(500).optional(),
    summary: pastProjectTextSchema.optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.approved === false ||
      value.revokedAt !== undefined ||
      value.title !== undefined ||
      value.summary !== undefined,
    { message: "At least one project field is required" }
  );

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
  return NextResponse.json({ brandProfile, company, pastProjects });
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
  const body = await req.json();
  if (!body.title || !body.summary) {
    return NextResponse.json({ error: "title and summary are required" }, { status: 400 });
  }

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
      // User-entered claims are not evidence. A future provenance workflow
      // must explicitly verify them before RAG/export eligibility.
      approved: false,
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

/** PUT /api/brand — update past project approval / revoke */
export async function PUT(req: NextRequest) {
  const session = await requireWriter();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { workspace } = await getTenantContext(session.user.id);
  const body: unknown = await req.json().catch(() => null);
  if (
    body &&
    typeof body === "object" &&
    ("approved" in body &&
      (body as { approved?: unknown }).approved === true ||
      "revokedAt" in body &&
        (body as { revokedAt?: unknown }).revokedAt === null)
  ) {
    return NextResponse.json(
      {
        error:
          "Approval restoration requires verified evidence and provenance.",
      },
      { status: 409 }
    );
  }
  const parsed = pastProjectUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid past project update" },
      { status: 400 }
    );
  }
  const { id, ...update } = parsed.data;
  const existing = await db.pastProject.findFirst({
    where: { id, workspaceId: workspace.id },
  });
  if (!existing) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const data: {
    approved?: boolean;
    revokedAt?: Date;
    title?: string;
    summary?: string;
  } = {};
  if (update.approved === false) data.approved = false;
  if (update.revokedAt) data.revokedAt = new Date(update.revokedAt);
  if (update.title !== undefined) data.title = update.title;
  if (update.summary !== undefined) data.summary = update.summary;
  if (update.title !== undefined || update.summary !== undefined) {
    data.approved = false;
  }

  const project = await db.pastProject.update({
    where: { id },
    data,
  });
  await audit({
    userId: session.user.id,
    action: "PAST_PROJECT_UPDATE",
    resource: "PastProject",
    resourceId: project.id,
    details: { approved: project.approved, revokedAt: project.revokedAt },
  });
  return NextResponse.json({ project });
}
