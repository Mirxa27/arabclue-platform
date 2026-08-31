import { z } from "zod";
import { NextResponse } from "next/server";

/** Zod 4: prefer top-level z.email() over deprecated z.string().email() */
export const emailSchema = z.email();

export const localeSchema = z.enum(["ar", "en"]);

export const roleSchema = z.enum([
  "SUPER_ADMIN",
  "ADMIN",
  "BIDDER",
  "REVIEWER",
  "FINANCE",
]);

export const adminAuditQuerySchema = z.object({
  action: z.string().trim().min(1).max(64).optional(),
  severity: z.enum(["INFO", "WARN", "ERROR", "CRITICAL"]).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export const adminUserCreateSchema = z.object({
  email: emailSchema,
  name: z.string().trim().min(1).max(200),
  password: z.string().min(10).max(200),
  role: roleSchema.optional(),
  locale: localeSchema.optional(),
  mfaEnabled: z.boolean().optional(),
});

export const adminUserPatchSchema = z
  .object({
    role: roleSchema.optional(),
    active: z.boolean().optional(),
    mfaEnabled: z.boolean().optional(),
    locale: localeSchema.optional(),
    planId: z.string().min(1).max(64).optional(),
    billingCycle: z.enum(["MONTHLY", "YEARLY"]).optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: "no allowed fields" });

export const adminPlanWriteSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  nameAr: z.string().trim().max(200).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  priceMonthly: z.number().nonnegative().optional(),
  priceYearly: z.number().nonnegative().optional(),
  currency: z.string().trim().max(8).optional(),
  maxProposals: z.number().int().min(-1).optional(),
  maxDocuments: z.number().int().min(-1).optional(),
  maxWorkspaces: z.number().int().min(-1).optional(),
  maxTokensPerMonth: z.number().int().min(-1).optional(),
  maxStorageGb: z.number().int().min(-1).optional(),
  featuresJson: z.string().max(20_000).optional(),
  isActive: z.boolean().optional(),
  isPublic: z.boolean().optional(),
});

export const adminPlanCreateSchema = adminPlanWriteSchema.extend({
  name: z.string().trim().min(1).max(200),
});

export const adminBillingCreateSchema = z.object({
  userId: z.string().min(1),
  type: z.enum(["SUBSCRIPTION", "USAGE", "TOPUP", "REFUND", "OVERAGE"]).optional(),
  amount: z.number().optional(),
  description: z.string().max(2000).optional(),
  tokensIncluded: z.number().int().min(0).optional(),
  proposalsIncluded: z.number().int().min(0).optional(),
  status: z.enum(["PAID", "PENDING", "FAILED", "REFUNDED"]).optional(),
  invoiceNumber: z.string().max(128).optional(),
  paymentMethod: z.string().max(64).optional(),
});

export const adminEnvUpsertSchema = z.object({
  key: z.string().trim().min(1).max(128),
  value: z.string(),
  category: z.string().trim().max(64).optional(),
  description: z.string().max(500).optional(),
  isSecret: z.boolean().optional(),
});

export const adminEnvPatchSchema = z.object({
  rotate: z.boolean().optional(),
  category: z.string().trim().max(64).optional(),
  description: z.string().max(500).optional(),
  isSecret: z.boolean().optional(),
});

export const adminAiProviderWriteSchema = z
  .object({
    name: z.string().max(200).optional(),
    provider: z.string().max(64).optional(),
    modelId: z.string().max(200).optional(),
    apiBase: z.string().max(500).nullable().optional(),
    apiKeyEnvKey: z.string().max(128).nullable().optional(),
    isActive: z.boolean().optional(),
    isDefault: z.boolean().optional(),
    engine: z.string().max(64).nullable().optional(),
  })
  .passthrough();

/** Runtime extras the provider write routes already accept after Zod. */
export type AdminAiProviderWrite = {
  name?: string;
  provider?: string;
  modelId?: string;
  apiBase?: string | null;
  apiKeyEnvKey?: string | null;
  isActive?: boolean;
  isDefault?: boolean;
  engine?: string | null;
  engines?: unknown;
  contextWindow?: number;
  maxTokens?: number;
  supportsVision?: boolean;
  supportsJsonMode?: boolean;
  supportsTools?: boolean;
  temperature?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  confidenceThreshold?: number;
  toxicityFilter?: boolean;
  piiFilter?: boolean;
  hallucinationGuard?: boolean;
  maxRetries?: number;
  timeoutMs?: number;
  inputCostPer1k?: number;
  outputCostPer1k?: number;
  priority?: number;
  modelsCache?: unknown;
  modelsCacheJson?: string | null;
  modelsFetchedAt?: string | Date | null;
};

