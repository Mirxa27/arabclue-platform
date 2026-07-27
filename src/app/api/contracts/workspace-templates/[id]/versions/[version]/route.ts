import { NextRequest } from "next/server";
import { withTenant, jsonOk, jsonError } from "@/lib/api-controller";
import { getTemplateVersion } from "@/lib/contract-template-authoring";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string; version: string }>;
}

export async function GET(
  _request: NextRequest,
  { params }: RouteParams
) {
  return withTenant(
    "session",
    async (ctx) => {
      const { id, version } = await params;

      // A missing relation or domain `ApiError` propagates to `withTenant` for
      // central bilingual mapping (requirements 16.2, 16.7, 19.9).
      const versionContent = await getTemplateVersion({
        workspaceId: ctx.workspace.id,
        templateId: id,
        versionId: version,
      });

      if (!versionContent) {
        return jsonError(
          "Template version not found",
          404,
          "TEMPLATE_VERSION_NOT_FOUND"
        );
      }

      return jsonOk({ version: versionContent });
    },
    "workspace-templates:get-version"
  );
}
