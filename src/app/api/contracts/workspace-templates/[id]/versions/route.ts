import { NextRequest } from "next/server";
import { withTenant, jsonOk, jsonError } from "@/lib/api-controller";
import {
  listTemplateVersions,
  workspaceTemplateVersionListQuerySchema,
} from "@/lib/contract-template-authoring";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  return withTenant(
    "session",
    async (ctx) => {
      const { id } = await params;
      const url = new URL(request.url);
      const parseResult = workspaceTemplateVersionListQuerySchema.safeParse({
        limit: url.searchParams.get("limit") ?? undefined,
        cursor: url.searchParams.get("cursor") ?? undefined,
      });

      if (!parseResult.success) {
        return jsonError(
          parseResult.error.issues[0]?.message ?? "Invalid query parameters",
          400,
          "INVALID_QUERY_PARAMS"
        );
      }

      // A missing relation or domain `ApiError` propagates to `withTenant` for
      // central bilingual mapping (requirements 16.2, 16.7, 19.9).
      const result = await listTemplateVersions({
        workspaceId: ctx.workspace.id,
        templateId: id,
        limit: parseResult.data.limit,
        cursor: parseResult.data.cursor,
      });

      return jsonOk({
        versions: result.versions,
        nextCursor: result.nextCursor,
        count: result.versions.length,
      });
    },
    "workspace-templates:list-versions"
  );
}
