import { NextRequest } from "next/server";
import { withTenant, jsonOk } from "@/lib/api-controller";
import { getClauseByIdentifier } from "@/lib/clause-library";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;
  return withTenant(
    "session",
    async (ctx) => {
      const identifier = id?.toString() ?? "";
      const clause = await getClauseByIdentifier(identifier, ctx.workspace.id);
      return jsonOk({ clause });
    },
    "clauses:get"
  );
}
