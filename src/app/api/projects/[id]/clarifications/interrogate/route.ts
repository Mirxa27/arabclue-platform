import { NextRequest } from "next/server";
import { z } from "zod";
import { withTenant, jsonOk, ApiError, parseJsonBody } from "@/lib/api-controller";
import { checkAiRateLimit } from "@/lib/ai-rate-limit";
import { assertWithinQuota } from "@/lib/quotas";
import { interrogateTender, NoTenderTextError } from "@/lib/ai/tender-interrogation";
import { requireTenantProject } from "../_shared";

export const dynamic = "force-dynamic";
/** Up to six model windows through a pool of two, each with a 90 s budget. */
export const maxDuration = 300;

const bodySchema = z
  .object({
    locale: z.enum(["ar", "en"]).optional().default("ar"),
    /** `false` runs the rule-based pass only. */
    withModel: z.boolean().optional().default(true),
  })
  .default({ locale: "ar", withModel: true });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withTenant("writer", async ({ workspace, userId }) => {
    const { id } = await params;
    const project = await requireTenantProject(id, workspace.id);
    const blocked = await checkAiRateLimit({
      route: "ai.tender-interrogate",
      identifier: workspace.id,
      limit: 6,
      windowMs: 60_000,
    });
    if (blocked) return blocked;
    const body = await parseJsonBody(req, bodySchema).catch(() => bodySchema.parse(undefined));
    if (body.withModel) await assertWithinQuota(userId, "tokens");
    try {
      const result = await interrogateTender({
        projectId: id,
        workspaceId: workspace.id,
        userId,
        locale: body.locale,
        project: { title: project.title, etimadRef: project.etimadRef },
        withModel: body.withModel,
      });
      return jsonOk(result);
    } catch (error) {
      if (error instanceof NoTenderTextError) {
        throw new ApiError(error.message, 409, "NO_TENDER_TEXT");
      }
      throw error;
    }
  }, "clarifications/interrogate");
}
