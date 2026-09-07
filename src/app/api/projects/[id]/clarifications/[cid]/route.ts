import { NextRequest } from "next/server";
import { z } from "zod";
import { withTenant, jsonOk, ApiError, parseJsonBody } from "@/lib/api-controller";
import { ClarificationStatusError, patchClarification } from "@/lib/tender-interrogation/repository";
import { CLARIFICATION_STATUSES } from "@/lib/tender-interrogation/types";
import { requireTenantProject } from "../_shared";

export const dynamic = "force-dynamic";

const patchSchema = z
  .object({
    status: z.enum(CLARIFICATION_STATUSES).optional(),
    titleEn: z.string().trim().min(3).max(160).optional(),
    titleAr: z.string().trim().min(3).max(160).optional(),
    questionEn: z.string().trim().min(10).max(1_000).optional(),
    questionAr: z.string().trim().min(10).max(1_000).optional(),
    answerMd: z.string().trim().max(4_000).nullable().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: "empty patch" });

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; cid: string }> }
) {
  return withTenant("writer", async ({ workspace }) => {
    const { id, cid } = await params;
    await requireTenantProject(id, workspace.id);
    const patch = await parseJsonBody(req, patchSchema);
    try {
      const item = await patchClarification({ id: cid, projectId: id, patch });
      if (!item) throw new ApiError("Clarification not found", 404, "CLARIFICATION_NOT_FOUND");
      return jsonOk({ item });
    } catch (error) {
      if (error instanceof ClarificationStatusError) {
        throw new ApiError(error.message, 409, "CLARIFICATION_STATUS_INVALID");
      }
      throw error;
    }
  }, "clarifications/patch");
}
