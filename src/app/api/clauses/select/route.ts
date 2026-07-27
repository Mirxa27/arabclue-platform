import { NextRequest } from "next/server";
import { withTenant, jsonOk, jsonApiFailure } from "@/lib/api-controller";
import { selectClausesForTemplate, MAX_CLAUSE_SELECT_IDS } from "@/lib/clause-library";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return withTenant(
    "session",
    async (ctx) => {
      const body = await request.json().catch(() => null);
      if (!body || !Array.isArray(body.clauseIds)) {
        return jsonApiFailure("CLAUSE_FIELD_INVALID");
      }
      const clauseIds = body.clauseIds as string[];
      const templateFamily = body.templateFamily?.toString() ?? undefined;

      if (clauseIds.length > MAX_CLAUSE_SELECT_IDS) {
        return jsonApiFailure("CLAUSE_FIELD_INVALID");
      }

      const result = await selectClausesForTemplate({
        clauseIds,
        templateFamily,
        workspaceId: ctx.workspace.id,
      });

      return jsonOk({
        selected: result.selected,
        mandatory: result.mandatory,
        combined: result.combined,
        count: result.combined.length,
      });
    },
    "clauses:select"
  );
}