export const adminAiProviderModelsSchema = z.object({
  provider: z.string().max(64).optional(),
  apiBase: z.string().max(500).nullable().optional(),
  apiKeyEnvKey: z.string().max(128).nullable().optional(),
  providerId: z.string().max(64).optional(),
  refreshAll: z.boolean().optional(),
  cachedOnly: z.boolean().optional(),
  engine: z.string().max(64).nullable().optional(),
});

export const agentRunBodySchema = z.object({
  projectId: z.string().min(1),
  locale: localeSchema.optional(),
  tenderType: z.string().min(1).max(64).optional(),
  budget: z.number().nonnegative().nullable().optional(),
  /** version = update existing proposal; fork = new proposal with lineage */
  regenerateMode: z.enum(["version", "fork"]).optional(),
  targetProposalId: z.string().min(1).optional(),
});

export const proposalRewriteSchema = z.object({
  selection: z.string().max(500_000).optional(),
  instruction: z.string().max(2000).optional(),
  locale: localeSchema.optional(),
  apply: z.boolean().optional(),
  skill: z
    .enum(["rewrite", "expand", "condense", "translate", "redesign", "section"])
    .optional(),
});

/**
 * The co-pilot reviews the editor buffer, which is usually ahead of the saved
 * row, so the live markdown comes in the body and the id is only for authz.
 */
export const copilotSuggestSchema = z.object({
  contentMd: z.string().min(1).max(500_000),
  selection: z.string().max(200_000).optional(),
  /** What the writer typed into the rail. Bounded here, fenced in the prompt. */
  instruction: z.string().trim().min(1).max(2_000).optional(),
  locale: localeSchema.optional(),
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

/** Self-service profile update — at least one field required */
export const profileUpdateSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    email: emailSchema.optional(),
    locale: localeSchema.optional(),
    /** Required when changing email */
    currentPassword: z.string().min(1).optional(),
  })
  .refine(
    (o) =>
      o.name !== undefined || o.email !== undefined || o.locale !== undefined,
    { message: "name, email, or locale required" }
  )
  .refine(
    (o) => o.email === undefined || Boolean(o.currentPassword),
    { message: "currentPassword required to change email", path: ["currentPassword"] }
  );

export const mfaPasswordSchema = z.string().min(1).max(200);

export const mfaTotpSchema = z.string().regex(/^\d{6}$/);

/** TOTP (6 digits) or a recovery code (`xxxxx-xxxxx`). */
export const mfaChallengeTokenSchema = z
  .string()
  .min(6)
  .max(32)
  .refine((value) => /^\d{6}$/.test(value.replace(/\s/g, "")) || /^[0-9a-fA-F]{5}-?[0-9a-fA-F]{5}$/.test(value.replace(/\s/g, "")), {
    message: "MFA token must be a 6-digit TOTP or a recovery code",
  });

export const mfaSetupSchema = z.object({
  password: mfaPasswordSchema,
  currentToken: mfaTotpSchema.optional(),
});

export const mfaVerifySchema = z.object({
  token: mfaTotpSchema,
  password: mfaPasswordSchema,
});

export const mfaDisableSchema = z.object({
  password: mfaPasswordSchema,
  currentToken: mfaChallengeTokenSchema,
});

export const authPrecheckSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});

export const mfaCredentialSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
  token: mfaChallengeTokenSchema.optional(),
});

export const proposalPatchSchema = z
  .object({
    contentMd: z.string().max(500_000).optional(),
    locale: localeSchema.optional(),
    title: z.string().trim().min(1).max(500).optional(),
    titleAr: z.string().trim().max(500).nullable().optional(),
    changeLog: z.string().max(500).optional(),
    expectedVersion: z.number().int().positive(),
    expectedUpdatedAt: z.string().datetime(),
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
  /**
   * `recurring` (default) requires a MyFatoorah recurring profile for
   * MONTHLY/YEARLY plans. `single` explicitly opts into one-cycle checkout
   * without creating a renewal profile.
   */
  billingMode: z.enum(["recurring", "single"]).default("recurring"),
  locale: localeSchema.optional(),
});

export const workspaceSwitchSchema = z.object({
  workspaceId: z.string().min(1),
});

export const workspaceInviteSchema = z.object({
  email: emailSchema,
  role: z.enum(["ADMIN", "MEMBER"]).default("MEMBER"),
});

// Fields a workspace owner/admin can update on the workspace profile.
// Bounds keep raw body from silently writing 100KB strings straight to the
// legal registry columns.
export const workspaceProfileSchema = z
  .object({
    crNumber: z.string().trim().max(50).nullable().optional(),
    vatNumber: z.string().trim().max(50).nullable().optional(),
    name: z.string().trim().min(1).max(200).optional(),
    nameAr: z.string().trim().max(200).nullable().optional(),
  })
  .refine(
    (v) => Object.values(v).some((x) => x !== undefined),
    { message: "At least one field must be provided" }
  );

