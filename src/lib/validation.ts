import { z } from "zod";
import { NextResponse } from "next/server";

/** Zod 4: prefer top-level z.email() over deprecated z.string().email() */
export const emailSchema = z.email();

export const localeSchema = z.enum(["ar", "en"]);

export const agentRunBodySchema = z.object({
  projectId: z.string().min(1),
  locale: localeSchema.optional(),
  tenderType: z.string().min(1).max(64).optional(),
  budget: z.number().nonnegative().nullable().optional(),
});

export const agentCancelBodySchema = z.object({
  runId: z.string().min(1),
});

export const projectCreateSchema = z.object({
  title: z.string().trim().min(1).max(500),
  titleAr: z.string().trim().max(500).nullable().optional(),
  etimadRef: z.string().trim().max(64).optional(),
  category: z.string().trim().min(1).max(64).optional(),
  budget: z.number().nonnegative().nullable().optional(),
  currency: z.string().trim().max(8).optional(),
  submissionDeadline: z
    .union([z.string().min(1), z.null()])
    .optional()
    .transform((v) => (v === "" || v === undefined ? undefined : v)),
  saudizationTarget: z.number().min(0).max(100).optional(),
  localContentTarget: z.number().min(0).max(100).optional(),
});

export const projectPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(500).optional(),
    titleAr: z.string().trim().max(500).nullable().optional(),
    category: z.string().trim().min(1).max(64).optional(),
    budget: z.number().nonnegative().nullable().optional(),
    currency: z.string().trim().max(8).optional(),
    status: z
      .enum(["DRAFT", "PARSING", "DRAFTING", "REVIEW", "SUBMITTED", "ARCHIVED"])
      .optional(),
    saudizationTarget: z.number().min(0).max(100).optional(),
    localContentTarget: z.number().min(0).max(100).optional(),
    submissionDeadline: z.string().datetime().nullable().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: "no allowed fields" });

export const documentPatchSchema = z
  .object({
    docCategory: z.string().min(1).max(64).optional(),
    parseStatus: z.string().min(1).max(32).optional(),
    parsedSummary: z.string().max(20000).optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: "no allowed fields" });

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(10).max(200),
});

export const authPrecheckSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});

export const mfaCredentialSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
  token: z.string().regex(/^\d{6}$/).optional(),
});

export const proposalPatchSchema = z
  .object({
    contentMd: z.string().max(500_000).optional(),
    locale: localeSchema.optional(),
    title: z.string().trim().min(1).max(500).optional(),
    titleAr: z.string().trim().max(500).nullable().optional(),
    changeLog: z.string().max(500).optional(),
  })
  .refine(
    (o) =>
      o.contentMd !== undefined ||
      o.locale !== undefined ||
      o.title !== undefined ||
      o.titleAr !== undefined,
    { message: "contentMd, title, titleAr, or locale required" }
  );

export type AgentRunBody = z.infer<typeof agentRunBodySchema>;
export type ProjectCreateBody = z.infer<typeof projectCreateSchema>;

export const billingCheckoutSchema = z.object({
  planId: z.string().min(1),
  billingCycle: z.enum(["MONTHLY", "YEARLY"]),
  locale: localeSchema.optional(),
});

export const workspaceSwitchSchema = z.object({
  workspaceId: z.string().min(1),
});

export const workspaceInviteSchema = z.object({
  email: emailSchema,
  role: z.enum(["ADMIN", "MEMBER"]).default("MEMBER"),
});

export function zodErrorResponse(error: z.ZodError) {
  return NextResponse.json(
    {
      error: "Validation failed",
      issues: error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    },
    { status: 400 }
  );
}

/** Parse JSON body with Zod; returns data or a NextResponse error */
export async function parseJsonBody<T extends z.ZodType>(
  req: Request,
  schema: T
): Promise<{ ok: true; data: z.infer<T> } | { ok: false; response: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }),
    };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, response: zodErrorResponse(parsed.error) };
  }
  return { ok: true, data: parsed.data };
}
