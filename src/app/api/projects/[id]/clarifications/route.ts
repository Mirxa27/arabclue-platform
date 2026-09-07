import { NextRequest } from "next/server";
import { z } from "zod";
import { withTenant, jsonOk, parseJsonBody } from "@/lib/api-controller";
import {
  createUserQuestion,
  listClarifications,
  summarizeClarifications,
} from "@/lib/tender-interrogation/repository";
import { CLARIFICATION_SEVERITIES } from "@/lib/tender-interrogation/types";
import { requireTenantProject } from "./_shared";

export const dynamic = "force-dynamic";

/** The project's clarifications with the clarity summary and the last run's provenance. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withTenant("session", async ({ workspace }) => {
    const { id } = await params;
    await requireTenantProject(id, workspace.id);
    const items = await listClarifications(id);
    const lastRun = items.reduce<string | null>((latest, i) => {
      if (i.provenance === "USER_AUTHORED") return latest;
      return !latest || i.updatedAt > latest ? i.updatedAt : latest;
    }, null);
    const aiRow = items.find((i) => i.provenance === "AI_GENERATED");
    return jsonOk({
      items,
      summary: summarizeClarifications(items),
      lastRunAt: lastRun,
      lastProvider: aiRow
        ? { provider: String(aiRow.provenanceDetail.provider ?? ""), model: String(aiRow.provenanceDetail.model ?? "") }
        : null,
    });
  }, "clarifications");
}

const createSchema = z.object({
  titleEn: z.string().trim().min(3).max(160),
  titleAr: z.string().trim().min(3).max(160),
  questionEn: z.string().trim().min(10).max(1_000),
  questionAr: z.string().trim().min(10).max(1_000),
  severity: z.enum(CLARIFICATION_SEVERITIES).optional(),
});

/** A question the team writes itself; it is kept on creation. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withTenant("writer", async ({ workspace, userId }) => {
    const { id } = await params;
    await requireTenantProject(id, workspace.id);
    const body = await parseJsonBody(req, createSchema);
    const item = await createUserQuestion({ projectId: id, workspaceId: workspace.id, userId, ...body });
    return jsonOk({ item }, { status: 201 });
  }, "clarifications");
}