export const certificateSchema = z.object({
  certType: z.enum(["ISO", "GOSI", "VAT", "ZAKAT", "LICENSE", "OTHER"]),
  name: z.string().trim().min(1).max(300),
  number: z.string().trim().max(100).nullable().optional(),
  issuer: z.string().trim().max(200).nullable().optional(),
  issuedAt: z.string().datetime().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  filePath: z.string().trim().max(500).nullable().optional(),
  alertDays: z.number().int().min(1).max(365).optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  approved: z.boolean().optional(),
  revokedAt: z.string().datetime().nullable().optional(),
});

export const staffMemberSchema = z.object({
  name: z.string().trim().min(1).max(200),
  nameAr: z.string().trim().max(200).nullable().optional(),
  roleTitle: z.string().trim().min(1).max(200),
  roleTitleAr: z.string().trim().max(200).nullable().optional(),
  certifications: z.string().trim().max(2000).nullable().optional(),
  cvSummary: z.string().trim().max(10000).nullable().optional(),
  requirementTags: z.array(z.string().trim().min(1).max(64)).max(50).optional(),
  active: z.boolean().optional(),
});

export const methodologySchema = z.object({
  category: z.enum(["IMPLEMENTATION", "QC", "RISK", "BCP", "OTHER"]),
  title: z.string().trim().min(1).max(300),
  titleAr: z.string().trim().max(300).nullable().optional(),
  bodyMd: z.string().trim().min(1).max(50000),
  approved: z.boolean().optional(),
});

export const libraryItemSchema = z.object({
  title: z.string().trim().min(1).max(300),
  titleAr: z.string().trim().max(300).nullable().optional(),
  category: z
    .enum(["BOILERPLATE", "DIAGRAM", "POLICY", "EXCERPT", "OTHER"])
    .optional(),
  bodyMd: z.string().trim().min(1).max(50000),
  tags: z.string().trim().max(500).nullable().optional(),
  restricted: z.boolean().optional(),
  approved: z.boolean().optional(),
});

export const partnershipSchema = z.object({
  name: z.string().trim().min(1).max(300),
  partnerType: z.enum(["JV", "SUBCONTRACTOR", "OTHER"]),
  scope: z.string().trim().max(5000).nullable().optional(),
  docsNote: z.string().trim().max(5000).nullable().optional(),
  filePath: z.string().trim().max(500).nullable().optional(),
});

export const targetSectorSchema = z.object({
  sector: z.enum(["GOV", "HEALTH", "FINANCE", "ENERGY", "TELECOM", "OTHER"]),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export const bidHistorySchema = z.object({
  entityName: z.string().trim().min(1).max(300),
  sector: z
    .enum(["GOV", "HEALTH", "FINANCE", "ENERGY", "TELECOM", "OTHER"])
    .nullable()
    .optional(),
  outcome: z.enum(["WIN", "LOSS", "WITHDRAWN"]),
  notes: z.string().trim().max(5000).nullable().optional(),
  bidDate: z.string().datetime().nullable().optional(),
});

export const approvalPolicySchema = z.object({
  steps: z
    .array(
      z.object({
        reviewerId: z.string().min(1),
        stepRole: z.enum(["TECHNICAL", "FINAL"]).default("TECHNICAL"),
      })
    )
    .min(1)
    .max(10),
});

export const restrictionSchema = z.object({
  restrictionType: z.enum(["CONFIDENTIAL_CLAUSE", "COMPETITOR_NAME", "OTHER"]),
  text: z.string().trim().min(1).max(2000),
  active: z.boolean().optional(),
});

export const onboardingPatchSchema = z.object({
  restrictionsReviewed: z.boolean().optional(),
  completedSteps: z.record(z.string(), z.boolean()).optional(),
});

export const workspaceLegalSchema = z.object({
  crNumber: z.string().trim().max(64).nullable().optional(),
  vatNumber: z.string().trim().max(64).nullable().optional(),
  name: z.string().trim().min(1).max(200).optional(),
  nameAr: z.string().trim().max(200).nullable().optional(),
});

export const requirementPatchSchema = z.object({
  status: z.enum(["COVERED", "IN_PROGRESS", "MISSING"]).optional(),
  linkedResourceType: z
    .enum(["CERTIFICATE", "STAFF", "PAST_PROJECT", "LIBRARY", "METHODOLOGY"])
    .nullable()
    .optional(),
  linkedResourceId: z.string().min(1).nullable().optional(),
});

export const financialFormsSchema = z.object({
  boqItems: z
    .array(
      z.object({
        item: z.string().trim().min(1).max(500),
        unit: z.string().trim().min(1).max(32),
        qty: z.number().positive(),
        unitPrice: z.number().nonnegative().nullable(),
        total: z.number().nonnegative().nullable(),
      })
    )
    .min(1)
    .max(200),
  currency: z.string().trim().max(8).optional(),
});

export const reviewDecisionSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  comment: z.string().trim().max(5000).nullable().optional(),
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
