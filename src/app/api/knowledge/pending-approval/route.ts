import { NextRequest } from "next/server";
import { z } from "zod";
import {
  withTenant,
  jsonOk,
  jsonApiFailure,
  parseSearchParams,
} from "@/lib/api-controller";
import { createPrismaKnowledgeQueueService } from "@/lib/knowledge-queue-prisma";
import { createPrismaKnowledgeDecisionService } from "@/lib/knowledge-decision-prisma";

export const dynamic = "force-dynamic";

const listQuerySchema = z
  .object({
    limit: z.string().regex(/^\d{1,6}$/u).optional(),
    cursor: z.string().min(1).max(4096).optional(),
  })
  .strict();

/**
 * GET /api/knowledge/pending-approval
 * Tenant-scoped, normalized, keyset-paginated approval queue.
 */
export async function GET(request: NextRequest) {
  return withTenant(
    "session",
    async ({ workspace }) => {
      const query = parseSearchParams(request, listQuerySchema);
      const result = await createPrismaKnowledgeQueueService().listPendingQueue({
        workspace: { id: workspace.id },
        pageSize: query.limit,
        cursor: query.cursor,
      });

      if (!result.ok) {
        return jsonApiFailure(result.code, { status: result.status });
      }

      return jsonOk({
        records: result.rows,
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
        total: result.total,
        counts: result.counts,
        pageSize: result.pageSize,
      });
    },
    "knowledge-pending-approval-get"
  );
}

/**
 * Normalize a legacy single `reason` field into bilingual rejection reasons
 * required by the decision service (criterion 11.5).
 */
function normalizeDecisionPayload(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const body = { ...(raw as Record<string, unknown>) };

  // Legacy UI aliases → canonical queue record types.
  if (body.recordType === "LIBRARY") body.recordType = "CONTENT_LIBRARY_ITEM";
  if (body.recordType === "METHODOLOGY") body.recordType = "METHODOLOGY_ASSET";

  if (body.decision === "REJECT") {
    const legacy =
      typeof body.reason === "string" ? body.reason.trim() : "";
    if (
      legacy &&
      (typeof body.reasonAr !== "string" || !String(body.reasonAr).trim())
    ) {
      body.reasonAr = legacy;
    }
    if (
      legacy &&
      (typeof body.reasonEn !== "string" || !String(body.reasonEn).trim())
    ) {
      body.reasonEn = legacy;
    }
  }

  return body;
}

/**
 * POST /api/knowledge/pending-approval
 * First-decision-wins approve/reject via KnowledgeDecisionService.
 */
export async function POST(request: NextRequest) {
  return withTenant(
    "session",
    async ({ workspace, userId, membershipRole }) => {
      const raw = await request.json().catch(() => null);
      const result = await createPrismaKnowledgeDecisionService().decide({
        actor: { userId, membershipRole },
        workspace: { id: workspace.id },
        payload: normalizeDecisionPayload(raw),
      });

      if (!result.ok) {
        if (result.code === "KNOWLEDGE_DECISION_ALREADY_RECORDED") {
          return jsonApiFailure(result.code, {
            status: result.status,
            values: { status: result.decision.status },
          });
        }
        if (result.code === "REJECTION_REASON_INVALID") {
          return jsonApiFailure(result.code, {
            status: result.status,
            fieldPaths: result.fieldPaths,
            values: { language: result.languages.join(",") },
          });
        }
        if (result.code === "REQUEST_VALIDATION_FAILED") {
          return jsonApiFailure(result.code, {
            status: result.status,
            fieldPaths: result.fieldPaths,
            values: { fieldPaths: result.fieldPaths.join(", ") },
          });
        }
        return jsonApiFailure(result.code, { status: result.status });
      }

      return jsonOk({
        ok: true as const,
        decision: result.decision,
      });
    },
    "knowledge-pending-approval-post"
  );
}
